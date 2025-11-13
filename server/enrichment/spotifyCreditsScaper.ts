import { Browser, Page } from "puppeteer";
import { addToQueue, getQueue } from "./puppeteerQueue";

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
    // Set default timeouts
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Navigate to track page
    try {
      await page.goto(trackUrl, { 
        waitUntil: "networkidle2", 
        timeout: 30000 
      });
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        await page.goto(trackUrl, { 
          waitUntil: "domcontentloaded", 
          timeout: 15000 
        });
      } else {
        throw error;
      }
    }

    // Handle cookie consent banner
    await handleCookieConsent(page);
    await new Promise(resolve => setTimeout(resolve, 1500));

    // PHASE 1: Extract stream count from main page
    const spotifyStreams = await extractStreamCount(page);

    // PHASE 2: Extract credits
    const credits = await extractCredits(page);

    await page.close();

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
    const streamCountScript = `
      (function() {
        const bodyText = document.body.innerText;
        const lines = bodyText.split('\\n').map(l => l.trim());
        
        // Look for stream count near track duration (M:SS pattern)
        const durationPattern = /\\d{1,2}:\\d{2}/;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (durationPattern.test(line)) {
            // Match numeric format: "3:15 • 13,343"
            const streamMatch = line.match(/\\d{1,2}:\\d{2}[^\\d]*?([\\d,]+)/);
            if (streamMatch && streamMatch[1]) {
              const num = parseInt(streamMatch[1].replace(/,/g, ''), 10);
              if (num >= 100 && num < 1e12) {
                return num;
              }
            }
            
            // Match abbreviated format: "3:15 • 1.2M"
            const shortMatch = line.match(/\\d{1,2}:\\d{2}[^\\d]*?([\\d.]+)\\s*([KMB])/i);
            if (shortMatch) {
              const value = parseFloat(shortMatch[1]);
              const suffix = shortMatch[2].toUpperCase();
              if (suffix === 'M') return Math.round(value * 1e6);
              if (suffix === 'K') return Math.round(value * 1e3);
              if (suffix === 'B') return Math.round(value * 1e9);
            }
          }
        }
        
        return null;
      })();
    `;
    
    const result = await page.evaluate(streamCountScript);
    return result as number | null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract credits from track page
 */
async function extractCredits(page: Page): Promise<TrackCredits> {
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
          await new Promise(resolve => setTimeout(resolve, 2000));
          creditsFound = true;
        }
      }
    } catch (error) {
      // Continue without credits
    }
  }

  if (!creditsFound) {
    return {
      writers: [],
      composers: [],
      producers: [],
      labels: [],
      publishers: [],
    };
  }

  // Inject name-splitting utility
  const nameSplitScript = `
    window.splitConcatenatedNames = function(fullName) {
      if (!fullName || typeof fullName !== 'string') return [];
      
      const hasMcMac = /Mc[A-Z]/.test(fullName) || /Mac[A-Z]/.test(fullName);
      const transitions = (fullName.match(/[a-z][A-Z]/g) || []).length;
      
      if (transitions === 0 || hasMcMac) return [fullName];
      
      const splitNames = [];
      let currentName = '';
      
      for (let i = 0; i < fullName.length; i++) {
        const char = fullName[i];
        const prevChar = i > 0 ? fullName[i - 1] : '';
        
        if (i > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
          if (currentName.trim().length > 0) splitNames.push(currentName.trim());
          currentName = char;
        } else {
          currentName += char;
        }
      }
      
      if (currentName.trim().length > 0) splitNames.push(currentName.trim());
      
      const validSegments = splitNames.filter(seg => seg.length > 1);
      return transitions >= 2 ? validSegments : [fullName];
    };
  `;
  
  await page.evaluate(nameSplitScript);

  // Extract credits
  const credits = await page.evaluate(() => {
    const writers: string[] = [];
    const composers: string[] = [];
    const producers: string[] = [];
    const labels: string[] = [];
    const publishers: string[] = [];
    
    const allText = document.body.innerText;
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';
      
      // Written by / Songwriter
      if (line.toLowerCase().includes('written by') || line.toLowerCase().includes('songwriter')) {
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const segments = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          const finalNames: string[] = [];
          
          for (const segment of segments) {
            const splitResult = (window as any).splitConcatenatedNames(segment);
            finalNames.push(...splitResult);
          }
          
          writers.push(...finalNames);
        }
      }
      
      // Produced by / Producer
      if (line.toLowerCase().includes('produced by') || line.toLowerCase().includes('producer')) {
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const segments = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          const finalNames: string[] = [];
          
          for (const segment of segments) {
            const splitResult = (window as any).splitConcatenatedNames(segment);
            finalNames.push(...splitResult);
          }
          
          producers.push(...finalNames);
        }
      }
      
      // Composer
      if (line.toLowerCase().includes('composer')) {
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const segments = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          const finalNames: string[] = [];
          
          for (const segment of segments) {
            const splitResult = (window as any).splitConcatenatedNames(segment);
            finalNames.push(...splitResult);
          }
          
          composers.push(...finalNames);
        }
      }
      
      // Source (Label)
      if (line.toLowerCase().startsWith('source:')) {
        const labelName = line.replace(/source:/i, '').trim();
        if (labelName) labels.push(labelName);
      }
      
      // Publisher
      if (line.toLowerCase().includes('publisher') && !line.toLowerCase().startsWith('source:')) {
        if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
          const names = nextLine.split(',').map(n => n.trim()).filter(Boolean);
          publishers.push(...names);
        }
      }
    }
    
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
  tracks: Array<{ id: string; spotifyUrl: string; songwriter?: string | null; spotifyStreams?: number | null }>
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

  // Limit batch size to prevent overwhelming the queue
  const batchSize = Math.min(tracksNeedingEnrichment.length, 100);
  const batch = tracksNeedingEnrichment.slice(0, batchSize);

  console.log(`[Phase 2] Enriching ${batch.length} tracks with credits and stream counts...`);

  // Initialize queue
  getQueue({
    maxConcurrency: 2,
    minDelay: 500,
    browserPoolSize: 2,
  });

  // Process each track through the queue and await all promises
  await Promise.all(
    batch.map(async (track) => {
      try {
        const enrichedData = await addToQueue(
          `track-${track.id}`,
          async (browser) => {
            return await scrapeTrackCredits(browser, track.id, track.spotifyUrl);
          },
          0 // Default priority
        );

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
        result.errors++;
        result.errorDetails.push({
          trackId: track.id,
          error: error.message || "Unknown error",
        });
        console.error(`[Phase 2] Error enriching track ${track.id}:`, error.message);
      }
    })
  );

  console.log(
    `[Phase 2] Complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched, ${result.errors} errors`
  );

  return result;
}
