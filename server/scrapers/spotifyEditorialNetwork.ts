import puppeteer from "puppeteer";

// Helper function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface NetworkCaptureTrack {
  trackId: string;
  isrc: string | null;
  name: string;
  artists: string[];
  album: string | null;
  addedAt: Date;
  popularity: number | null;
  durationMs: number | null;
  spotifyUrl: string;
}

export interface NetworkCaptureResult {
  success: boolean;
  tracks: NetworkCaptureTrack[];
  totalCaptured: number;
  error?: string;
}

export async function fetchEditorialTracksViaNetwork(
  playlistUrl: string
): Promise<NetworkCaptureResult> {
  console.log(`[Network Capture] Starting for: ${playlistUrl}`);
  console.log(`[Network Capture] ⚠️  IMPORTANT: A browser window will open. If Spotify requests login, please authenticate manually.`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // MUST be headed so Spotify runs full app logic and network requests work
      args: [
        "--window-size=1440,900",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: { width: 1440, height: 900 },
    });

    const [page] = await browser.pages();
    
    // Load saved cookies if available
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      if (fs.existsSync(cookiesPath)) {
        const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log(`[Network Capture] Loaded ${cookies.length} saved cookies`);
      } else {
        console.log(`[Network Capture] No saved cookies found, will need manual login`);
      }
    } catch (err) {
      console.warn('[Network Capture] Failed to load cookies:', err);
    }
    
    // Accumulator for captured data
    const seenOffsets = new Set<number>();
    const allItems: any[] = [];
    
    // Intercept network responses - capture ALL JSON to see what Spotify uses
    let responseCount = 0;
    page.on("response", async (res) => {
      const url = res.url();
      
      // DEBUG: Log ALL Spotify requests to see what's happening
      if (url.includes('spotify.com') || url.includes('spclient')) {
        responseCount++;
        if (responseCount <= 10) { // Only log first 10 to avoid spam
          console.log(`[Network Capture] Response #${responseCount}: ${url.substring(0, 120)}`);
          console.log(`[Network Capture] Content-Type: ${res.headers()["content-type"]}`);
        }
      }
      
      // Only process JSON responses from Spotify domains
      if (!url.includes('spotify.com') && !url.includes('spclient')) return;
      
      try {
        const ct = (res.headers()["content-type"] || "").toLowerCase();
        if (!ct.includes("application/json")) return;
        
        const json = await res.json();
        
        // DEBUG: Log ALL JSON responses to see what Spotify is returning
        console.log(`[Network Capture] JSON from: ${url.substring(0, 120)}`);
        console.log(`[Network Capture] JSON keys: ${Object.keys(json).join(', ')}`);
        
        // Log all Spotify JSON responses to understand their structure
        if (json?.items || json?.tracks || json?.content) {
          console.log(`[Network Capture] ✅ Found items/tracks/content array!`);
        }
        
        // Check for various response formats Spotify might use
        let items = null;
        if (json?.items && Array.isArray(json.items)) {
          items = json.items;
        } else if (json?.tracks?.items && Array.isArray(json.tracks.items)) {
          items = json.tracks.items;
        } else if (json?.content?.items && Array.isArray(json.content.items)) {
          items = json.content.items;
        }
        
        if (items && items.length > 0) {
          // Try to infer offset from URL
          const urlObj = new URL(url);
          const offset = Number(urlObj.searchParams.get("offset") || urlObj.searchParams.get("fromRow") || 0);
          
          if (!seenOffsets.has(offset)) {
            seenOffsets.add(offset);
            allItems.push(...items);
            console.log(`[Network Capture] ✅ Captured page offset=${offset} count=${items.length} total=${allItems.length}`);
          }
        }
      } catch (err: any) {
        // Log parsing errors to debug
        if (url.includes('playlist') || url.includes('track')) {
          console.log(`[Network Capture] ⚠️  Error parsing response from: ${url.substring(0, 100)}`);
          console.log(`[Network Capture] Error: ${err.message}`);
        }
      }
    });
    
    // Navigate to the playlist
    console.log(`[Network Capture] Navigating to playlist...`);
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });
    
    // Check if we hit a login wall
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[Network Capture] Page loaded: ${pageTitle} (${pageUrl})`);
    
    // Check for login or cookie consent
    const needsLogin = pageUrl.includes('/login') || pageUrl.includes('/authorize');
    
    if (needsLogin) {
      console.log(`[Network Capture] ⚠️  Spotify login required. Waiting 30 seconds for manual login...`);
      await wait(30000);
    }
    
    // Handle cookie consent banner
    console.log(`[Network Capture] Checking for cookie consent banner...`);
    const consentSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="onetrust-accept"]',
      'button[aria-label*="Accept"]',
      'button[aria-label*="accept"]',
      '[data-testid="accept-all-cookies"]',
      'button[id*="accept"]',
      'button[id*="agree"]',
    ];
    
    let consentAccepted = false;
    for (const selector of consentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        console.log(`[Network Capture] ✅ Accepted cookie consent using: ${selector}`);
        await wait(2000);
        consentAccepted = true;
        break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!consentAccepted) {
      console.log(`[Network Capture] No cookie consent banner found (already accepted or not shown)`);
    }
    
    // Wait for initial content to load
    await wait(3000);
    
    console.log(`[Network Capture] Captured ${allItems.length} items so far from initial load`);
    
    // Scroll to trigger additional page loads
    console.log(`[Network Capture] Scrolling to trigger pagination...`);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel({ deltaY: 800 });
      await wait(700);
    }
    
    // Wait for any late requests
    await wait(2000);
    
    // Save cookies for future use with microservice
    try {
      const cookies = await page.cookies();
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log(`[Network Capture] Saved ${cookies.length} cookies for future microservice use`);
    } catch (err) {
      console.warn('[Network Capture] Failed to save cookies:', err);
    }
    
    await browser.close();
    browser = undefined;
    
    // Map to our schema
    const tracks: NetworkCaptureTrack[] = allItems
      .map((item: any) => {
        const track = item.track || item;
        if (!track || !track.name) return null;
        
        return {
          trackId: track.id || "",
          isrc: track.external_ids?.isrc || null,
          name: track.name,
          artists: (track.artists || []).map((a: any) => a.name).filter(Boolean),
          album: track.album?.name || null,
          addedAt: item.added_at ? new Date(item.added_at) : new Date(),
          popularity: track.popularity || null,
          durationMs: track.duration_ms || null,
          spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        };
      })
      .filter((t): t is NetworkCaptureTrack => t !== null);
    
    console.log(`[Network Capture] Success! Captured ${tracks.length} unique tracks`);
    
    return {
      success: true,
      tracks,
      totalCaptured: tracks.length,
    };
  } catch (error: any) {
    console.error(`[Network Capture] Error:`, error.message);
    
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    
    return {
      success: false,
      tracks: [],
      totalCaptured: 0,
      error: error.message,
    };
  }
}
