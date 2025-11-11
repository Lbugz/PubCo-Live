import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";
import { recordAuthSuccess, recordAuthFailure } from "./auth-monitor";
import { execSync } from "child_process";

const COOKIES_FILE = path.join(process.cwd(), "spotify_cookies.json");

function parseFollowerCount(followerText: string): number | null {
  if (!followerText) return null;
  
  // Remove "followers" word and trim
  const cleaned = followerText.replace(/followers?/i, '').trim();
  
  // Match number with optional suffix (K, M, B)
  const match = cleaned.match(/^([0-9,.]*)\s*([KMB])?$/i);
  if (!match) return null;
  
  const numberPart = match[1].replace(/,/g, '');
  const suffix = match[2]?.toUpperCase();
  
  let value = parseFloat(numberPart);
  if (isNaN(value)) return null;
  
  // Apply multiplier based on suffix
  switch (suffix) {
    case 'K': value *= 1e3; break;
    case 'M': value *= 1e6; break;
    case 'B': value *= 1e9; break;
  }
  
  return Math.floor(value);
}

async function handleCookieConsent(page: Page): Promise<void> {
  try {
    console.log("[Consent] Checking for cookie consent banner...");
    
    const consentSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="onetrust-accept"]',
      'button[aria-label*="Accept"]',
      'button[aria-label*="accept"]',
      '[data-testid="accept-all-cookies"]',
      'button[id*="accept"]',
      'button[id*="agree"]',
    ];
    
    for (const selector of consentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        console.log(`[Consent] ✅ Accepted cookie consent using selector: ${selector}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    console.log("[Consent] No consent banner found (already accepted or not shown)");
  } catch (error) {
    console.log("[Consent] Error handling consent:", error);
  }
}

function getChromiumPath(): string | undefined {
  try {
    const chromiumPath = execSync("which chromium || which chromium-browser || which google-chrome", {
      encoding: "utf8",
    }).trim();
    return chromiumPath || undefined;
  } catch (error) {
    console.warn("Could not find system chromium, will use Puppeteer's bundled browser");
    return undefined;
  }
}

export interface ScrapedTrack {
  trackName: string;
  artistName: string;
  album: string;
  duration: string;
  spotifyUrl: string;
}

export interface ScrapeResult {
  success: boolean;
  playlistName?: string;
  tracks?: ScrapedTrack[];
  curator?: string | null;
  followers?: number | null;
  error?: string;
}

interface TrackCredits {
  writers: string[];
  composers: string[];
  producers: string[];
  labels: string[];
  publishers: string[];
  allCredits: Array<{ name: string; role: string }>;
}

interface CreditsResult {
  success: boolean;
  credits?: TrackCredits;
  spotifyStreams?: number | null;
  error?: string;
}

export async function scrapeSpotifyPlaylist(playlistUrl: string): Promise<ScrapeResult> {
  let browser: Browser | null = null;
  
  try {
    console.log(`Starting Puppeteer scrape for: ${playlistUrl}`);
    
    const chromiumPath = getChromiumPath();
    console.log(`Using chromium at: ${chromiumPath || "Puppeteer bundled"}`);
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
      ],
    });
    
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Load cookies from Replit Secret or file
    try {
      let cookies;
      let cookieSource: "secret" | "file" | "none" = "none";
      
      // Priority 1: Load from Replit Secret (production)
      if (process.env.SPOTIFY_COOKIES_JSON) {
        console.log("Loading cookies from SPOTIFY_COOKIES_JSON secret");
        cookies = JSON.parse(process.env.SPOTIFY_COOKIES_JSON);
        cookieSource = "secret";
      } 
      // Priority 2: Load from file (local development)
      else if (fs.existsSync(COOKIES_FILE)) {
        console.log("Loading cookies from spotify-cookies.json file");
        const cookiesString = fs.readFileSync(COOKIES_FILE, "utf8");
        cookies = JSON.parse(cookiesString);
        cookieSource = "file";
      }
      
      if (cookies) {
        await page.setCookie(...cookies);
        
        // Check for sp_dc cookie (main auth token)
        const spDcCookie = cookies.find((c: any) => c.name === 'sp_dc');
        if (spDcCookie) {
          const expiryDate = new Date(spDcCookie.expires * 1000);
          console.log(`✓ Authenticated (sp_dc expires: ${expiryDate.toLocaleDateString()})`);
          
          // Record successful auth (only if from secret or file)
          if (cookieSource !== "none") {
            recordAuthSuccess(cookieSource, expiryDate);
          }
        } else {
          console.warn("⚠️ sp_dc cookie not found - may not be authenticated");
        }
      } else {
        console.warn("⚠️ No cookies found - continuing without authentication");
      }
    } catch (error) {
      console.warn("Failed to load cookies:", error);
    }
    
    // Monitor for authentication failures
    page.on('response', async (response) => {
      const status = response.status();
      const url = response.url();
      
      // Detect auth failures
      if (status === 401 && url.includes('spotify.com')) {
        recordAuthFailure(401, `Unauthorized access to ${url}`);
      } else if (status === 403 && url.includes('spotify.com')) {
        recordAuthFailure(403, `Forbidden access to ${url}`);
      }
    });
    
    console.log("Navigating to playlist page...");
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
    // Handle cookie consent banner if present
    await handleCookieConsent(page);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract playlist metadata (name, curator, followers) in one call
    const metadata = await page.evaluate(() => {
      // Extract playlist name
      const nameElement = document.querySelector('h1[data-encore-id="type"]');
      const name = nameElement?.textContent?.trim() || "Unknown Playlist";
      
      // Extract curator with fallback selectors
      const curatorElement = document.querySelector('[data-testid="entityHeaderSubtitle"] a')
                            || document.querySelector('[data-testid="entityHeaderSubtitle"] span')
                            || document.querySelector('div[data-testid="entity-subtitle"]');
      const curator = curatorElement?.textContent?.trim() || null;
      
      // Extract follower count with fallback selectors
      const followerElement = document.querySelector('button[data-testid="followers-count"]')
                              || document.querySelector('[data-testid="entity-subtitle-more-button"]')
                              || document.querySelector('[aria-label*="followers"]');
      const followerText = followerElement?.textContent?.trim() || null;
      
      return { name, curator, followerText };
    });
    
    const playlistName = metadata.name;
    const curator = metadata.curator || null;
    const followers = metadata.followerText ? parseFollowerCount(metadata.followerText) : null;
    
    console.log(`Playlist metadata: name="${playlistName}", curator="${curator}", followers=${followers}`);
    
    if (!metadata.curator) console.warn("⚠️ Could not extract curator");
    if (!metadata.followerText) console.warn("⚠️ Could not extract follower count");
    
    console.log("Waiting for track rows to load...");
    await page.waitForSelector('[data-testid="tracklist-row"]', { timeout: 30000 });
    
    const tracks = await autoScrollAndCollectTracks(page);
    
    console.log(`Successfully scraped ${tracks.length} tracks`);
    
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log("Saved session cookies for future use");
    
    await browser.close();
    
    return {
      success: true,
      playlistName,
      tracks,
      curator,
      followers,
    };
    
  } catch (error: any) {
    console.error("Scraping error:", error);
    
    if (browser) {
      await browser.close();
    }
    
    return {
      success: false,
      error: error.message || "Unknown scraping error",
    };
  }
}

async function autoScrollAndCollectTracks(page: Page): Promise<Array<{
  trackName: string;
  artistName: string;
  album: string;
  duration: string;
  spotifyUrl: string;
}>> {
  console.log("Starting auto-scroll to collect all tracks...");
  
  const collectedTracks = new Map<string, any>();
  let noNewTracksCount = 0;
  const maxNoNewIterations = 10;
  const maxScrollIterations = 100;
  
  const totalTracks = await page.evaluate(() => {
    const tracklistElement = document.querySelector('[data-testid="playlist-tracklist"]');
    return tracklistElement ? parseInt(tracklistElement.getAttribute('aria-rowcount') || '0') : 0;
  });
  
  console.log(`Playlist total tracks (from aria-rowcount): ${totalTracks}`);
  
  for (let i = 0; i < maxScrollIterations; i++) {
    const scrollResult = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
      const tracks: any[] = [];
      let lastRowIndex = 0;
      
      rows.forEach((row, index) => {
        const rowIndex = parseInt(row.getAttribute('aria-rowindex') || `${index + 1}`);
        if (rowIndex > lastRowIndex) {
          lastRowIndex = rowIndex;
        }
        
        const trackNameEl = row.querySelector('[data-testid="internal-track-link"] div[dir="auto"]');
        const artistLinkEl = row.querySelector('a[href*="/artist/"]');
        const albumEl = row.querySelector('a[href*="/album/"]');
        const durationEl = row.querySelector('[data-testid="duration-cell-container"]');
        const trackLinkEl = row.querySelector('[data-testid="internal-track-link"]') as HTMLAnchorElement;
        
        if (trackNameEl && trackLinkEl?.href) {
          tracks.push({
            trackName: trackNameEl.textContent?.trim() || "",
            artistName: artistLinkEl?.textContent?.trim() || "",
            album: albumEl?.textContent?.trim() || "",
            duration: durationEl?.textContent?.trim() || "",
            spotifyUrl: trackLinkEl.href,
          });
        }
      });
      
      const tracklistElement = document.querySelector('[data-testid="playlist-tracklist"]');
      const totalRows = tracklistElement ? parseInt(tracklistElement.getAttribute('aria-rowcount') || '0') : 0;
      
      const scrollableSelectors = [
        '.main-view-container__scroll-node',
        '[data-overlayscrollbars-viewport]',
        'div[data-overlayscrollbars-contents]',
      ];
      
      let scrolled = false;
      for (const selector of scrollableSelectors) {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
          const beforeScroll = element.scrollTop;
          element.scrollBy({ top: 1500, behavior: 'auto' });
          const afterScroll = element.scrollTop;
          if (afterScroll > beforeScroll) {
            scrolled = true;
            break;
          }
        }
      }
      
      if (!scrolled) {
        window.scrollBy({ top: 1500, behavior: 'auto' });
      }
      
      return { tracks, lastRowIndex, totalRows };
    });
    
    let newTracksFound = 0;
    for (const track of scrollResult.tracks) {
      if (!collectedTracks.has(track.spotifyUrl)) {
        collectedTracks.set(track.spotifyUrl, track);
        newTracksFound++;
      }
    }
    
    console.log(`Iteration ${i + 1}: Collected ${collectedTracks.size}/${scrollResult.totalRows} unique tracks (last visible row: ${scrollResult.lastRowIndex}, +${newTracksFound} new)`);
    
    if (newTracksFound === 0) {
      noNewTracksCount++;
      if (noNewTracksCount >= maxNoNewIterations) {
        console.log(`No new tracks for ${maxNoNewIterations} iterations. Collection complete.`);
        break;
      }
    } else {
      noNewTracksCount = 0;
    }
    
    if (collectedTracks.size >= scrollResult.totalRows && scrollResult.totalRows > 0) {
      console.log(`Collected all ${scrollResult.totalRows} tracks. Stopping.`);
      break;
    }
    
    if (scrollResult.lastRowIndex >= scrollResult.totalRows && scrollResult.totalRows > 0) {
      console.log(`Reached last row (${scrollResult.lastRowIndex}/${scrollResult.totalRows}). Stopping.`);
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  console.log(`Auto-scroll complete. Total unique tracks collected: ${collectedTracks.size}`);
  return Array.from(collectedTracks.values());
}

export async function scrapeTrackCredits(trackUrl: string): Promise<CreditsResult> {
  let browser: Browser | null = null;
  
  try {
    console.log(`Starting credits scrape for: ${trackUrl}`);
    
    const chromiumPath = getChromiumPath();
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
      ],
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set default timeouts to prevent indefinite hangs
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    
    // Load cookies from Replit Secret or file
    try {
      let cookies;
      let cookieSource: "secret" | "file" | "none" = "none";
      
      // Priority 1: Load from Replit Secret (production)
      if (process.env.SPOTIFY_COOKIES_JSON) {
        console.log("Loading cookies from SPOTIFY_COOKIES_JSON secret");
        cookies = JSON.parse(process.env.SPOTIFY_COOKIES_JSON);
        cookieSource = "secret";
      } 
      // Priority 2: Load from file (local development)
      else if (fs.existsSync(COOKIES_FILE)) {
        console.log("Loading cookies from spotify-cookies.json file");
        const cookiesString = fs.readFileSync(COOKIES_FILE, "utf8");
        cookies = JSON.parse(cookiesString);
        cookieSource = "file";
      }
      
      if (cookies) {
        await page.setCookie(...cookies);
        
        // Check for sp_dc cookie (main auth token)
        const spDcCookie = cookies.find((c: any) => c.name === 'sp_dc');
        if (spDcCookie) {
          const expiryDate = new Date(spDcCookie.expires * 1000);
          console.log(`✓ Authenticated (sp_dc expires: ${expiryDate.toLocaleDateString()})`);
          
          // Record successful auth (only if from secret or file)
          if (cookieSource !== "none") {
            recordAuthSuccess(cookieSource, expiryDate);
          }
        } else {
          console.warn("⚠️ sp_dc cookie not found - may not be authenticated");
        }
      } else {
        console.warn("⚠️ No cookies found - continuing without authentication");
      }
    } catch (error) {
      console.warn("Failed to load cookies:", error);
    }
    
    console.log("Navigating to track page...");
    
    // Try networkidle2 first, fall back to domcontentloaded if timeout
    try {
      await page.goto(trackUrl, { 
        waitUntil: "networkidle2", 
        timeout: 30000 
      });
      console.log("Page loaded with networkidle2");
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        console.warn("Navigation timeout with networkidle2, trying domcontentloaded fallback...");
        await page.goto(trackUrl, { 
          waitUntil: "domcontentloaded", 
          timeout: 15000 
        });
        console.log("Page loaded with domcontentloaded fallback");
      } else {
        throw error;
      }
    }
    
    // Handle cookie consent banner if present
    await handleCookieConsent(page);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Look for Credits section on the right panel
    console.log("Looking for Credits section...");
    
    // Check if Credits section is visible using page.evaluate()
    let creditsFound = await page.evaluate(() => {
      const allElements = document.querySelectorAll('div, section');
      return Array.from(allElements).some((el) => {
        const text = el.textContent || '';
        return text.includes('Credits') && text.length < 100;
      });
    });
    
    if (creditsFound) {
      console.log("Found Credits section in right panel");
    } else {
      console.log("Credits section not immediately visible, trying 3-dot menu...");
      
      // Try clicking 3-dot menu to open credits
      try {
        // Click the 3-dot menu button
        const menuButton = await page.$('button[aria-label*="More options"], button[data-testid="more-button"]');
        if (menuButton) {
          await menuButton.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Find and click "View credits" using page.evaluate()
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
            console.log("Opened Credits via menu");
          }
        }
      } catch (error) {
        console.warn("Could not open credits via menu:", error);
      }
    }
    
    if (!creditsFound) {
      await browser.close();
      return {
        success: false,
        error: "Could not find Credits section"
      };
    }
    
    // Inject shared name-splitting utility as a plain string to avoid transpiler issues
    console.log("Injecting name-splitting utility...");
    const nameSplitScript = `
      (function() {
        function hasMcMacPrefix(fullName) {
          return /Mc[A-Z]/.test(fullName) || /Mac[A-Z]/.test(fullName);
        }

        function decideShouldSplit(transitions, segments, original) {
          if (segments.length === 0) return false;
          if (hasMcMacPrefix(original)) return false;
          if (transitions >= 2) return true;
          
          if (transitions === 1) {
            var hasMultiWordSegment = segments.some(function(seg) { return seg.includes(' '); });
            if (hasMultiWordSegment) return true;
          }
          
          return false;
        }

        window.splitConcatenatedNames = function(fullName) {
          if (!fullName || typeof fullName !== 'string') {
            return [];
          }

          var capitalTransitions = (fullName.match(/[a-z][A-Z]/g) || []).length;

          if (capitalTransitions === 0) {
            return [fullName];
          }

          var splitNames = [];
          var currentName = '';

          for (var i = 0; i < fullName.length; i++) {
            var char = fullName[i];
            var prevChar = i > 0 ? fullName[i - 1] : '';

            if (i > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
              if (currentName.trim().length > 0) {
                splitNames.push(currentName.trim());
              }
              currentName = char;
            } else {
              currentName += char;
            }
          }

          if (currentName.trim().length > 0) {
            splitNames.push(currentName.trim());
          }

          var validSegments = splitNames.filter(function(seg) { return seg.length > 1; });
          var shouldSplit = decideShouldSplit(capitalTransitions, validSegments, fullName);

          return shouldSplit ? validSegments : [fullName];
        };
      })();
    `;
    
    await page.evaluate(nameSplitScript);
    
    // Verify function is available
    await page.waitForFunction('typeof window.splitConcatenatedNames === "function"', { timeout: 5000 });
    console.log("Name-splitting utility injected successfully");
    
    // Extract credits information AND stream count
    console.log("Extracting credits data and stream count...");
    const creditsAndStreams = await page.evaluate(() => {
      const writers = [];
      const composers = [];
      const producers = [];
      const labels = [];
      const publishers = [];
      const allCredits = [];
      let spotifyStreams: number | null = null;
      
      // Get all text nodes in the modal to parse credit structure
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
      
      // Pattern matching for Spotify's credit format:
      // - "Written by" followed by name(s)
      // - "Produced by" followed by name(s)
      // - "Source:" followed by label name (record label)
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1] || '';
        
        // Check for role labels
        if (line.toLowerCase().includes('written by') || line.toLowerCase().includes('songwriter')) {
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            // Split by commas first, then apply concatenated name detection to each segment
            const segments = nextLine.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
            const finalNames = [];
            
            for (let k = 0; k < segments.length; k++) {
              const splitResult = window.splitConcatenatedNames(segments[k]);
              finalNames.push.apply(finalNames, splitResult);
            }
            
            writers.push.apply(writers, finalNames);
            finalNames.forEach(function(name) { allCredits.push({ name: name, role: 'Writer' }); });
          }
        }
        
        if (line.toLowerCase().includes('produced by') || line.toLowerCase().includes('producer')) {
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            // Split by commas first, then apply concatenated name detection to each segment
            const segments = nextLine.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
            const finalNames = [];
            
            for (let k = 0; k < segments.length; k++) {
              const splitResult = window.splitConcatenatedNames(segments[k]);
              finalNames.push.apply(finalNames, splitResult);
            }
            
            producers.push.apply(producers, finalNames);
            finalNames.forEach(function(name) { allCredits.push({ name: name, role: 'Producer' }); });
          }
        }
        
        if (line.toLowerCase().includes('composer')) {
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            // Split by commas first, then apply concatenated name detection to each segment
            const segments = nextLine.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
            const finalNames = [];
            
            for (let k = 0; k < segments.length; k++) {
              const splitResult = window.splitConcatenatedNames(segments[k]);
              finalNames.push.apply(finalNames, splitResult);
            }
            
            composers.push.apply(composers, finalNames);
            finalNames.forEach(function(name) { allCredits.push({ name: name, role: 'Composer' }); });
          }
        }
        
        // Source is the record label
        if (line.toLowerCase().startsWith('source:')) {
          const labelName = line.replace(/source:/i, '').trim();
          if (labelName) {
            labels.push(labelName);
            allCredits.push({ name: labelName, role: 'Label' });
          }
        }
        
        // Look for actual publishers (different from labels)
        if (line.toLowerCase().includes('publisher') && !line.toLowerCase().startsWith('source:')) {
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            let names = nextLine.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
            
            if (names.length === 1) {
              const singleName = names[0];
              const capitalTransitions = (singleName.match(/[a-z][A-Z]/g) || []).length;
              if (capitalTransitions >= 2) {
                const splitNames = [];
                let currentName = '';
                for (let j = 0; j < singleName.length; j++) {
                  const char = singleName[j];
                  const prevChar = j > 0 ? singleName[j - 1] : '';
                  if (j > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
                    if (currentName.trim().length > 0) splitNames.push(currentName.trim());
                    currentName = char;
                  } else {
                    currentName += char;
                  }
                }
                if (currentName.trim().length > 0) splitNames.push(currentName.trim());
                names = splitNames.filter(function(n) { return n.length > 1; });
              }
            }
            
            publishers.push.apply(publishers, names);
            names.forEach(function(name) { allCredits.push({ name: name, role: 'Publisher' }); });
          }
        }
      }
      
      // Alternative: Look for structured divs with adjacent text
      const allElements = document.querySelectorAll('div, span, p');
      allElements.forEach(function(el) {
        const text = (el.textContent || '').trim().toLowerCase();
        
        // Find role label elements
        if (text === 'written by' || text === 'songwriter' || text === 'writer') {
          let nameEl = el.nextElementSibling;
          if (!nameEl && el.parentElement) {
            nameEl = el.parentElement.nextElementSibling;
          }
          
          const nameText = nameEl ? (nameEl.textContent || '').trim() : '';
          if (nameText && nameText.length > 1 && nameText.length < 500 && !nameText.toLowerCase().includes(' by')) {
            let names = nameText.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
            
            if (names.length === 1) {
              const singleName = names[0];
              const capitalTransitions = (singleName.match(/[a-z][A-Z]/g) || []).length;
              if (capitalTransitions >= 2) {
                const splitNames = [];
                let currentName = '';
                for (let j = 0; j < singleName.length; j++) {
                  const char = singleName[j];
                  const prevChar = j > 0 ? singleName[j - 1] : '';
                  if (j > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
                    if (currentName.trim().length > 0) splitNames.push(currentName.trim());
                    currentName = char;
                  } else {
                    currentName += char;
                  }
                }
                if (currentName.trim().length > 0) splitNames.push(currentName.trim());
                names = splitNames.filter(function(n) { return n.length > 1; });
              }
            }
            
            names.forEach(function(name) {
              if (writers.indexOf(name) === -1) {
                writers.push(name);
                allCredits.push({ name: name, role: 'Writer' });
              }
            });
          }
        }
        
        if (text === 'produced by' || text === 'producer') {
          let nameEl = el.nextElementSibling;
          if (!nameEl && el.parentElement) {
            nameEl = el.parentElement.nextElementSibling;
          }
          
          const nameText = nameEl ? (nameEl.textContent || '').trim() : '';
          if (nameText && nameText.length > 1 && nameText.length < 500 && !nameText.toLowerCase().includes(' by')) {
            let names = nameText.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
            
            if (names.length === 1) {
              const singleName = names[0];
              const capitalTransitions = (singleName.match(/[a-z][A-Z]/g) || []).length;
              if (capitalTransitions >= 2) {
                const splitNames = [];
                let currentName = '';
                for (let j = 0; j < singleName.length; j++) {
                  const char = singleName[j];
                  const prevChar = j > 0 ? singleName[j - 1] : '';
                  if (j > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
                    if (currentName.trim().length > 0) splitNames.push(currentName.trim());
                    currentName = char;
                  } else {
                    currentName += char;
                  }
                }
                if (currentName.trim().length > 0) splitNames.push(currentName.trim());
                names = splitNames.filter(function(n) { return n.length > 1; });
              }
            }
            
            names.forEach(function(name) {
              if (producers.indexOf(name) === -1) {
                producers.push(name);
                allCredits.push({ name: name, role: 'Producer' });
              }
            });
          }
        }
      });
      
      // Extract Spotify stream count from the page
      // Stream counts appear in various places - look for large formatted numbers
      try {
        // Look for stream count near artist/track header (format: "1,234,567" or "1.2M")
        const bodyText = document.body.innerText;
        const lines = bodyText.split('\n').map(l => l.trim());
        
        // Find numbers that look like stream counts (3+ digits with commas or M/K suffix)
        const streamPattern = /^[\d,]+$/; // e.g., "33,741" or "1,234,567"
        const shortPattern = /^([\d.]+)([MK])$/; // e.g., "1.2M" or "45K"
        
        for (const line of lines) {
          // Check for comma-formatted numbers (most reliable)
          if (streamPattern.test(line)) {
            const num = parseInt(line.replace(/,/g, ''), 10);
            // Stream counts are typically > 100 and < 1 billion
            if (num >= 100 && num < 1000000000) {
              spotifyStreams = num;
              break;
            }
          }
          // Check for abbreviated format (1.2M, 45K)
          const match = line.match(shortPattern);
          if (match) {
            const value = parseFloat(match[1]);
            const suffix = match[2];
            if (suffix === 'M') {
              spotifyStreams = Math.round(value * 1000000);
              break;
            } else if (suffix === 'K') {
              spotifyStreams = Math.round(value * 1000);
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to extract stream count:', err);
      }
      
      return {
        writers: Array.from(new Set(writers)),
        composers: Array.from(new Set(composers)),
        producers: Array.from(new Set(producers)),
        labels: Array.from(new Set(labels)),
        publishers: Array.from(new Set(publishers)),
        allCredits,
        spotifyStreams
      };
    });
    
    console.log(`Extracted ${creditsAndStreams.allCredits.length} credits`);
    
    if (creditsAndStreams.spotifyStreams) {
      console.log(`✅ Found Spotify stream count: ${creditsAndStreams.spotifyStreams.toLocaleString()}`);
    } else {
      console.log(`⚠️ No stream count found on page`);
    }
    
    await browser.close();
    
    return {
      success: true,
      credits: {
        writers: creditsAndStreams.writers,
        composers: creditsAndStreams.composers,
        producers: creditsAndStreams.producers,
        labels: creditsAndStreams.labels,
        publishers: creditsAndStreams.publishers,
        allCredits: creditsAndStreams.allCredits
      },
      spotifyStreams: creditsAndStreams.spotifyStreams
    };
    
  } catch (error: any) {
    console.error("Credits scraping error:", error);
    
    if (browser) {
      await browser.close();
    }
    
    return {
      success: false,
      error: error.message || "Unknown credits scraping error",
    };
  }
}

// Wrapper with master timeout to prevent indefinite hangs
export async function scrapeTrackCreditsWithTimeout(trackUrl: string, timeoutMs: number = 45000): Promise<CreditsResult> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new Error(`Scraping timeout after ${timeoutMs}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race<CreditsResult>([
      scrapeTrackCredits(trackUrl),
      timeoutPromise
    ]);
    
    // Clear timeout on successful completion
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error: any) {
    // Clear timeout on error
    clearTimeout(timeoutHandle!);
    
    // Re-throw TimeoutError so route can handle it
    if (error.name === 'TimeoutError') {
      throw error;
    }
    
    // For other errors, log and return error result
    console.error(`Scraping failed: ${error.message}`);
    return {
      success: false,
      error: error.message || "Scraping error"
    };
  }
}
