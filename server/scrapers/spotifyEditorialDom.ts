import puppeteer from "puppeteer";

// Helper function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to parse follower count
function parseFollowerCount(followerText: string): number | null {
  if (!followerText) return null;
  
  const cleaned = followerText.replace(/followers?/i, '').trim();
  const match = cleaned.match(/^([0-9,.]*)\s*([KMB])?$/i);
  if (!match) return null;
  
  const numberPart = match[1].replace(/,/g, '');
  const suffix = match[2]?.toUpperCase();
  
  let value = parseFloat(numberPart);
  if (isNaN(value)) return null;
  
  switch (suffix) {
    case 'K': value *= 1e3; break;
    case 'M': value *= 1e6; break;
    case 'B': value *= 1e9; break;
  }
  
  return Math.floor(value);
}

export interface DomCaptureTrack {
  name: string;
  artists: string[];
  album: string | null;
  spotifyUrl: string;
}

export interface DomCaptureResult {
  success: boolean;
  tracks: DomCaptureTrack[];
  totalCaptured: number;
  playlistName?: string | null;
  curator?: string | null;
  followers?: number | null;
  imageUrl?: string | null;
  error?: string;
}

export async function harvestVirtualizedRows(
  playlistUrl: string
): Promise<DomCaptureResult> {
  console.log(`[DOM Capture] Starting fallback for: ${playlistUrl}`);
  console.log(`[DOM Capture] Running in headless mode with saved cookies...`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
      headless: true, // Run in headless mode (Replit has no X server)
      slowMo: 30,
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
        console.log(`[DOM Capture] Loaded ${cookies.length} saved cookies`);
      } else {
        console.log(`[DOM Capture] No saved cookies found, will need manual login`);
      }
    } catch (err) {
      console.warn('[DOM Capture] Failed to load cookies:', err);
    }
    
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });
    
    // Wait for playlist to load
    await wait(3000);
    
    // Expose function to collect rows from page context
    const results: any[] = [];
    await page.exposeFunction("PUSH_ROW", (row: any) => results.push(row));
    
    // Check page status
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[DOM Capture] Page loaded: ${pageTitle} (${pageUrl})`);
    
    // Handle cookie consent banner
    console.log(`[DOM Capture] Checking for cookie consent banner...`);
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
        console.log(`[DOM Capture] ✅ Accepted cookie consent using: ${selector}`);
        await wait(2000);
        consentAccepted = true;
        break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!consentAccepted) {
      console.log(`[DOM Capture] No cookie consent banner found (already accepted or not shown)`);
    }
    
    // Wait for playlist content to load
    try {
      await page.waitForSelector('[data-testid="playlist-tracklist"], [role="grid"]', { timeout: 10000 });
      console.log(`[DOM Capture] Playlist content loaded`);
    } catch {
      console.log(`[DOM Capture] ⚠️  Warning: Playlist content selector not found`);
    }
    
    // Inject MutationObserver to capture virtualized rows
    await page.evaluate(() => {
      // Find the virtualized list container
      const container = 
        document.querySelector('[data-testid="playlist-tracklist"]') ||
        document.querySelector('[role="grid"]') ||
        document.querySelector('[data-virtualized-list]') ||
        document.querySelector('.main-trackList-trackList');
      
      if (!container) {
        console.warn('[DOM Capture] Could not find list container');
        return;
      }
      
      const seen = new Set<string>();
      
      function extractRowData(row: Element) {
        try {
          // Try multiple selector patterns for track name
          const trackEl = 
            row.querySelector('[data-testid="tracklist-row"] a[href*="/track/"]') ||
            row.querySelector('a[href*="/track/"]') ||
            row.querySelector('[dir="auto"]');
          
          const track = trackEl?.textContent?.trim() || "";
          if (!track) return;
          
          // Extract Spotify URL from link
          const linkEl = row.querySelector('a[href*="/track/"]');
          const spotifyUrl = linkEl?.getAttribute('href') || "";
          const fullUrl = spotifyUrl.startsWith('http') 
            ? spotifyUrl 
            : `https://open.spotify.com${spotifyUrl}`;
          
          // Try multiple patterns for artists
          const artistEls = Array.from(
            row.querySelectorAll('[data-testid="track-artist"] a, a[href*="/artist/"]')
          );
          const artists = artistEls
            .map(el => el.textContent?.trim())
            .filter(Boolean) as string[];
          
          // Album might be in various places
          const albumEl = row.querySelector('[data-testid="track-album"] a, a[href*="/album/"]');
          const album = albumEl?.textContent?.trim() || null;
          
          // Create unique key
          const key = `${track}::${artists.join(",")}::${album}`;
          if (seen.has(key)) return;
          
          seen.add(key);
          
          // Safely call PUSH_ROW with serializable data only
          try {
            const rowData = {
              track: String(track),
              artists: artists.map(a => String(a)),
              album: album ? String(album) : null,
              spotifyUrl: String(fullUrl)
            };
            // @ts-ignore - exposeFunction makes this available
            (window as any).PUSH_ROW(rowData);
          } catch (pushErr) {
            console.error('[DOM Capture] PUSH_ROW error:', pushErr);
          }
        } catch (err) {
          console.error('[DOM Capture] Row extraction error:', err);
        }
      }
      
      // Initial harvest
      container.querySelectorAll('[role="row"]').forEach(extractRowData);
      
      // Watch for mutations (virtualized rows swapping)
      const observer = new MutationObserver(() => {
        container.querySelectorAll('[role="row"]').forEach(extractRowData);
      });
      
      observer.observe(container, { 
        childList: true, 
        subtree: true 
      });
    });
    
    // Drive scroll to force virtualization swaps
    let lastCount = 0;
    let stagnantCounter = 0;
    
    console.log(`[DOM Capture] Beginning scroll harvest...`);
    for (let i = 0; i < 400; i++) {
      await page.mouse.wheel({ deltaY: 650 });
      await wait(450);
      
      // Check if we're still finding new tracks
      if (results.length === lastCount) {
        stagnantCounter++;
      } else {
        stagnantCounter = 0;
        lastCount = results.length;
        if (i % 10 === 0) {
          console.log(`[DOM Capture] Progress: ${results.length} tracks captured`);
        }
      }
      
      // Stop if we haven't found new rows in a while
      if (stagnantCounter > 12) {
        console.log(`[DOM Capture] No new tracks found, stopping scroll`);
        break;
      }
    }
    
    // Extract playlist metadata before closing
    let playlistName: string | null = null;
    let curator: string | null = null;
    let followers: number | null = null;
    let imageUrl: string | null = null;
    
    try {
      console.log(`[DOM Capture] Extracting playlist metadata...`);
      const metadata = await page.evaluate(() => {
        // Extract playlist name
        const nameElement = document.querySelector('[data-testid="playlist-page"] h1[data-encore-id="type"]')
                           || document.querySelector('main h1[data-encore-id="type"]')
                           || document.querySelector('h1[data-encore-id="type"]');
        let name = nameElement?.textContent?.trim() || null;
        
        // Fallback to page title
        if (!name || name === "null" || name === "Your Library") {
          const titleMatch = document.title.match(/^([^|]+)/);
          name = titleMatch ? titleMatch[1].trim() : null;
        }
        
        // Extract curator
        const curatorElement = document.querySelector('[data-testid="entityHeaderSubtitle"] a')
                              || document.querySelector('[data-testid="entityHeaderSubtitle"] span')
                              || document.querySelector('div[data-testid="entity-subtitle"]');
        const curator = curatorElement?.textContent?.trim() || null;
        
        // Extract followers - try multiple selectors
        let followerText: string | null = null;
        const followerSelectors = [
          'button[data-testid="followers-count"]',
          '[data-testid="entity-subtitle-more-button"]',
          '[aria-label*="followers"]',
          '[aria-label*="follower"]',
          'button:has-text("followers")',
          '[data-testid="playlist-followers"]',
          'span:has-text("followers")',
        ];
        
        for (const selector of followerSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element?.textContent) {
              const text = element.textContent.trim();
              if (text.match(/\d+.*follow/i)) {
                followerText = text;
                break;
              }
            }
          } catch (e) {
            // Continue
          }
        }
        
        // Fallback: Search page text
        if (!followerText) {
          const allText = document.body.innerText;
          const followerMatch = allText.match(/(\d+[,\d]*\s*[KMB]?\s*followers?)/i);
          if (followerMatch) {
            followerText = followerMatch[1];
          }
        }
        
        // Extract image
        const imageElement = document.querySelector('[data-testid="playlist-image"] img')
                            || document.querySelector('[data-testid="entity-image"] img')
                            || document.querySelector('img[alt*="playlist"]')
                            || document.querySelector('main img');
        const imageUrl = imageElement?.getAttribute('src') || null;
        
        return { name, curator, followerText, imageUrl };
      });
      
      playlistName = metadata.name;
      curator = metadata.curator;
      followers = metadata.followerText ? parseFollowerCount(metadata.followerText) : null;
      imageUrl = metadata.imageUrl;
      
      console.log(`[DOM Capture] Metadata: name="${playlistName}", curator="${curator}", followerText="${metadata.followerText}", parsedFollowers=${followers}`);
    } catch (err) {
      console.warn('[DOM Capture] Failed to extract metadata:', err);
    }
    
    await browser.close();
    browser = undefined;
    
    // Map results to our schema
    const tracks: DomCaptureTrack[] = results.map((r: any) => ({
      name: r.track,
      artists: r.artists,
      album: r.album,
      spotifyUrl: r.spotifyUrl,
    }));
    
    console.log(`[DOM Capture] Complete! Captured ${tracks.length} unique tracks`);
    
    return {
      success: true,
      tracks,
      totalCaptured: tracks.length,
      playlistName,
      curator,
      followers,
      imageUrl,
    };
  } catch (error: any) {
    console.error(`[DOM Capture] Error:`, error.message);
    
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
