# Railway "Cannot find module" Fix

## ❌ Problem
```
Error: Cannot find module '/app/server.js'
code: 'MODULE_NOT_FOUND'
```

Railway is looking for files in the wrong directory!

## ✅ Solution: Set Root Directory

### **Railway Dashboard Steps:**

1. **Open Railway Dashboard** (https://railway.app)
2. **Click on your project** (terrific-appreciation)
3. **Click on your service** (the one showing the error)
4. **Click "Settings"** tab
5. **Scroll to "Build"** section
6. **Find "Root Directory"** field
7. **Enter**: `scraper-microservice`
8. **Scroll down** and click "Deploy" or wait for auto-redeploy

---

## 🎯 What This Does

Tells Railway: "All my code is in the `scraper-microservice/` folder, not the root!"

Before:
```
/ (root)
  ├── client/
  ├── server/
  └── scraper-microservice/  ← Railway can't find this!
      ├── Dockerfile
      └── server.js
```

After setting Root Directory:
```
scraper-microservice/  ← Railway starts here!
  ├── Dockerfile
  ├── server.js
  └── package.json
```

---

## 📸 Visual Guide

**Where to find it:**
```
Railway Dashboard
  → Your Project (terrific-appreciation)
    → Service Settings
      → Build section
        → Root Directory: [Enter: scraper-microservice]
```

---

## ✅ After Setting Root Directory

You should see:
1. Railway triggers a new build
2. Build logs show: "Building Dockerfile"
3. No more "Cannot find module" errors
4. Deployment succeeds! ✨

---

## 🐛 If You Still See Errors

**Check the logs for:**
- "Building Dockerfile" ✅ Good!
- "Using Dockerfile at scraper-microservice/Dockerfile" ✅ Good!
- "Error: Cannot find module" ❌ Root directory not set correctly

**Make sure you:**
- Typed `scraper-microservice` exactly (no slashes, no spaces)
- Clicked "Redeploy" or waited for auto-deploy
- Are looking at the latest deployment logs

---

## 🆘 Can't Find "Root Directory" Setting?

Some Railway UI versions have it in different places:

**Try looking in:**
- Settings → Service → Build
- Settings → General → Source
- Settings → Deploy → Configuration

**Or use Railway CLI:**
```bash
railway up --service scraper-microservice
```

---

## ✨ Expected Success

Once fixed, you'll see in Railway logs:
```
Building Dockerfile...
[+] Building 120s
Step 1/10: FROM ubuntu:22.04
Step 2/10: RUN apt-get update...
...
Successfully built!
Deployment successful ✓
```

Then your scraper will be live! 🚀
