import puppeteer from "puppeteer";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Automated Spotify Cookie Capture Script
 * 
 * This script automates the process of extracting Spotify authentication cookies
 * for use in the AI Pub Feed scraping system.
 * 
 * Usage:
 *   1. Run: node spotify-auth-export.js
 *   2. Log into Spotify when the browser window opens
 *   3. Press ENTER in the terminal after logging in
 *   4. Cookies will be saved and displayed for Replit Secrets
 * 
 * Note: This script must be run locally (not in Replit) as it requires a GUI browser.
 */

(async () => {
  console.log("\n🎵 Spotify Cookie Capture Tool\n");
  console.log("This tool will help you extract Spotify authentication cookies");
  console.log("for automated playlist scraping.\n");

  let browser;
  
  try {
    console.log("🌐 Launching browser...");
    
    // Launch browser in non-headless mode so user can see login
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Navigate to Spotify login
    console.log("🔐 Navigating to Spotify login page...");
    await page.goto("https://accounts.spotify.com/en/login", { 
      waitUntil: "networkidle2",
      timeout: 30000
    });

    console.log("\n✋ ACTION REQUIRED:");
    console.log("   1. Log into Spotify in the browser window");
    console.log("   2. Wait for the page to fully load after login");
    console.log("   3. Press ENTER in this terminal when ready\n");

    // Wait for user to press ENTER
    await new Promise(resolve => {
      process.stdin.once("data", () => {
        console.log("✅ Continuing...");
        resolve();
      });
    });

    // Extract cookies
    console.log("\n🍪 Extracting cookies...");
    const cookies = await page.cookies();
    
    if (cookies.length === 0) {
      throw new Error("No cookies found. Make sure you logged in successfully.");
    }

    // Check for the critical sp_dc cookie
    const spDcCookie = cookies.find(c => c.name === 'sp_dc');
    if (!spDcCookie) {
      console.warn("⚠️  Warning: sp_dc cookie not found. This is the main auth cookie.");
      console.warn("   Make sure you're fully logged in to Spotify.");
    }

    // Save cookies to file
    const cookiesJson = JSON.stringify(cookies, null, 2);
    const cookiesPath = `${__dirname}/spotify-cookies.json`;
    fs.writeFileSync(cookiesPath, cookiesJson);
    
    console.log(`\n✅ Cookies saved to: ${cookiesPath}`);
    console.log(`   Total cookies: ${cookies.length}`);
    
    if (spDcCookie) {
      console.log(`   ✓ sp_dc cookie found (expires: ${new Date(spDcCookie.expires * 1000).toLocaleDateString()})`);
    }

    // Display instructions for Replit Secrets
    console.log("\n📋 NEXT STEPS:");
    console.log("   1. Copy the entire contents of spotify-cookies.json");
    console.log("   2. In Replit, open the Secrets tool (lock icon)");
    console.log("   3. Create a new secret:");
    console.log("      Name: SPOTIFY_COOKIES_JSON");
    console.log("      Value: [paste the entire JSON content]");
    console.log("\n   OR use the file directly for local development.\n");

    // Optional: Copy to clipboard if clipboardy is installed
    try {
      const { default: clipboardy } = await import('clipboardy');
      await clipboardy.write(cookiesJson);
      console.log("📋 Cookies copied to clipboard!\n");
    } catch (err) {
      console.log("💡 Tip: Install 'clipboardy' to auto-copy cookies to clipboard\n");
    }

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nTroubleshooting:");
    console.error("  - Make sure you have Puppeteer installed: npm install puppeteer");
    console.error("  - Ensure you're running this locally (not in Replit)");
    console.error("  - Check your internet connection");
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("🔒 Browser closed.");
    }
  }
})();
