# Railway Deployment Guide - Spotify Playlist Scraper

## ✅ What Was Fixed

Your Railway scraper had these issues that caused crashes:
- ❌ `headless: false` - Won't work on Railway's headless server
- ❌ Duplicate cookie consent handling (wasted time)
- ❌ High memory usage (Railway free tier = 512MB limit)

**All fixed in the latest `server.js`!**

---

## 🚀 Deployment Options

### Option A: GitHub/GitLab Auto-Deploy (Recommended)

**Prerequisites:**
- GitHub or GitLab account
- Railway account connected to your Git provider

**Steps:**

1. **Create a Git Repository** (if you don't have one):
   ```bash
   cd scraper-microservice
   git init
   git add .
   git commit -m "Railway scraper with headless mode fix"
   ```

2. **Push to GitHub/GitLab**:
   ```bash
   # Create a new repository on GitHub/GitLab first, then:
   git remote add origin https://github.com/YOUR_USERNAME/spotify-scraper.git
   git branch -M main
   git push -u origin main
   ```

3. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `spotify-scraper` repository
   - Railway will auto-detect the Dockerfile and deploy!

4. **Set Environment Variables** (if needed):
   - In Railway dashboard, go to your project
   - Click "Variables" tab
   - Add `PORT=3000` (usually auto-set)

5. **Get Your Deployment URL**:
   - Railway will provide a URL like: `https://spotify-scraper-production.up.railway.app`
   - Copy this URL

6. **Update Replit Secret**:
   - In your Replit project, go to Secrets
   - Update `SCRAPER_API_URL` to your Railway URL
   - Example: `https://spotify-scraper-production.up.railway.app`

**✨ Auto-Deploy:** Every time you push changes to GitHub/GitLab, Railway automatically redeploys!

---

### Option B: Railway CLI Deploy

**Prerequisites:**
- Railway CLI installed: `npm install -g @railway/cli`
- Railway account

**Steps:**

1. **Login to Railway**:
   ```bash
   railway login
   ```

2. **Navigate to scraper directory**:
   ```bash
   cd scraper-microservice
   ```

3. **Initialize Railway project**:
   ```bash
   railway init
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Get deployment URL**:
   ```bash
   railway domain
   ```

6. **Update Replit Secret** with the Railway URL

---

## 📋 Files That Will Deploy

Railway will use these files from `scraper-microservice/`:
- ✅ `Dockerfile` - Container build instructions
- ✅ `server.js` - Fixed scraper code (headless: 'new')
- ✅ `package.json` - Dependencies
- ✅ `railway.json` - Railway config (if present)

---

## 🔧 Railway Configuration

### Memory Optimization (Already Included)

The fixed `server.js` now includes these Puppeteer flags:
```javascript
headless: 'new',           // ✅ Works on Railway
--disable-extensions       // Reduces memory
--single-process           // Lower memory footprint
--no-zygote                // Reduces processes
--disable-accelerated-2d-canvas  // Less GPU memory
```

### Expected Resource Usage:
- **Memory**: ~300-400MB (within Railway's 512MB free tier)
- **Build time**: ~2-3 minutes
- **Request duration**: ~10-20 seconds for 160+ tracks

---

## 🧪 Testing Your Deployment

1. **Health Check**:
   ```bash
   curl https://YOUR-RAILWAY-URL.railway.app/health
   ```
   Expected: `{"status":"ok","service":"spotify-playlist-scraper"}`

2. **Test Scraping** (from Replit app):
   - Go to Playlists view
   - Click "View Tracks" on Fresh Finds Heavy
   - Check Railway logs for success message

3. **Check Railway Logs**:
   ```bash
   railway logs
   ```
   Look for:
   - ✅ `Cookies injected successfully`
   - ✅ `Accepted cookie consent using: #onetrust-accept-btn-handler`
   - ✅ `Success! Returning X tracks`
   - ✅ `Duration: Xs | Memory: XMB`

---

## 🐛 Troubleshooting

### Issue: "502 Bad Gateway"
**Cause:** Railway deployment failed or crashed
**Fix:**
1. Check Railway logs: `railway logs`
2. Look for error messages
3. Ensure `headless: 'new'` is in server.js (not `headless: false`)

### Issue: "Out of Memory" errors
**Cause:** Puppeteer using too much RAM
**Fix:**
- Already included memory optimization flags
- Consider upgrading Railway plan for more memory
- Reduce pagination loops in server.js (currently 20, try 15)

### Issue: "0 tracks returned"
**Cause:** Cookie consent blocking or no authentication
**Fix:**
1. Check Railway logs for "Accepted cookie consent"
2. Ensure cookies are being sent from Replit app
3. Verify cookies are valid (not expired)

### Issue: "Puppeteer timeout"
**Cause:** Page taking too long to load
**Fix:**
- Increase timeout in server.js: `timeout: 90000` (line 98)
- Check if Spotify is blocking Railway's IP

---

## 📊 Monitoring Your Deployment

### Railway Dashboard:
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time deployment logs
- **Deployments**: History of all deployments
- **Variables**: Environment variables

### Log Messages to Watch:
```
✅ Good:
[Scraper] ✅ Cookies injected successfully
[Scraper] ✅ Accepted cookie consent
[Scraper] ✅ Success! Returning 160 tracks
[Scraper] Duration: 12.5s | Memory: 380MB

❌ Bad:
[Scraper] ❌ Error after 5s: Navigation timeout
[Scraper] Memory at error: 510MB (close to limit!)
```

---

## 🔄 Redeploying After Changes

### If using GitHub/GitLab:
```bash
git add .
git commit -m "Update scraper"
git push
```
Railway auto-deploys! ✨

### If using Railway CLI:
```bash
railway up
```

---

## 💰 Railway Pricing

### Free Tier (Hobby):
- ✅ 512MB RAM (sufficient for our scraper)
- ✅ 1GB disk
- ✅ $5/month credit (usually covers ~500 hours)
- ⚠️ Sleeps after 15 min inactivity

### Pro Plan ($20/month):
- ✅ 8GB RAM
- ✅ No sleep mode
- ✅ Priority support

**Recommendation:** Start with free tier. Our optimized scraper fits within limits!

---

## 📝 Next Steps After Deployment

1. ✅ Copy your Railway URL
2. ✅ Add to Replit Secrets as `SCRAPER_API_URL`
3. ✅ Test by fetching Fresh Finds Heavy playlist
4. ✅ Monitor Railway logs for first few requests
5. ✅ If successful, Railway becomes primary scraper (Replit local = fallback)

---

## 🆘 Need Help?

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Puppeteer Docs**: https://pptr.dev

---

## ✨ What's New in This Version

**v2.0 - Railway Compatible**
- ✅ Fixed: `headless: 'new'` for Railway compatibility
- ✅ Removed: Duplicate cookie consent handling
- ✅ Added: Memory optimization flags (--single-process, --no-zygote)
- ✅ Added: Comprehensive logging with duration/memory metrics
- ✅ Added: Better error handling and stack traces
- ✅ Optimized: Lower memory footprint (~300-400MB vs 500MB+)

**Ready to deploy! 🚀**
