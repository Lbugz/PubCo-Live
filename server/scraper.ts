import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const COOKIES_FILE = path.join(process.cwd(), "spotify_cookies.json");

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

interface ScrapedTrack {
  trackName: string;
  artistName: string;
  album: string;
  duration: string;
  spotifyUrl: string;
}

interface ScrapeResult {
  success: boolean;
  playlistName?: string;
  tracks?: ScrapedTrack[];
  error?: string;
}

interface TrackCredits {
  writers: string[];
  composers: string[];
  producers: string[];
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
    
    if (fs.existsSync(COOKIES_FILE)) {
      try {
        const cookiesString = fs.readFileSync(COOKIES_FILE, "utf8");
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log("Loaded saved Spotify cookies");
      } catch (error) {
        console.warn("Failed to load cookies, continuing without authentication:", error);
      }
    }
    
    console.log("Navigating to playlist page...");
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let playlistName = "Unknown Playlist";
    try {
      playlistName = await page.$eval('h1[data-encore-id="type"]', (el) => el.textContent?.trim() || "Unknown Playlist");
      console.log("Found playlist name:", playlistName);
    } catch (error) {
      console.warn("Could not extract playlist name, using default");
    }
    
    console.log("Waiting for track rows to load...");
    await page.waitForSelector('[data-testid="tracklist-row"]', { timeout: 30000 });
    
    await autoScroll(page);
    
    console.log("Extracting track data...");
    const tracks = await page.evaluate(() => {
      const trackRows = Array.from(document.querySelectorAll('[data-testid="tracklist-row"]'));
      
      return trackRows.map((row) => {
        const trackNameEl = row.querySelector('[data-testid="internal-track-link"] div[dir="auto"]');
        const artistNameEl = row.querySelector('[data-testid="internal-track-link"]')?.parentElement?.parentElement?.querySelector('a[href*="/artist/"]');
        const albumEl = row.querySelector('a[href*="/album/"]');
        const durationEl = row.querySelector('[data-testid="duration-cell-container"]');
        const trackLinkEl = row.querySelector('[data-testid="internal-track-link"]') as HTMLAnchorElement;
        
        return {
          trackName: trackNameEl?.textContent?.trim() || "",
          artistName: artistNameEl?.textContent?.trim() || "",
          album: albumEl?.textContent?.trim() || "",
          duration: durationEl?.textContent?.trim() || "",
          spotifyUrl: trackLinkEl?.href || "",
        };
      }).filter(track => track.trackName && track.artistName);
    });
    
    console.log(`Successfully scraped ${tracks.length} tracks`);
    
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log("Saved session cookies for future use");
    
    await browser.close();
    
    return {
      success: true,
      playlistName,
      tracks,
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

async function autoScroll(page: Page): Promise<void> {
  console.log("Starting auto-scroll to load all tracks...");
  
  let previousTrackCount = 0;
  let stableCount = 0;
  const maxStableIterations = 8;
  const maxScrollIterations = 100;
  
  for (let i = 0; i < maxScrollIterations; i++) {
    const currentTrackCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="tracklist-row"]').length;
    });
    
    console.log(`Scroll iteration ${i + 1}: Found ${currentTrackCount} tracks`);
    
    if (currentTrackCount === previousTrackCount) {
      stableCount++;
      if (stableCount >= maxStableIterations) {
        console.log(`Track count stable at ${currentTrackCount} for ${maxStableIterations} iterations. Stopping.`);
        break;
      }
    } else {
      stableCount = 0;
    }
    
    previousTrackCount = currentTrackCount;
    
    await page.evaluate(() => {
      const selectors = [
        '[data-testid="playlist-tracklist"]',
        '[data-testid="tracklist"]',
        '.main-view-container__scroll-node',
        '[role="presentation"]',
        'main',
      ];
      
      let scrolled = false;
      for (const selector of selectors) {
        const element = document.querySelector(selector) as HTMLElement;
        if (element && element.scrollHeight > element.clientHeight) {
          element.scrollTop = element.scrollHeight;
          scrolled = true;
          break;
        }
      }
      
      if (!scrolled) {
        window.scrollTo(0, document.body.scrollHeight);
      }
      
      const lastRow = document.querySelector('[data-testid="tracklist-row"]:last-child');
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log("Auto-scroll complete");
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
    
    if (fs.existsSync(COOKIES_FILE)) {
      try {
        const cookiesString = fs.readFileSync(COOKIES_FILE, "utf8");
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log("Loaded saved Spotify cookies");
      } catch (error) {
        console.warn("Failed to load cookies, continuing without authentication:", error);
      }
    }
    
    console.log("Navigating to track page...");
    await page.goto(trackUrl, { 
      waitUntil: "networkidle2", 
      timeout: 60000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Look for Credits section on the right panel
    console.log("Looking for Credits section...");
    
    // Check if Credits section is visible using page.evaluate()
    let creditsFound = await page.evaluate(() => {
      const allElements = document.querySelectorAll('div, section');
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Credits') && text.length < 100) {
          return true;
        }
      }
      return false;
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
            for (const btn of allButtons) {
              const text = btn.textContent || '';
              if (text.toLowerCase().includes('view credits') || text.toLowerCase().includes('credits')) {
                (btn as HTMLElement).click();
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
      const publishers: string[] = [];
      const allCredits: Array<{ name: string; role: string }> = [];
      
      // Find Credits section by looking through all divs for one containing "Credits" text
      let creditsSection: Element | null = null;
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const text = div.textContent || '';
        if (text.includes('Credits') && text.length < 100) {
          // Found a likely Credits header, get parent container
          creditsSection = div.parentElement || div;
          break;
        }
      }
      
      if (creditsSection) {
        // Look for credit items - Spotify typically uses links or specific divs for names
        const creditRows = creditsSection.querySelectorAll('div[role="row"], li, .credit-row, div');
        
        creditRows.forEach((row) => {
          const nameEl = row.querySelector('a, span[dir="auto"]');
          const roleEl = row.querySelector('span:not([dir="auto"])');
          
          const name = nameEl?.textContent?.trim() || '';
          const role = roleEl?.textContent?.trim() || '';
          
          if (name && role && name.length > 1 && name.length < 100) {
            allCredits.push({ name, role });
            
            const roleLower = role.toLowerCase();
            if (roleLower.includes('writer') || roleLower.includes('lyricist')) {
              writers.push(name);
            }
            if (roleLower.includes('composer')) {
              composers.push(name);
            }
            if (roleLower.includes('producer')) {
              producers.push(name);
            }
            if (roleLower.includes('publisher')) {
              publishers.push(name);
            }
          }
        });
      }
      
      // Fallback: Look for credit-related data attributes
      const creditItems = document.querySelectorAll('[data-testid*="credit"]');
      creditItems.forEach((item) => {
        const links = item.querySelectorAll('a');
        const text = item.textContent?.toLowerCase() || '';
        
        links.forEach((link) => {
          const name = link.textContent?.trim();
          if (name && name.length > 1 && name.length < 100) {
            if (text.includes('writer') || text.includes('lyricist')) {
              if (!writers.includes(name)) writers.push(name);
            }
            if (text.includes('composer')) {
              if (!composers.includes(name)) composers.push(name);
            }
            if (text.includes('producer')) {
              if (!producers.includes(name)) producers.push(name);
            }
            if (text.includes('publisher')) {
              if (!publishers.includes(name)) publishers.push(name);
            }
          }
        });
      });
      
      return {
        writers: Array.from(new Set(writers)),
        composers: Array.from(new Set(composers)),
        producers: Array.from(new Set(producers)),
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
