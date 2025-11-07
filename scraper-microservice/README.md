# Spotify Playlist Scraper Microservice

A standalone API service that scrapes Spotify editorial playlists using headful Puppeteer with network capture. Designed to run on platforms with proper display support (Railway, Fly.io, Render, etc.) to bypass Replit's containerized environment limitations.

## Why This Exists

Spotify's web player requires GPU-backed rendering to fully execute JavaScript and trigger network requests. Replit's containerized environment can't provide this, so this microservice runs on a platform with proper display support (via xvfb).

## API Endpoints

### `POST /scrape-playlist`

Scrapes a Spotify playlist and returns all tracks with metadata.

**Request Body:**
```json
{
  "playlistUrl": "https://open.spotify.com/playlist/37i9dQZF1DWWjGdmeTyeJ6"
}
```

**Response:**
```json
{
  "success": true,
  "tracks": [
    {
      "trackId": "abc123",
      "isrc": "USRC17607839",
      "name": "Track Name",
      "artists": ["Artist 1", "Artist 2"],
      "album": "Album Name",
      "addedAt": "2025-11-07T12:00:00.000Z",
      "popularity": 75,
      "durationMs": 180000,
      "spotifyUrl": "https://open.spotify.com/track/abc123"
    }
  ],
  "totalCaptured": 160,
  "method": "network-capture"
}
```

### `GET /health`

Health check endpoint.

## Deployment

### Option 1: Railway (Recommended)

1. Create a new project on [Railway](https://railway.app)
2. Connect your Git repository or deploy from GitHub
3. Railway will auto-detect the Dockerfile
4. Deploy!

Your API will be available at: `https://your-project.railway.app`

### Option 2: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy
flyctl launch
flyctl deploy
```

### Option 3: Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your repository
3. Set:
   - **Build Command**: `docker build -t scraper .`
   - **Start Command**: `docker run -p 3000:3000 scraper`
4. Deploy!

### Option 4: Local Development

```bash
# Install dependencies
npm install

# Run with xvfb (Linux only)
xvfb-run --server-args="-screen 0 1920x1080x24" node server.js

# Or on Mac/Windows (without xvfb)
node server.js
```

## Integration with Replit

Once deployed, update your Replit environment:

1. Add `SCRAPER_API_URL` secret:
   ```
   SCRAPER_API_URL=https://your-scraper.railway.app
   ```

2. Your Replit backend will call this microservice instead of running Puppeteer locally.

## Technical Details

- **Display Server**: xvfb creates a virtual X11 display for headful Chrome
- **Browser**: Puppeteer with `headless: false` to fully execute Spotify's React app
- **Network Capture**: Intercepts JSON responses from Spotify's internal APIs
- **Playlist Support**: Handles both user playlists and editorial playlists (which return 404 via official API)

## Limitations

- Requires Spotify cookies/session (currently unauthenticated browsing)
- Rate limiting may apply for excessive requests
- Large playlists (>500 tracks) may timeout

## Environment Variables

- `PORT` - Server port (default: 3000)

## License

MIT
