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
    await page.goto(trackUrl, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
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
    
    // Extract credits information
    console.log("Extracting credits data...");
    const credits = await page.evaluate(() => {
      const writers: string[] = [];
      const composers: string[] = [];
      const producers: string[] = [];
      const labels: string[] = [];
      const publishers: string[] = [];
      const allCredits: Array<{ name: string; role: string }> = [];
      
      // Helper function to intelligently split names
      // First tries comma separation, then falls back to capital letter splitting if needed
      function smartSplitNames(text: string): string[] {
        if (!text || text.trim().length === 0) return [];
        
        // First attempt: split by commas
        const commaSplit = text.split(',').map(n => n.trim()).filter(Boolean);
        
        // If we got multiple names from comma split, we're done
        if (commaSplit.length > 1) {
          return commaSplit;
        }
        
        // If only one "name" after comma split, check if it's actually multiple names concatenated
        const singleName = commaSplit[0] || text.trim();
        
        // Count uppercase letters that follow lowercase letters (indicates new name)
        const capitalTransitions = (singleName.match(/[a-z][A-Z]/g) || []).length;
        
        // If we have 2+ capital transitions, likely multiple names run together
        if (capitalTransitions >= 2) {
          // Split by detecting uppercase letter after lowercase letter
          // "Gustav NystromIman Conta" -> ["Gustav Nystrom", "Iman Conta"]
          const names: string[] = [];
          let currentName = '';
          
          for (let i = 0; i < singleName.length; i++) {
            const char = singleName[i];
            const prevChar = i > 0 ? singleName[i - 1] : '';
            
            // New name starts when we hit uppercase after lowercase
            if (i > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
              // Save current name and start new one
              if (currentName.trim().length > 0) {
                names.push(currentName.trim());
              }
              currentName = char;
            } else {
              currentName += char;
            }
          }
          
          // Don't forget the last name
          if (currentName.trim().length > 0) {
            names.push(currentName.trim());
          }
          
          return names.filter(n => n.length > 1); // Filter out single-letter artifacts
        }
        
        // Otherwise, return as single name
        return [singleName];
      }
      
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
          // Next line(s) should contain writer names - use smart splitting
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            const names = smartSplitNames(nextLine);
            writers.push(...names);
            names.forEach(name => allCredits.push({ name, role: 'Writer' }));
          }
        }
        
        if (line.toLowerCase().includes('produced by') || line.toLowerCase().includes('producer')) {
          // Next line(s) should contain producer names - use smart splitting
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            const names = smartSplitNames(nextLine);
            producers.push(...names);
            names.forEach(name => allCredits.push({ name, role: 'Producer' }));
          }
        }
        
        if (line.toLowerCase().includes('composer')) {
          if (nextLine && !nextLine.includes(':') && !nextLine.toLowerCase().includes(' by')) {
            const names = smartSplitNames(nextLine);
            composers.push(...names);
            names.forEach(name => allCredits.push({ name, role: 'Composer' }));
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
            const names = smartSplitNames(nextLine);
            publishers.push(...names);
            names.forEach(name => allCredits.push({ name, role: 'Publisher' }));
          }
        }
      }
      
      // Alternative: Look for structured divs with adjacent text
      const allElements = document.querySelectorAll('div, span, p');
      allElements.forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() || '';
        
        // Find role label elements
        if (text === 'written by' || text === 'songwriter' || text === 'writer') {
          // Get next sibling or parent's next sibling for the name
          let nameEl = el.nextElementSibling;
          if (!nameEl && el.parentElement) {
            nameEl = el.parentElement.nextElementSibling;
          }
          
          const nameText = nameEl?.textContent?.trim();
          if (nameText && nameText.length > 1 && nameText.length < 500 && !nameText.toLowerCase().includes(' by')) {
            // Use smart splitting to handle both comma-separated and concatenated names
            const names = smartSplitNames(nameText);
            names.forEach(name => {
              if (!writers.includes(name)) {
                writers.push(name);
                allCredits.push({ name, role: 'Writer' });
              }
            });
          }
        }
        
        if (text === 'produced by' || text === 'producer') {
          let nameEl = el.nextElementSibling;
          if (!nameEl && el.parentElement) {
            nameEl = el.parentElement.nextElementSibling;
          }
          
          const nameText = nameEl?.textContent?.trim();
          if (nameText && nameText.length > 1 && nameText.length < 500 && !nameText.toLowerCase().includes(' by')) {
            // Use smart splitting to handle both comma-separated and concatenated names
            const names = smartSplitNames(nameText);
            names.forEach(name => {
              if (!producers.includes(name)) {
                producers.push(name);
                allCredits.push({ name, role: 'Producer' });
              }
            });
          }
        }
      });
      
      return {
        writers: Array.from(new Set(writers)),
        composers: Array.from(new Set(composers)),
        producers: Array.from(new Set(producers)),
        labels: Array.from(new Set(labels)),
        publishers: Array.from(new Set(publishers)),
        allCredits
      };
    });
    
    console.log(`Extracted ${credits.allCredits.length} credits`);
    
    await browser.close();
    
    return {
      success: true,
      credits
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
