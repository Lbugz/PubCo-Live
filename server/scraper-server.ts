import express from 'express';
import puppeteer from 'puppeteer';
import { normalizeCreditList } from './enrichment/creditNormalization';

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
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
      console.log(`[Scraper API] Saved ${cookies.length} cookies`);
    }

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
      headless: true,
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
    let curator: string | null = null;
    let followers: number | null = null;
    
    // Intercept network responses
    page.on("response", async (res) => {
      const url = res.url();
      
      if (!url.includes('spotify.com') && !url.includes('spclient')) return;
      
      try {
        const ct = (res.headers()["content-type"] || "").toLowerCase();
        if (!ct.includes("application/json")) return;
        
        const json = await res.json();
        
        // Check for GraphQL pathfinder API
        if (url.includes('pathfinder') && json?.data?.playlistV2) {
          const playlistData = json.data.playlistV2;
          
          if (playlistData.ownerV2?.data?.name) {
            curator = playlistData.ownerV2.data.name;
            console.log(`[Headless Scraper] Curator: ${curator}`);
          }
          
          if (playlistData.followers !== undefined) {
            followers = playlistData.followers;
            console.log(`[Headless Scraper] Followers: ${followers}`);
          }
          
          if (playlistData.content?.items) {
            const graphqlItems = playlistData.content.items;
            console.log(`[Headless Scraper] ✅ Found ${graphqlItems.length} tracks in GraphQL response`);
            
            if (playlistData.content.totalCount !== undefined) {
              totalTracks = playlistData.content.totalCount;
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
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    console.log(`[Headless Scraper] Navigating to playlist...`);
    await page.goto(playlistUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await browser.close();
    
    console.log(`[Headless Scraper] Captured ${allItems.length} tracks`);
    console.log(`[Headless Scraper] Metadata: curator="${curator}", followers=${followers}, totalTracks=${totalTracks}`);
    
    return {
      success: allItems.length > 0,
      tracks: allItems,
      totalCaptured: allItems.length,
      totalTracks: totalTracks,
      curator: curator,
      followers: followers,
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

// Enrich tracks endpoint - batch credit scraping
app.post('/enrich-tracks', async (req, res) => {
  try {
    const { tracks, cookies } = req.body;

    if (!tracks || !Array.isArray(tracks)) {
      return res.status(400).json({ 
        success: false, 
        error: 'tracks array is required' 
      });
    }

    const MAX_BATCH_SIZE = 12;
    if (tracks.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} tracks`
      });
    }

    console.log(`[Enrich Tracks] Processing ${tracks.length} tracks...`);

    // Load cookies if provided
    if (cookies && cookies.length > 0) {
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
      console.log(`[Enrich Tracks] Saved ${cookies.length} cookies`);
    }

    const startTime = Date.now();
    const results = await enrichTracksBatch(tracks);
    const durationMs = Date.now() - startTime;

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Enrich Tracks] ✅ Complete: ${succeeded} succeeded, ${failed} failed (${durationMs}ms)`);

    return res.json({
      success: true,
      results,
      summary: {
        total: tracks.length,
        succeeded,
        failed,
        durationMs
      }
    });
  } catch (error: any) {
    console.error('[Enrich Tracks] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Enrichment failed'
    });
  }
});

// Batch enrichment helper
async function enrichTracksBatch(tracks: Array<{ trackId: string; spotifyUrl: string }>) {
  let browser;
  const results = [];

  try {
    console.log('[Batch Enricher] Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
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

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Load cookies
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      if (fs.existsSync(cookiesPath)) {
        const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log('[Batch Enricher] Loaded cookies');
      }
    } catch (err) {
      console.warn('[Batch Enricher] No cookies loaded');
    }

    const TRACK_TIMEOUT_MS = 12000;

    for (const track of tracks) {
      try {
        console.log(`[Batch Enricher] Enriching: ${track.trackId}`);

        const enrichmentPromise = scrapeTrackCreditsOnPage(page, track.spotifyUrl);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Track timeout')), TRACK_TIMEOUT_MS)
        );

        const credits = await Promise.race([enrichmentPromise, timeoutPromise]) as any;

        results.push({
          trackId: track.trackId,
          success: true,
          credits: {
            songwriters: credits.songwriters || [],
            composers: credits.composers || [],
            producers: credits.producers || [],
            labels: credits.labels || [],
            publishers: credits.publishers || []
          }
        });

        console.log(`[Batch Enricher] ✅ Success: ${track.trackId}`);
      } catch (error: any) {
        console.error(`[Batch Enricher] ❌ Failed: ${track.trackId} - ${error.message}`);
        results.push({
          trackId: track.trackId,
          success: false,
          error: error.message
        });
      }
    }

    await browser.close();
    return results;
  } catch (error: any) {
    if (browser) await browser.close();
    throw error;
  }
}

// Scrape credits using existing page instance
async function scrapeTrackCreditsOnPage(page: any, trackUrl: string) {
  console.log(`[Credits Scraper] Navigating to: ${trackUrl}`);
  
  await page.goto(trackUrl, { 
    waitUntil: 'networkidle2', 
    timeout: 10000 
  });

  await new Promise(resolve => setTimeout(resolve, 1500));

  // Inject authoritative name normalization utility
  const normalizationScript = `
    window.normalizeCreditList = function(rawText) {
      if (!rawText || typeof rawText !== 'string') return [];
      let text = rawText.trim();
      if (!text) return [];
      text = text.replace(/&/g, ',').replace(/\//g, ',').replace(/\\|/g, ',').replace(/;/g, ',').replace(/\\n/g, ',').replace(/\\s{2,}/g, ' ');
      text = text.replace(/([a-z])([A-Z])/g, (m, l, u) => {
        const idx = text.indexOf(m);
        const before = text.substring(Math.max(0, idx - 3), idx + 1);
        const after = text.substring(idx, Math.min(text.length, idx + 5));
        const isMulti = /Mc[a-z]|Mac[a-z]|O'[a-z]|St\\.[a-z]|Van[a-z]|De[a-z]|Von[a-z]|La[a-z]|Le[a-z]/.test(after);
        return isMulti ? m : l + ', ' + u;
      });
      const parts = text.split(/,|\\n|;/).map(p => p.trim()).filter(p => p.length > 0);
      const cleaned = parts.map(name => {
        name = name.trim().replace(/\\s+/g, ' ');
        name = name.split(' ').map((w, i) => w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
        return name;
      }).filter(n => n.length >= 2 && (n.includes(' ') || n.length >= 3));
      const seen = new Set();
      const result = [];
      for (const name of cleaned) {
        const norm = name.toLowerCase();
        if (!seen.has(norm)) { seen.add(norm); result.push(name); }
      }
      return result;
    };
  `;
  
  await page.evaluate(normalizationScript);

  const credits = await page.evaluate(() => {
    const songwriters: string[] = [];
    const composers: string[] = [];
    const producers: string[] = [];
    const labels: string[] = [];
    const publishers: string[] = [];

    const allText = document.body.innerText;
    const lines = allText.split('\n');

    let inCreditsSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.toLowerCase() === 'credits' || trimmed.toLowerCase() === 'song credits') {
        inCreditsSection = true;
        continue;
      }

      if (inCreditsSection) {
        if (trimmed.toLowerCase().startsWith('written by') || trimmed.toLowerCase().startsWith('writer')) {
          const rawNames = trimmed.replace(/^(written by|writer):?\s*/i, '');
          const names = (window as any).normalizeCreditList(rawNames);
          songwriters.push(...names);
        } else if (trimmed.toLowerCase().startsWith('composer')) {
          const rawNames = trimmed.replace(/^composer:?\s*/i, '');
          const names = (window as any).normalizeCreditList(rawNames);
          composers.push(...names);
        } else if (trimmed.toLowerCase().startsWith('produced by') || trimmed.toLowerCase().startsWith('producer')) {
          const rawNames = trimmed.replace(/^(produced by|producer):?\s*/i, '');
          const names = (window as any).normalizeCreditList(rawNames);
          producers.push(...names);
        } else if (trimmed.toLowerCase().startsWith('publisher')) {
          const rawNames = trimmed.replace(/^publisher:?\s*/i, '');
          const names = (window as any).normalizeCreditList(rawNames);
          publishers.push(...names);
        } else if (trimmed.toLowerCase().startsWith('source:') || trimmed.toLowerCase().startsWith('label')) {
          const rawNames = trimmed.replace(/^(source:|label):?\s*/i, '');
          const names = (window as any).normalizeCreditList(rawNames);
          labels.push(...names);
        }
      }
    }

    return { songwriters, composers, producers, labels, publishers };
  });

  return credits;
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Scraper microservice running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Scrape endpoint: POST http://localhost:${PORT}/scrape-playlist`);
  console.log(`🔧 Enrich endpoint: POST http://localhost:${PORT}/enrich-tracks`);
});
