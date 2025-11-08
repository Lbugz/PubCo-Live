# Spotify Cookie Authentication Setup Guide

This guide explains how to authenticate the AI Pub Feed scraper with Spotify using cookies. This is necessary because Spotify's editorial playlists (like Fresh Finds) cannot be accessed via the public API.

---

## 📋 Table of Contents

1. [Quick Start (Automated Method)](#-quick-start-automated-method)
2. [Manual Cookie Extraction (Backup Method)](#-manual-cookie-extraction-backup-method)
3. [Setting Up Replit Secrets](#-setting-up-replit-secrets)
4. [Enabling Automatic Scraping](#-enabling-automatic-scraping)
5. [Troubleshooting](#-troubleshooting)
6. [Security & Best Practices](#-security--best-practices)

---

## 🚀 Quick Start (Automated Method)

The easiest way to capture Spotify cookies is using our automated script:

### 1. Run the Cookie Capture Script (Locally)

**Important:** This script must be run on your **local machine** (not in Replit) because it requires a GUI browser.

```bash
# In your local clone of the project
node spotify-auth-export.js
```

### 2. What Happens:

1. A browser window opens to the Spotify login page
2. **You log into your Spotify account** manually
3. After logging in, press **ENTER** in the terminal
4. The script automatically extracts and saves cookies to `spotify-cookies.json`
5. Cookies are also copied to your clipboard (if clipboardy is installed)

### 3. Upload to Replit Secrets

1. Open your Replit project
2. Click the **Lock icon** (Secrets tool) in the left sidebar
3. Click **"New Secret"**
4. Configure:
   - **Name:** `SPOTIFY_COOKIES_JSON`
   - **Value:** Paste the entire contents of `spotify-cookies.json`
5. Click **Save**

### 4. Restart Your Application

In Replit, restart the "Start application" workflow. The scraper will now use your authenticated session!

---

## 🔧 Manual Cookie Extraction (Backup Method)

If the automated script doesn't work, you can manually extract cookies:

### Using Chrome DevTools:

1. **Open Spotify in Chrome** and log in
2. Navigate to any playlist (e.g., Fresh Finds)
3. Open DevTools (`F12` or `Cmd+Option+I` on Mac)
4. Go to the **Application** tab
5. In the left sidebar, expand **Cookies** → `https://open.spotify.com`
6. Find the `sp_dc` cookie (this is the main auth token)
7. Right-click on the cookie table → **Copy all as JSON**
8. Save to a file named `spotify-cookies.json`

### Using Firefox DevTools:

1. Open Spotify in Firefox and log in
2. Press `F12` to open DevTools
3. Go to the **Storage** tab
4. Click **Cookies** → `https://open.spotify.com`
5. Copy the `sp_dc` cookie value
6. Manually create a JSON file in this format:

```json
[
  {
    "name": "sp_dc",
    "value": "YOUR_COOKIE_VALUE_HERE",
    "domain": ".spotify.com",
    "path": "/",
    "expires": 1234567890,
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax"
  }
]
```

Then follow **Step 3** from the Quick Start to upload to Replit Secrets.

---

## 🔐 Setting Up Replit Secrets

Your cookies should be stored securely as Replit Secrets (not committed to git).

### Where to Find Secrets:

1. Open your Replit project
2. Look for the **Lock icon** in the left sidebar
3. Or use the search bar → type "Secrets"

### Required Secret:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `SPOTIFY_COOKIES_JSON` | `[{...}]` | Full JSON array of Spotify cookies |

### Cookie Priority:

The scraper loads cookies in this order:
1. **SPOTIFY_COOKIES_JSON secret** (production/Replit)
2. **spotify-cookies.json file** (local development)
3. **No authentication** (will fail for editorial playlists)

---

## ⏰ Enabling Automatic Scraping

The system includes a built-in scheduler for automatic playlist updates.

### How to Enable:

1. Add a new Replit Secret:
   - **Name:** `ENABLE_AUTO_SCRAPE`
   - **Value:** `true`
2. Restart the application

### What Gets Scheduled:

| Job Name | Schedule | Description |
|----------|----------|-------------|
| **Fresh Finds Weekly Update** | Fridays 9:00 AM | Automatically scrapes Fresh Finds playlist |

### Manual Scraping:

Even with auto-scraping **disabled**, you can still manually trigger scrapes via the UI or API:
- Use the "Fetch Data" button in the Playlists View
- Call `/api/playlists/:id/fetch-tracks` endpoint

### Checking Scheduler Status:

When the app starts, you'll see a log message:

```
======================================================================
⏰ SCHEDULER INITIALIZATION
======================================================================
Status: ✅ ENABLED (or ⏸️ DISABLED)
Environment: ENABLE_AUTO_SCRAPE=true
Registered Jobs: 1

🚀 Starting scheduled jobs:
   ✓ Fresh Finds Weekly Update
     Schedule: 0 9 * * 5 (Fridays at 9:00 AM)
======================================================================
```

---

## 🐛 Troubleshooting

### "⚠️ No cookies found"

**Problem:** The scraper can't find authentication cookies.

**Solutions:**
1. Verify `SPOTIFY_COOKIES_JSON` secret exists in Replit
2. Check the secret value is valid JSON
3. Try the automated capture script again

---

### "❌ SPOTIFY AUTHENTICATION FAILED"

**Problem:** Cookies have expired or are invalid.

**What You'll See:**
```
======================================================================
❌ SPOTIFY AUTHENTICATION FAILED
======================================================================
🔐 Status: 401 Unauthorized - Cookies expired or invalid
📊 Failure Count: 3 consecutive failures
   Last successful auth: [timestamp]
   ⏰ Cookie expiry: [date] (EXPIRED)

🔧 RECOMMENDED ACTIONS:
   1. Run the cookie capture script locally:
      → node spotify-auth-export.js
   2. Update the SPOTIFY_COOKIES_JSON secret in Replit
   3. Restart the application
======================================================================
```

**Solutions:**
1. Run `node spotify-auth-export.js` on your local machine
2. Update the `SPOTIFY_COOKIES_JSON` secret with new cookies
3. Restart the Replit application

---

### Cookie Expiration

**How long do cookies last?**
- Spotify's `sp_dc` cookie typically lasts **several months** (sometimes up to a year)
- The system automatically tracks when cookies were last valid
- You'll receive clear warnings when they expire

**Monitoring:**
- Check `auth-status.json` file for cookie health
- Watch logs for authentication warnings
- The system tracks consecutive failures

---

### "Cannot access editorial playlists"

**Problem:** Only Spotify's editorial playlists (owned by Spotify) require cookies.

**Check:**
1. Is the playlist actually owned by Spotify?
   - ✅ Fresh Finds = Editorial (requires cookies)
   - ✅ New Music Friday = Editorial (requires cookies)
   - ❌ User playlists = No cookies needed (API works)

2. Are your cookies valid?
   - Run the automated capture script to refresh them

---

## 🔒 Security & Best Practices

### Do's ✅

- **Store cookies in Replit Secrets** (encrypted, not in git)
- **Use a dedicated service account** (not your personal Spotify)
- **Refresh cookies** when you see expiration warnings
- **Keep `spotify-cookies.json`** in `.gitignore` (already configured)

### Don'ts ❌

- **Never commit cookies to git** (they're like passwords!)
- **Don't share your cookies** with others
- **Don't use your personal Spotify account** for production scraping

---

## 📚 Advanced: How It Works

### Cookie-Based Authentication Flow:

1. **Login Once:** User logs into Spotify via browser
2. **Extract Session:** Cookies are captured (contains `sp_dc` token)
3. **Store Securely:** Cookies saved to Replit Secrets
4. **Reuse Session:** Puppeteer loads cookies on each scrape
5. **Access Granted:** Editorial playlists become accessible

### Why Cookies Instead of API?

Spotify's official API has a limitation:
- ❌ **Cannot access editorial playlists** for new third-party apps
- ✅ **Cookies simulate browser access** (bypasses API restriction)
- ✅ **Network capture method** fetches all 160+ tracks from playlists

---

## 🎯 Next Steps

1. ✅ Run `node spotify-auth-export.js` locally
2. ✅ Add `SPOTIFY_COOKIES_JSON` to Replit Secrets
3. ✅ (Optional) Add `ENABLE_AUTO_SCRAPE=true` for scheduling
4. ✅ Restart application
5. ✅ Test scraping Fresh Finds playlist!

---

**Need Help?** Check the console logs for detailed authentication status and troubleshooting hints.
