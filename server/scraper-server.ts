import express from 'express';
import { fetchEditorialTracksViaNetwork } from './scrapers/spotifyEditorialNetwork';

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

    // Run the scraper
    const result = await fetchEditorialTracksViaNetwork(playlistUrl);

    if (result.success) {
      console.log(`[Scraper API] ✅ Success: ${result.tracks.length} tracks captured`);
      return res.json({
        success: true,
        tracks: result.tracks,
        totalCaptured: result.totalCaptured,
        curator: result.curator,
        followers: result.followers,
        method: 'network-capture'
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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Scraper microservice running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Scrape endpoint: POST http://localhost:${PORT}/scrape-playlist`);
});
