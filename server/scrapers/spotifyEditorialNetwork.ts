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
    
    // Accumulator for captured data
    const seenOffsets = new Set<number>();
    const allItems: any[] = [];
    
    // Intercept network responses
    page.on("response", async (res) => {
      const url = res.url();
      
      // Filter for Spotify playlist track API calls
      const isTrackPage =
        (url.includes("/v1/playlists/") && url.includes("/tracks")) ||
        (url.includes("spclient") && url.includes("playlist")) ||
        (url.includes("api.spotify.com") && url.includes("tracks"));
      
      if (!isTrackPage) return;
      
      try {
        const ct = (res.headers()["content-type"] || "").toLowerCase();
        if (!ct.includes("application/json")) return;
        
        const json = await res.json();
        
        // Check for Web API style response with items array
        if (json?.items && Array.isArray(json.items) && json.items.length > 0) {
          // Try to infer offset from URL
          const urlObj = new URL(url);
          const offset = Number(urlObj.searchParams.get("offset") || 0);
          
          if (!seenOffsets.has(offset)) {
            seenOffsets.add(offset);
            allItems.push(...json.items);
            console.log(`[Network Capture] Captured page offset=${offset} count=${json.items.length} total=${allItems.length}`);
          }
        }
      } catch (err) {
        // Silently ignore parsing errors
      }
    });
    
    // Navigate to the playlist
    console.log(`[Network Capture] Navigating to playlist...`);
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });
    
    // Wait for initial content to load
    await wait(3000);
    
    // Scroll to trigger additional page loads
    console.log(`[Network Capture] Scrolling to trigger pagination...`);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel({ deltaY: 800 });
      await wait(700);
    }
    
    // Wait for any late requests
    await wait(2000);
    
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
