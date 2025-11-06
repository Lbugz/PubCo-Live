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
  const maxStableIterations = 5;
  const maxScrollIterations = 50;
  
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
      const scrollableElement = document.querySelector('[data-testid="playlist-tracklist"]') as HTMLElement;
      if (scrollableElement) {
        scrollableElement.scrollTop = scrollableElement.scrollHeight;
      } else {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  console.log("Auto-scroll complete");
}
