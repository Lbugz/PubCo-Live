# GitHub Auto-Deploy Setup Guide

## 📋 What You'll Need
- GitHub account (free)
- Railway account (free tier works!)
- 5-10 minutes

---

## Step 1: Create GitHub Repository

### Option A: GitHub Web Interface (Easiest)

1. **Go to GitHub**: https://github.com
2. **Click** the "+" icon (top right) → "New repository"
3. **Fill in details**:
   - Repository name: `spotify-playlist-scraper`
   - Description: `Railway-hosted Spotify editorial playlist scraper`
   - Visibility: **Private** (recommended) or Public
   - ✅ **Do NOT** initialize with README (we already have files)
4. **Click** "Create repository"
5. **Copy the repository URL** (you'll see it on the next page)
   - Example: `https://github.com/YOUR_USERNAME/spotify-playlist-scraper.git`

### Option B: GitHub CLI (if installed)
```bash
gh repo create spotify-playlist-scraper --private --source=. --remote=origin
```

---

## Step 2: Push Your Code to GitHub

**Open your terminal/shell** and run these commands:

```bash
# Navigate to scraper directory
cd scraper-microservice

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit the changes
git commit -m "Railway scraper with headless mode fix"

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/spotify-playlist-scraper.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Replace `YOUR_USERNAME` with your actual GitHub username!**

---

## Step 3: Connect Railway to GitHub

1. **Go to Railway**: https://railway.app
   - Sign up/login (you can use your GitHub account!)

2. **Click** "New Project"

3. **Select** "Deploy from GitHub repo"
   - If this is your first time: Railway will ask to connect your GitHub account
   - Click "Configure GitHub App" → Select your repositories
   - Choose "Only select repositories" → Select `spotify-playlist-scraper`

4. **Select your repository**: `spotify-playlist-scraper`

5. **Railway auto-detects Dockerfile**:
   - Railway will see your `Dockerfile` and start building automatically!
   - This takes 2-3 minutes

6. **Wait for deployment**:
   - You'll see build logs in real-time
   - Look for: "✓ Deployment successful" or similar

---

## Step 4: Get Your Railway URL

1. **In Railway dashboard**, click on your project
2. **Go to Settings** tab
3. **Scroll to** "Domains" section
4. **Click** "Generate Domain"
   - Railway creates a URL like: `spotify-playlist-scraper-production.up.railway.app`
5. **Copy this URL** (you'll need it for Replit)

---

## Step 5: Update Replit Secret

1. **Go back to your Replit project**
2. **Open Secrets** (🔒 icon in left sidebar, or Tools → Secrets)
3. **Find** `SCRAPER_API_URL` secret
4. **Update value** to your Railway URL:
   ```
   https://spotify-playlist-scraper-production.up.railway.app
   ```
   (use YOUR actual Railway URL!)
5. **Save** the secret

---

## Step 6: Test Your Deployment!

### Quick Health Check:
```bash
# Replace with YOUR Railway URL
curl https://spotify-playlist-scraper-production.up.railway.app/health
```

Expected response:
```json
{"status":"ok","service":"spotify-playlist-scraper"}
```

### Full Test in Your App:
1. Go to your Replit app
2. Navigate to **Playlists** view
3. Find **Fresh Finds Heavy** playlist
4. Click **"View Tracks"**
5. Watch the magic happen! 🎉

---

## 🎉 Success Indicators

You'll know it's working when you see:

✅ **In Railway logs**:
```
[Scraper] ✅ Cookies injected successfully
[Scraper] ✅ Accepted cookie consent
[Scraper] ✅ Success! Returning 160 tracks
[Scraper] Duration: 12.5s | Memory: 380MB
```

✅ **In your Replit app**:
- Track count shows 160+ tracks (not just 50)
- Tracks load within 15-20 seconds
- No error messages

---

## 🔄 Auto-Deploy (The Magic!)

**Every time you push changes to GitHub, Railway automatically redeploys!**

```bash
# Make changes to server.js
nano server.js

# Commit and push
git add .
git commit -m "Improved scrolling logic"
git push

# Railway auto-deploys in ~2 minutes! ✨
```

No manual redeployment needed!

---

## 📊 Monitoring Your Scraper

### Railway Dashboard Shows:
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time output from your scraper
- **Deployments**: History of all deploys
- **Usage**: Hours used (free tier = ~$5/month credit)

### How to View Logs:
1. Go to Railway dashboard
2. Click your project
3. Click "Deployments" tab
4. Click latest deployment
5. View real-time logs!

---

## 🐛 Troubleshooting

### Issue: "Repository not found"
**Fix:** Make sure you:
1. Created the GitHub repo
2. Connected Railway to your GitHub account
3. Gave Railway permission to access the repo

### Issue: "Build failed"
**Fix:** Check Railway logs for error. Common causes:
- Missing `Dockerfile` (should be in scraper-microservice/)
- Missing `package.json`
- Node.js version mismatch

### Issue: "Deployment succeeded but health check fails"
**Fix:**
1. Check if Railway generated a domain (Settings → Domains)
2. Verify the PORT environment variable (Railway sets this automatically)
3. Check Railway logs for startup errors

### Issue: "Still getting 50 tracks instead of 160+"
**Fix:**
1. Verify `SCRAPER_API_URL` secret is set correctly in Replit
2. Check Railway logs to see if requests are reaching it
3. Ensure cookies are being passed from Replit app

---

## 💰 Railway Free Tier Limits

Your scraper should work fine on free tier:
- ✅ 512MB RAM (our scraper uses ~380MB)
- ✅ $5/month execution credit (~500 hours)
- ✅ Unlimited deployments
- ⚠️ Sleeps after 15 min inactivity (wakes up on request)

**First request after sleep**: May take 5-10 seconds (cold start)
**Subsequent requests**: Fast (~2-3 seconds to start scraping)

---

## ✅ Checklist

Before you're done, make sure:
- [ ] GitHub repo created
- [ ] Code pushed to GitHub
- [ ] Railway connected to GitHub repo
- [ ] Deployment succeeded
- [ ] Railway domain generated
- [ ] `SCRAPER_API_URL` secret updated in Replit
- [ ] Health check returns `{"status":"ok"}`
- [ ] Fresh Finds Heavy shows 160+ tracks

---

## 🆘 Need Help?

**Railway Issues:**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

**GitHub Issues:**
- GitHub Docs: https://docs.github.com
- GitHub Help: https://support.github.com

**Still stuck?** Share the error message and I'll help debug!

---

## 🚀 You're Ready!

Once deployed, your scraper runs on Railway's infrastructure:
- ✅ Always available (even when Replit sleeps)
- ✅ Auto-deploys on git push
- ✅ Better performance than local Replit scraper
- ✅ Dedicated resources for scraping

**Happy scraping! 🎵**
