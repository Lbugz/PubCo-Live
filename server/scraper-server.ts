import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'spotify-scraper' });
});

// Scrape playlist endpoint
app.post('/scrape-playlist', async (req, res) => {
  try {
    const { playlistUrl, cookies } = req.body;

    if (!playlistUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'playlistUrl is required' 
      });
    }

    console.log(`[Scraper API] Received request for: ${playlistUrl}`);
    console.log(`[Scraper API] Cookies provided: ${cookies?.length || 0}`);

    // Set cookies if provided
    if (cookies && cookies.length > 0) {
      // Save cookies to file for Puppeteer to use
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
      console.log(`[Scraper API] Saved ${cookies.length} cookies`);
    }

    // Run the scraper with Railway-optimized headless config
    const result = await scrapePlaylistHeadless(playlistUrl);

    if (result.success) {
      console.log(`[Scraper API] ✅ Success: ${result.tracks.length} tracks captured`);
      return res.json({
        success: true,
        tracks: result.tracks,
        totalCaptured: result.totalCaptured,
        totalTracks: result.totalTracks,
        curator: result.curator,
        followers: result.followers,
        method: 'network-capture-headless'
      });
    } else {
      console.error(`[Scraper API] ❌ Failed: ${result.error}`);
      return res.status(500).json({
        success: false,
        error: result.error || 'Scraping failed'
      });
    }
  } catch (error: any) {
    console.error('[Scraper API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Railway-optimized headless scraper
async function scrapePlaylistHeadless(playlistUrl: string) {
  console.log(`[Headless Scraper] Starting for: ${playlistUrl}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true, // Must be headless for Railway
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
      ],
    });

    const [page] = await browser.pages();
    
    // Load cookies if saved
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      if (fs.existsSync(cookiesPath)) {
        const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log(`[Headless Scraper] Loaded ${cookies.length} cookies`);
      }
    } catch (err) {
      console.warn('[Headless Scraper] No cookies loaded');
    }
    
    const allItems: any[] = [];
    const capturedTracks = new Set<string>();
    let totalTracks: number | null = null;
    
    // Intercept network responses
    page.on("response", async (res) => {
      const url = res.url();
      
      if (!url.includes('spotify.com') && !url.includes('spclient')) return;
      
      try {
        const ct = (res.headers()["content-type"] || "").toLowerCase();
        if (!ct.includes("application/json")) return;
        
        const json = await res.json();
        
        // Check for GraphQL pathfinder API
        if (url.includes('pathfinder') && json?.data?.playlistV2?.content?.items) {
          const graphqlItems = json.data.playlistV2.content.items;
          console.log(`[Headless Scraper] ✅ Found ${graphqlItems.length} tracks in GraphQL response`);
          
          // Capture total track count from GraphQL response
          if (json.data.playlistV2.content.totalCount !== undefined) {
            totalTracks = json.data.playlistV2.content.totalCount;
            console.log(`[Headless Scraper] Total tracks in playlist: ${totalTracks}`);
          }
          
          for (const item of graphqlItems) {
            if (!item?.itemV2?.data) continue;
            const trackData = item.itemV2.data;
            const trackId = trackData.uri?.split(':').pop();
            
            if (trackId && !capturedTracks.has(trackId)) {
              capturedTracks.add(trackId);
              allItems.push({
                trackId,
                isrc: null,
                name: trackData.name || '',
                artists: trackData.artists?.items?.map((a: any) => a.profile?.name).filter(Boolean) || [],
                album: trackData.albumOfTrack?.name || null,
                addedAt: new Date(item.addedAt?.isoString || Date.now()),
                popularity: null,
                durationMs: trackData.trackDuration?.totalMilliseconds || null,
                spotifyUrl: `https://open.spotify.com/track/${trackId}`,
              });
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    console.log(`[Headless Scraper] Navigating to playlist...`);
    await page.goto(playlistUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for tracks to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await browser.close();
    
    console.log(`[Headless Scraper] Captured ${allItems.length} tracks`);
    
    return {
      success: allItems.length > 0,
      tracks: allItems,
      totalCaptured: allItems.length,
      totalTracks: totalTracks,
      curator: null,
      followers: null,
    };
  } catch (error: any) {
    if (browser) await browser.close();
    console.error('[Headless Scraper] Error:', error.message);
    return {
      success: false,
      tracks: [],
      totalCaptured: 0,
      error: error.message,
    };
  }
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Scraper microservice running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Scrape endpoint: POST http://localhost:${PORT}/scrape-playlist`);
});
