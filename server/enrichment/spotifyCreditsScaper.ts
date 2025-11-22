import { Browser, Page } from "puppeteer";
import { addToQueue, getQueue, cleanupQueue, waitForQueueIdle } from "./puppeteerQueue";
import { normalizeCreditList } from "./creditNormalization";

// Safety net: cleanup on process exit
let exitHandlerRegistered = false;
function registerExitHandler() {
  if (exitHandlerRegistered) return;
  exitHandlerRegistered = true;
  
  process.on('exit', () => {
    console.log('[Phase 2] Process exit detected, emergency cleanup');
  });
  
  process.on('SIGINT', async () => {
    console.log('[Phase 2] SIGINT detected, cleanup...');
    await cleanupQueue();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('[Phase 2] SIGTERM detected, cleanup...');
    await cleanupQueue();
    process.exit(0);
  });
}

interface TrackCredits {
  writers: string[];
  composers: string[];
  producers: string[];
  labels: string[];
  publishers: string[];
}

interface TrackEnrichmentData {
  trackId: string;
  spotifyUrl: string;
  songwriter?: string | null;
  producer?: string | null;
  publisher?: string | null;
  label?: string | null;
  spotifyStreams?: number | null;
}

export interface CreditsEnrichmentResult {
  success: boolean;
  tracksProcessed: number;
  tracksEnriched: number;
  errors: number;
  enrichedTracks: TrackEnrichmentData[];
  errorDetails: Array<{ trackId: string; error: string }>;
}

/**
 * Parse stream count from various formats: "1,234,567", "1.2M", "45K", "1.2B"
 */
function parseStreamCount(text: string): number | null {
  if (!text) return null;

  const cleaned = text.trim().replace(/,/g, "");

  // Match abbreviated format (1.2M, 45K, 1.2B)
  const shortMatch = cleaned.match(/^([\d.]+)\s*([KMB])$/i);
  if (shortMatch) {
    const value = parseFloat(shortMatch[1]);
    const suffix = shortMatch[2].toUpperCase();
    
    if (isNaN(value)) return null;
    
    switch (suffix) {
      case "K": return Math.round(value * 1e3);
      case "M": return Math.round(value * 1e6);
      case "B": return Math.round(value * 1e9);
    }
  }

  // Match numeric format (1234567)
  const numMatch = cleaned.match(/^(\d+)$/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (!isNaN(num) && num >= 100 && num < 1e12) {
      return num;
    }
  }

  return null;
}

/**
 * Extract credits and stream count from a single track page
 */
async function scrapeTrackCredits(
  browser: Browser,
  trackId: string,
  trackUrl: string
): Promise<TrackEnrichmentData> {
  const queue = getQueue();
  const page = await queue.createPage(browser);
  
  try {
    const telemetry = { step: '', elapsed: 0, startTime: Date.now() };
    
    // Set default timeouts
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Navigate to track page (FAST: domcontentloaded instead of networkidle2)
    telemetry.step = 'navigate';
    console.log(`[Scraper] ${trackId}: Navigating to ${trackUrl}`);
    await page.goto(trackUrl, { 
      waitUntil: "domcontentloaded", 
      timeout: 15000 
    });
    telemetry.elapsed = Date.now() - telemetry.startTime;
    console.log(`[Scraper] ${trackId}: ✓ Page loaded (${telemetry.elapsed}ms)`);

    // Handle cookie consent banner
    telemetry.step = 'cookies';
    await handleCookieConsent(page);
    telemetry.elapsed = Date.now() - telemetry.startTime;
    console.log(`[Scraper] ${trackId}: ✓ Cookies handled (${telemetry.elapsed}ms)`);

    // Wait for critical selectors with early bailout
    telemetry.step = 'selectors';
    const selectorTimeout = 10000; // 10s early bailout
    try {
      await Promise.race([
        page.waitForSelector('body', { timeout: selectorTimeout }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Critical selectors timeout')), selectorTimeout)
        )
      ]);
      telemetry.elapsed = Date.now() - telemetry.startTime;
      console.log(`[Scraper] ${trackId}: ✓ Critical selectors loaded (${telemetry.elapsed}ms)`);
    } catch (error: any) {
      telemetry.elapsed = Date.now() - telemetry.startTime;
      console.warn(`[Scraper] ${trackId}: ⚠ Selector wait failed after ${telemetry.elapsed}ms, proceeding anyway`);
    }

    // Short delay for dynamic content
    await new Promise(resolve => setTimeout(resolve, 1000));

    // PHASE 1: Extract stream count from main page
    telemetry.step = 'streams';
    const spotifyStreams = await extractStreamCount(page);
    telemetry.elapsed = Date.now() - telemetry.startTime;
    console.log(`[Scraper] ${trackId}: ${spotifyStreams ? `✓ Streams found: ${spotifyStreams.toLocaleString()}` : '⚠ No streams found'} (${telemetry.elapsed}ms)`);

    // PHASE 2: Extract credits
    telemetry.step = 'credits';
    const credits = await extractCredits(page, trackId, telemetry);
    telemetry.elapsed = Date.now() - telemetry.startTime;
    const creditsCount = credits.writers.length + credits.producers.length + credits.publishers.length + credits.labels.length;
    console.log(`[Scraper] ${trackId}: ${creditsCount > 0 ? `✓ Found ${creditsCount} credits` : '⚠ No credits found'} (${telemetry.elapsed}ms)`);

    await page.close();
    console.log(`[Scraper] ${trackId}: ✅ Complete in ${telemetry.elapsed}ms`);

    // Convert arrays to comma-separated strings
    return {
      trackId,
      spotifyUrl: trackUrl,
      songwriter: credits.writers.length > 0 ? credits.writers.join(", ") : null,
      producer: credits.producers.length > 0 ? credits.producers.join(", ") : null,
      publisher: credits.publishers.length > 0 ? credits.publishers.join(", ") : null,
      label: credits.labels.length > 0 ? credits.labels.join(", ") : null,
      spotifyStreams,
    };
  } catch (error: any) {
    await page.close();
    throw error;
  }
}

