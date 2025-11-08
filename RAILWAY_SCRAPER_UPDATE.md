# Railway Scraper Update Guide

## Problem
The Railway scraper is returning 0 tracks because Spotify's cookie consent banner is blocking access to the track list.

## Solution
Add cookie consent handling to your Railway scraper **before** attempting to capture tracks.

## Code to Add to Railway Scraper

Find the section in your Railway scraper where the page navigates to the Spotify playlist (after `page.goto()`), and add this consent handling code:

```javascript
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
    await page.waitForTimeout(2000); // or use: await new Promise(r => setTimeout(r, 2000));
    consentAccepted = true;
    break;
  } catch (e) {
    // Continue to next selector
  }
}

if (!consentAccepted) {
  console.log('[Scraper] No cookie consent banner found (already accepted or not shown)');
}
```

## Where to Insert

Insert this code **right after** navigating to the playlist page and **before** attempting to capture tracks:

```javascript
// Example placement in your Railway scraper:
await page.goto(playlistUrl, { waitUntil: 'networkidle2', timeout: 60000 });

// ✅ INSERT CONSENT HANDLING CODE HERE

// Then continue with track capture logic...
```

## After Updating

1. **Commit and push** the changes to your Railway repository
2. Railway will **automatically redeploy** the updated scraper
3. **Test** the scraper by triggering a Fresh Finds Heavy fetch from the Replit app

## Expected Result

After this update, the Railway logs should show:
- ✅ Cookies injected successfully
- ✅ Accepted cookie consent using: [selector]
- ✅ Success! Returning X tracks (where X should be 160+ for Fresh Finds Heavy)

## Local Scrapers Already Updated

The following local fallback scrapers in this Replit project have already been updated:
- ✅ `server/scraper.ts` - Main playlist and credits scrapers
- ✅ `server/scrapers/spotifyEditorialNetwork.ts` - Network capture fallback
- ✅ `server/scrapers/spotifyEditorialDom.ts` - DOM harvester fallback

These will work if your Railway microservice is unavailable.
