import puppeteer from "puppeteer";

// Helper function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  error?: string;
}

export async function harvestVirtualizedRows(
  playlistUrl: string
): Promise<DomCaptureResult> {
  console.log(`[DOM Capture] Starting fallback for: ${playlistUrl}`);
  console.log(`[DOM Capture] ⚠️  IMPORTANT: A browser window will open. If Spotify requests login, please authenticate manually.`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // MUST be headed to see Spotify's virtualized list properly
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
          // @ts-ignore - exposeFunction makes this available
          (window as any).PUSH_ROW({ track, artists, album, spotifyUrl: fullUrl });
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