/**
 * Handle cookie consent banner
 */
async function handleCookieConsent(page: Page): Promise<void> {
  try {
    const consentSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="onetrust-accept"]',
      'button[aria-label*="Accept"]',
      'button[aria-label*="accept"]',
      '[data-testid="accept-all-cookies"]',
      'button[id*="accept"]',
    ];
    
    for (const selector of consentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.click(selector);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return;
      } catch (e) {
        // Try next selector
      }
    }
  } catch (error) {
    // Consent not found or already handled
  }
}

/**
 * Extract stream count from track page
 */
async function extractStreamCount(page: Page): Promise<number | null> {
  try {
    // Try selector-based extraction first (more reliable)
    const streamCountScript = `
      (function() {
        // Try data-testid selector
        const playcountEl = document.querySelector('[data-testid="playcount"]');
        if (playcountEl) {
          return playcountEl.textContent || playcountEl.innerText;
        }
        
        // Try aria-label containing "streams"
        const ariaEl = document.querySelector('[aria-label*="streams" i]');
        if (ariaEl) {
          const ariaLabel = ariaEl.getAttribute('aria-label');
          if (ariaLabel) {
            const match = ariaLabel.match(/([\\d,.]+)\\s*(K|M|B)?\\s*streams?/i);
            if (match) return match[0];
          }
        }
        
        // Fallback: Look for stream count near track duration (M:SS pattern)
        const bodyText = document.body.innerText;
        const lines = bodyText.split('\\n').map(l => l.trim());
        const durationPattern = /\\d{1,2}:\\d{2}/;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (durationPattern.test(line)) {
            // Match numeric format: "3:15 • 13,343"
            const streamMatch = line.match(/\\d{1,2}:\\d{2}[^\\d]*?([\\d,]+)/);
            if (streamMatch && streamMatch[1]) {
              return streamMatch[1];
            }
            
            // Match abbreviated format: "3:15 • 1.2M"
            const shortMatch = line.match(/\\d{1,2}:\\d{2}[^\\d]*?([\\d.]+\\s*[KMB])/i);
            if (shortMatch) {
              return shortMatch[1];
            }
          }
        }
        
        return null;
      })();
    `;
    
    const rawText = await page.evaluate(streamCountScript);
    
    // Parse the extracted text using parseStreamCount
    if (rawText) {
      return parseStreamCount(rawText as string);
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract credits from track page
 */
async function extractCredits(
  page: Page, 
  trackId: string, 
  telemetry: { step: string; elapsed: number; startTime: number }
): Promise<TrackCredits> {
  // Check if Credits section is visible
  let creditsFound = await page.evaluate(() => {
    const allElements = document.querySelectorAll('div, section');
    return Array.from(allElements).some((el) => {
      const text = el.textContent || '';
      return text.includes('Credits') && text.length < 100;
    });
  });

  // If not visible, try opening via 3-dot menu
  if (!creditsFound) {
    try {
      console.log(`[Scraper] ${trackId}: Searching for credits menu...`);
      const menuButton = await page.$('button[aria-label*="More options"], button[data-testid="more-button"]');
      if (menuButton) {
        await menuButton.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const creditsClicked = await page.evaluate(() => {
          const allButtons = document.querySelectorAll('button, [role="menuitem"]');
          for (const btn of Array.from(allButtons)) {
            const text = btn.textContent || '';
            if (text.toLowerCase().includes('view credits') || text.toLowerCase().includes('credits')) {
              if (btn instanceof HTMLElement) {
                btn.click();
              }
              return true;
            }
          }
          return false;
        });
        
        if (creditsClicked) {
          console.log(`[Scraper] ${trackId}: Credits menu opened, waiting for modal...`);
          
          // Wait for credits modal with updated Spotify UI selectors (post-August 2024)
          try {
            await Promise.race([
              page.waitForSelector('[data-testid="credits-modal"], [role="dialog"]', { timeout: 10000 }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Credits modal timeout')), 10000)
              )
            ]);
            creditsFound = true;
            console.log(`[Scraper] ${trackId}: ✓ Credits modal loaded`);
          } catch (error) {
            console.warn(`[Scraper] ${trackId}: ⚠ Credits modal failed to load, proceeding with page scan`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    } catch (error: any) {
      console.warn(`[Scraper] ${trackId}: ⚠ Credits menu interaction failed: ${error.message}`);
    }
  }

  if (!creditsFound) {
    console.log(`[Scraper] ${trackId}: ⚠ No credits section found`);
    return {
      writers: [],
      composers: [],
      producers: [],
      labels: [],
      publishers: [],
    };
  }

  // Inject authoritative name-splitting utility
  const nameSplitScript = `
    window.normalizeCreditList = function(rawText) {
      if (!rawText || typeof rawText !== 'string') return [];
      let text = rawText.trim();
      if (!text) return [];
      text = text.replace(/&/g, ',').replace(/\//g, ',').replace(/\\|/g, ',').replace(/;/g, ',').replace(/\\n/g, ',').replace(/\\s{2,}/g, ' ');
      text = text.replace(/([a-z])([A-Z])/g, (m, l, u) => {
        const before = text.substring(Math.max(0, text.indexOf(m) - 3), text.indexOf(m) + 1);
        const after = text.substring(text.indexOf(m), Math.min(text.length, text.indexOf(m) + 5));
        const isMulti = /Mc[a-z]|Mac[a-z]|O'[a-z]|St\\.[a-z]|Van[a-z]|De[a-z]|Von[a-z]|La[a-z]|Le[a-z]/.test(after);
        return isMulti ? m : l + ', ' + u;
      });
      const parts = text.split(/,|\\n|;/).map(p => p.trim()).filter(p => p.length > 0);
      const cleaned = parts.map(name => {
        name = name.trim().replace(/\\s+/g, ' ');
        name = name.split(' ').map((w, i) => w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
        return name;
      }).filter(n => n.length >= 2 && (n.includes(' ') || n.length >= 3));
      const seen = new Set();
      const result = [];
      for (const name of cleaned) {
        const norm = name.toLowerCase();
        if (!seen.has(norm)) { seen.add(norm); result.push(name); }
      }
      return result;
    };
  `;
  
  await page.evaluate(nameSplitScript);

  // Extract credits with enhanced debugging
  const credits = await page.evaluate(() => {
    const writers: string[] = [];
    const composers: string[] = [];
    const producers: string[] = [];
    const labels: string[] = [];
    const publishers: string[] = [];
    
    // Strategy 1: Try to parse structured <dl> elements from the credits modal (new Spotify UI)
    const creditsModal = document.querySelector('[data-testid="credits-modal"]');
    if (creditsModal) {
      console.log('[DEBUG] Found credits modal with data-testid, attempting structured parsing...');
      
      const dlElements = creditsModal.querySelectorAll('dl');
      dlElements.forEach((dl) => {
        const dtElements = dl.querySelectorAll('dt');
        const ddElements = dl.querySelectorAll('dd');
        
        for (let i = 0; i < dtElements.length; i++) {
          const role = (dtElements[i]?.textContent || '').toLowerCase().trim();
          const names = (ddElements[i]?.textContent || '').trim();
          
          if (!names) continue;
          
          const nameList = names.split(',').map(n => n.trim()).filter(Boolean);
          const processedNames: string[] = [];
          
          for (const name of nameList) {
            const splitResult = (window as any).normalizeCreditList(name);
            processedNames.push(...splitResult);
          }
          
          if (role.includes('written') || role.includes('songwriter') || role.includes('writer')) {
            console.log('[DEBUG] DL: Found writers -', role, ':', processedNames);
            writers.push(...processedNames);
          } else if (role.includes('produced') || role.includes('producer')) {
            console.log('[DEBUG] DL: Found producers -', role, ':', processedNames);
            producers.push(...processedNames);
          } else if (role.includes('composer')) {
            console.log('[DEBUG] DL: Found composers -', role, ':', processedNames);
            composers.push(...processedNames);
          } else if (role.includes('publisher')) {
            console.log('[DEBUG] DL: Found publishers -', role, ':', processedNames);
            publishers.push(...processedNames);
          } else if (role.includes('label') || role.includes('source')) {
            console.log('[DEBUG] DL: Found labels -', role, ':', processedNames);
            labels.push(...processedNames);
          }
        }
      });
    }
    
    // Strategy 2: Fallback to text-based parsing (works for both old and new UI)
    const allText = document.body.innerText;
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
    
    // DEBUG: Log first 50 lines to see what we're working with
    console.log('[DEBUG] First 50 lines of page text:', lines.slice(0, 50));
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';
      
      // Written by / Songwriter
      if (line.toLowerCase().includes('written by') || line.toLowerCase().includes('songwriter')) {
        console.log('[DEBUG] Found writer label:', line, '-> next line:', nextLine);
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const segments = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          const finalNames: string[] = [];
          
          for (const segment of segments) {
            const splitResult = (window as any).splitConcatenatedNames(segment);
            finalNames.push(...splitResult);
          }
          
          console.log('[DEBUG] Extracted writers:', finalNames);
          writers.push(...finalNames);
        }
      }
      
      // Produced by / Producer
      if (line.toLowerCase().includes('produced by') || line.toLowerCase().includes('producer')) {
        console.log('[DEBUG] Found producer label:', line, '-> next line:', nextLine);
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const segments = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          const finalNames: string[] = [];
          
          for (const segment of segments) {
            const splitResult = (window as any).splitConcatenatedNames(segment);
            finalNames.push(...splitResult);
          }
          
          console.log('[DEBUG] Extracted producers:', finalNames);
          producers.push(...finalNames);
        }
      }
      
      // Composer
      if (line.toLowerCase().includes('composer')) {
        console.log('[DEBUG] Found composer label:', line, '-> next line:', nextLine);
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const segments = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          const finalNames: string[] = [];
          
          for (const segment of segments) {
            const splitResult = (window as any).splitConcatenatedNames(segment);
            finalNames.push(...splitResult);
          }
          
          console.log('[DEBUG] Extracted composers:', finalNames);
          composers.push(...finalNames);
        }
      }
      
      // Source (Label)
      if (line.toLowerCase().startsWith('source:')) {
        const labelName = line.replace(/source:/i, '').trim();
        console.log('[DEBUG] Found label source:', labelName);
        if (labelName) labels.push(labelName);
      }
      
      // Publisher
      if (line.toLowerCase().includes('publisher') && !line.toLowerCase().startsWith('source:')) {
        console.log('[DEBUG] Found publisher label:', line, '-> next line:', nextLine);
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const names = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          console.log('[DEBUG] Extracted publishers:', names);
          publishers.push(...names);
        }
      }
    }
    
    console.log('[DEBUG] Final credits:', { writers, composers, producers, labels, publishers });
    
    return {
      writers: Array.from(new Set(writers)),
      composers: Array.from(new Set(composers)),
      producers: Array.from(new Set(producers)),
      labels: Array.from(new Set(labels)),
      publishers: Array.from(new Set(publishers)),
    };
  });

  return credits;
}

/**
 * Batch enrich tracks with credits and stream counts using Puppeteer queue
 */
export async function enrichTracksWithCredits(
  tracks: Array<{ id: string; spotifyUrl: string; songwriter?: string | null; spotifyStreams?: number | null }>,
  options: { skipQueueWait?: boolean } = {}
): Promise<CreditsEnrichmentResult> {
  const result: CreditsEnrichmentResult = {
    success: true,
    tracksProcessed: 0,
    tracksEnriched: 0,
    errors: 0,
    enrichedTracks: [],
    errorDetails: [],
  };

  // Filter tracks that need enrichment (missing songwriter OR stream count)
  const tracksNeedingEnrichment = tracks.filter(
    (t) => !t.songwriter || !t.spotifyStreams
  );

  if (tracksNeedingEnrichment.length === 0) {
    console.log("[Phase 2] No tracks need credits enrichment");
    return result;
  }

  // Configuration via environment variables with sensible defaults
  const MAX_BATCH_SIZE = parseInt(process.env.SCRAPER_MAX_BATCH_SIZE || '100', 10);
  const MAX_CONCURRENCY = parseInt(process.env.SCRAPER_MAX_CONCURRENCY || '2', 10);
  const MIN_DELAY_MS = parseInt(process.env.SCRAPER_MIN_DELAY_MS || '1000', 10);
  const BROWSER_POOL_SIZE = parseInt(process.env.SCRAPER_BROWSER_POOL_SIZE || '2', 10);
  const TRACK_TIMEOUT = parseInt(process.env.SCRAPER_TRACK_TIMEOUT_MS || '45000', 10);
  const CHUNK_SIZE = parseInt(process.env.SCRAPER_CHUNK_SIZE || '2', 10);

  // Limit batch size to prevent overwhelming the queue
  const batchSize = Math.min(tracksNeedingEnrichment.length, MAX_BATCH_SIZE);
  const batch = tracksNeedingEnrichment.slice(0, batchSize);

  console.log(`[Phase 2] Enriching ${batch.length} tracks with credits and stream counts...`);
  console.log(`[Phase 2] Config: concurrency=${MAX_CONCURRENCY}, browsers=${BROWSER_POOL_SIZE}, timeout=${TRACK_TIMEOUT}ms, chunk=${CHUNK_SIZE}`);

  // Register exit handlers for safety
  registerExitHandler();

  // Initialize queue with controlled concurrency for better throughput
  const queue = getQueue({
    maxConcurrency: MAX_CONCURRENCY,
    minDelay: MIN_DELAY_MS,
    browserPoolSize: BROWSER_POOL_SIZE,
  });

  try {
    // Process tracks in chunks to limit memory pressure
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      console.log(`[Phase 2] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(batch.length / CHUNK_SIZE)} (${chunk.length} tracks)`);

      // Process chunk in parallel with timeout guards
      await Promise.all(
        chunk.map(async (track) => {
          let timeoutId: NodeJS.Timeout | null = null;
          try {
            // Wrap scrape in timeout guard
            const scrapePromise = addToQueue(
              `track-${track.id}`,
              async (browser) => {
                return await scrapeTrackCredits(browser, track.id, track.spotifyUrl);
              },
              0 // Default priority
            );

            // Attach catch handler to absorb late rejections
            scrapePromise.catch((err) => {
              console.warn(`[Phase 2] Late rejection for track ${track.id}:`, err.message);
            });

            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error(`Timeout after ${TRACK_TIMEOUT}ms`)), TRACK_TIMEOUT);
            });

            const enrichedData = await Promise.race([scrapePromise, timeoutPromise]);

            // Clear timeout on success
            if (timeoutId) clearTimeout(timeoutId);

            result.tracksProcessed++;
            
            // Only count as enriched if we got new data
            if (
              enrichedData.songwriter ||
              enrichedData.producer ||
              enrichedData.publisher ||
              enrichedData.label ||
              enrichedData.spotifyStreams
            ) {
              result.tracksEnriched++;
              result.enrichedTracks.push(enrichedData);
            }
          } catch (error: any) {
            // Clear timeout on error
            if (timeoutId) clearTimeout(timeoutId);
            
            result.errors++;
            result.errorDetails.push({
              trackId: track.id,
              error: error.message || "Unknown error",
            });
            console.error(`[Phase 2] Error enriching track ${track.id}:`, error.message);
          }
        })
      );
    }

    console.log(
      `[Phase 2] Complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched, ${result.errors} errors`
    );
  } finally {
    // Wait for queue to drain ONLY if not in manual mode (prevents deadlock with background worker)
    if (!options.skipQueueWait) {
      const startDrain = Date.now();
      console.log(`[Phase 2] Waiting for queue to drain...`);
      await waitForQueueIdle();
      console.log(`[Phase 2] Queue drained in ${Date.now() - startDrain}ms`);
    } else {
      console.log(`[Phase 2] Skipping queue drain wait (manual mode - background jobs may still be running)`);
    }
    
    // ALWAYS cleanup browsers to prevent resource leaks
    const startCleanup = Date.now();
    console.log(`[Phase 2] Cleaning up Puppeteer queue...`);
    await cleanupQueue();
    console.log(`[Phase 2] Cleanup complete in ${Date.now() - startCleanup}ms`);
  }

  return result;
}
