const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'spotify-playlist-scraper' });
});

app.post('/scrape-playlist', async (req, res) => {
  const { playlistUrl, cookies } = req.body;
  
  if (!playlistUrl) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing playlistUrl in request body' 
    });
  }
  
  const startTime = Date.now();
  console.log(`[Scraper API] =====================================`);
  console.log(`[Scraper API] Received request for: ${playlistUrl}`);
  console.log(`[Scraper API] Cookies provided: ${cookies ? 'YES' : 'NO'}`);
  console.log(`[Scraper API] Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  let browser;
  
  try {
    const seenOffsets = new Set();
    const allItems = [];
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-accelerated-2d-canvas',
        '--single-process',
        '--no-zygote',
        '--window-size=1440,900',
      ],
      defaultViewport: { width: 1440, height: 900 },
    });
    
    const [page] = await browser.pages();
    
    // Inject cookies if provided
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
      console.log(`[Scraper] Injecting ${cookies.length} cookies...`);
      await page.setCookie(...cookies);
      console.log(`[Scraper] ✅ Cookies injected successfully`);
    }
    
    page.on("response", async (response) => {
      const url = response.url();
      
      if (!url.includes('spotify.com') && !url.includes('spclient')) return;
      
      try {
        const contentType = (response.headers()['content-type'] || '').toLowerCase();
        if (!contentType.includes('application/json')) return;
        
        const json = await response.json();
        
        if (json?.items || json?.tracks || json?.content) {
          console.log(`[Network] Found JSON response from: ${url.substring(0, 80)}...`);
        }
        
        let items = null;
        if (json?.items && Array.isArray(json.items)) {
          items = json.items;
        } else if (json?.tracks?.items && Array.isArray(json.tracks.items)) {
          items = json.tracks.items;
        } else if (json?.content?.items && Array.isArray(json.content.items)) {
          items = json.content.items;
        }
        
        if (items && items.length > 0) {
          const urlObj = new URL(url);
          const offset = Number(urlObj.searchParams.get("offset") || urlObj.searchParams.get("fromRow") || 0);
          
          if (!seenOffsets.has(offset)) {
            seenOffsets.add(offset);
            allItems.push(...items);
            console.log(`[Network] ✅ Captured offset=${offset} count=${items.length} total=${allItems.length}`);
          }
        }
      } catch (err) {
        // Silently ignore JSON parse errors
      }
    });
    
    console.log(`[Scraper] Navigating to playlist...`);
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });
// Handle cookie consent banner
console.log('[Scraper] Checking for cookie consent banner...');
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
    console.log(`[Scraper] ✅ Accepted cookie consent using: ${selector}`);
    await page.waitForTimeout(2000);
    consentAccepted = true;
    break;
  } catch (e) {
    // Continue to next selector
  }
}

if (!consentAccepted) {
  console.log('[Scraper] No cookie consent banner found (already accepted or not shown)');
}

    
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[Scraper] Page loaded: ${pageTitle}`);
    
    const needsLogin = pageUrl.includes('/login') || pageUrl.includes('/authorize');
    if (needsLogin) {
      await browser.close();
      return res.status(403).json({
        success: false,
        error: 'Spotify login required. This microservice needs authenticated session.',
        tracks: [],
        totalCaptured: 0
      });
    }
    
    await wait(3000);
    console.log(`[Scraper] Initial items captured: ${allItems.length}`);
    
    console.log(`[Scraper] Scrolling to trigger pagination...`);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel({ deltaY: 800 });
      await wait(700);
    }
    
    await wait(2000);
    
    await browser.close();
    browser = undefined;
    
    const tracks = allItems
      .map((item) => {
        const track = item.track || item;
        if (!track || !track.name) return null;
        
        return {
          trackId: track.id || "",
          isrc: track.external_ids?.isrc || null,
          name: track.name,
          artists: (track.artists || []).map(a => a.name).filter(Boolean),
          album: track.album?.name || null,
          addedAt: item.added_at ? new Date(item.added_at).toISOString() : new Date().toISOString(),
          popularity: track.popularity || null,
          durationMs: track.duration_ms || null,
          spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        };
      })
      .filter(t => t !== null);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const memoryUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    console.log(`[Scraper] ✅ Success! Returning ${tracks.length} tracks`);
    console.log(`[Scraper] Duration: ${duration}s | Memory: ${memoryUsed}MB`);
    console.log(`[Scraper API] =====================================`);
    
    res.json({
      success: true,
      tracks,
      totalCaptured: tracks.length,
      method: 'network-capture',
      duration: `${duration}s`,
      memoryUsed: `${memoryUsed}MB`
    });
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const memoryUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    console.error(`[Scraper] ❌ Error after ${duration}s:`, error.message);
    console.error(`[Scraper] Error stack:`, error.stack);
    console.error(`[Scraper] Memory at error: ${memoryUsed}MB`);
    console.log(`[Scraper API] =====================================`);
    
    if (browser) {
      try {
        await browser.close();
        console.log(`[Scraper] Browser closed after error`);
      } catch (closeError) {
        console.error(`[Scraper] Failed to close browser:`, closeError.message);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      tracks: [],
      totalCaptured: 0,
      duration: `${duration}s`,
      memoryUsed: `${memoryUsed}MB`
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Spotify Playlist Scraper API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🎵 Scrape endpoint: POST http://localhost:${PORT}/scrape-playlist`);
});
