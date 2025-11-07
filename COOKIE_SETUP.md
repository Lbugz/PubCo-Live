# Spotify Cookie Setup for Editorial Playlist Scraping

## Overview
To scrape editorial playlists (like Fresh Finds) that return 404 via the API, we need to pass your Spotify session cookies to the microservice.

## How It Works
1. You log in to Spotify in your browser
2. Extract your session cookies
3. Save them to `spotify-cookies.json` in the project root
4. The backend automatically sends these cookies to the microservice when scraping editorial playlists

## Cookie Extraction Steps

### Method 1: Using Browser DevTools (Chrome/Edge)

1. Open https://open.spotify.com in your browser
2. Log in to your Spotify account
3. Open DevTools (F12 or Right-click → Inspect)
4. Go to the "Application" tab (or "Storage" in Firefox)
5. In the left sidebar, expand "Cookies" → "https://open.spotify.com"
6. Copy all cookies to a JSON file with this format:

```json
[
  {
    "name": "sp_dc",
    "value": "YOUR_VALUE_HERE",
    "domain": ".spotify.com",
    "path": "/",
    "expires": 1234567890,
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
  },
  {
    "name": "sp_key",
    "value": "YOUR_VALUE_HERE",
    "domain": ".spotify.com",
    "path": "/",
    "expires": 1234567890,
    "httpOnly": false,
    "secure": true,
    "sameSite": "None"
  }
]
```

### Method 2: Using Console (Quick)

1. Open https://open.spotify.com and log in
2. Open DevTools Console (F12 → Console tab)
3. Paste this code:

```javascript
copy(JSON.stringify(document.cookie.split('; ').map(c => {
  const [name, value] = c.split('=');
  return {
    name,
    value,
    domain: '.spotify.com',
    path: '/',
    expires: Date.now() / 1000 + 31536000,
    httpOnly: false,
    secure: true,
    sameSite: 'None'
  };
}), null, 2));
```

4. The cookies are now in your clipboard - paste into `spotify-cookies.json`

### Method 3: Export from Puppeteer Script

Create a file called `extract-cookies.js`:

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null 
  });
  
  const page = await browser.newPage();
  await page.goto('https://open.spotify.com');
  
  console.log('Please log in to Spotify...');
  console.log('Press ENTER in this terminal when logged in');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  const cookies = await page.cookies();
  fs.writeFileSync('spotify-cookies.json', JSON.stringify(cookies, null, 2));
  
  console.log(`✅ Saved ${cookies.length} cookies to spotify-cookies.json`);
  await browser.close();
})();
```

Run: `node extract-cookies.js`

## Important Cookies

The most critical cookies for authentication are:
- `sp_dc` - Main session cookie
- `sp_key` - Session key
- `sp_t` - Access token (short-lived)

## Security Warning

⚠️ **Cookie Security Risks:**
- These cookies grant full access to your Spotify account
- They are sent to the Railway-hosted microservice
- Anyone with these cookies can impersonate your Spotify session
- Cookies may be logged in Railway's systems
- Keep `spotify-cookies.json` out of version control (.gitignore'd)

## Testing

After saving cookies, test the fetch:

1. Go to Playlists View
2. Try fetching "Fresh Finds" or another editorial playlist
3. Check logs for: `Loaded X saved Spotify cookies`
4. The microservice should successfully scrape with authentication

## Cookie Expiration

Spotify cookies typically expire after:
- `sp_dc`: ~1 year
- `sp_t`: ~1 hour (refreshed automatically)
- `sp_key`: ~1 year

When cookies expire, you'll need to extract fresh ones.

## Troubleshooting

**"No saved cookies found"**
- Ensure `spotify-cookies.json` exists in project root
- Check file format matches the JSON array structure above

**Scraper still hits login wall**
- Verify cookies include `sp_dc` and `sp_key`
- Re-extract cookies after logging in fresh
- Check cookie domain is `.spotify.com` not `open.spotify.com`

**403/401 errors**
- Cookies may have expired - extract fresh ones
- Ensure you're logged in to the correct Spotify account
