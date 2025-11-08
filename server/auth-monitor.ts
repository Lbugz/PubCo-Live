import fs from "fs";
import path from "path";

/**
 * Authentication Monitor
 * 
 * Tracks Spotify cookie validity and provides warnings when authentication fails.
 * Helps identify when cookies need to be refreshed.
 */

const AUTH_LOG_FILE = path.join(process.cwd(), "auth-status.json");

interface AuthStatus {
  lastSuccessfulAuth: string | null;
  lastFailedAuth: string | null;
  consecutiveFailures: number;
  cookieSource: "secret" | "file" | "none";
  cookieExpiry: string | null;
}

let authStatus: AuthStatus = {
  lastSuccessfulAuth: null,
  lastFailedAuth: null,
  consecutiveFailures: 0,
  cookieSource: "none",
  cookieExpiry: null,
};

// Load existing auth status on startup
try {
  if (fs.existsSync(AUTH_LOG_FILE)) {
    const data = fs.readFileSync(AUTH_LOG_FILE, "utf8");
    authStatus = JSON.parse(data);
  }
} catch (error) {
  console.warn("Could not load auth status:", error);
}

function saveAuthStatus() {
  try {
    fs.writeFileSync(AUTH_LOG_FILE, JSON.stringify(authStatus, null, 2));
  } catch (error) {
    console.warn("Could not save auth status:", error);
  }
}

/**
 * Record a successful authentication
 */
export function recordAuthSuccess(cookieSource: "secret" | "file", expiryDate?: Date) {
  authStatus.lastSuccessfulAuth = new Date().toISOString();
  authStatus.consecutiveFailures = 0;
  authStatus.cookieSource = cookieSource;
  authStatus.cookieExpiry = expiryDate ? expiryDate.toISOString() : null;
  saveAuthStatus();
  
  console.log(`✅ Auth successful (source: ${cookieSource})`);
  if (expiryDate) {
    console.log(`   Cookie expires: ${expiryDate.toLocaleDateString()}`);
  }
}

/**
 * Record an authentication failure
 */
export function recordAuthFailure(errorCode?: number, errorMessage?: string) {
  authStatus.lastFailedAuth = new Date().toISOString();
  authStatus.consecutiveFailures++;
  saveAuthStatus();
  
  const failureCount = authStatus.consecutiveFailures;
  
  console.error("\n" + "=".repeat(70));
  console.error("❌ SPOTIFY AUTHENTICATION FAILED");
  console.error("=".repeat(70));
  
  if (errorCode === 401) {
    console.error("🔐 Status: 401 Unauthorized - Cookies expired or invalid");
  } else if (errorCode === 403) {
    console.error("🚫 Status: 403 Forbidden - Access denied");
  } else if (errorMessage) {
    console.error(`⚠️  Error: ${errorMessage}`);
  }
  
  console.error(`\n📊 Failure Count: ${failureCount} consecutive failures`);
  
  if (authStatus.lastSuccessfulAuth) {
    const lastSuccess = new Date(authStatus.lastSuccessfulAuth);
    const hoursSinceSuccess = Math.floor((Date.now() - lastSuccess.getTime()) / (1000 * 60 * 60));
    console.error(`   Last successful auth: ${lastSuccess.toLocaleString()} (${hoursSinceSuccess}h ago)`);
  } else {
    console.error("   Last successful auth: Never");
  }
  
  if (authStatus.cookieExpiry) {
    const expiryDate = new Date(authStatus.cookieExpiry);
    const isExpired = expiryDate < new Date();
    if (isExpired) {
      console.error(`   ⏰ Cookie expiry: ${expiryDate.toLocaleString()} (EXPIRED)`);
    } else {
      console.error(`   Cookie expiry: ${expiryDate.toLocaleString()}`);
    }
  }
  
  console.error("\n🔧 RECOMMENDED ACTIONS:");
  console.error("   1. Run the cookie capture script locally:");
  console.error("      → node spotify-auth-export.js");
  console.error("\n   2. Update the SPOTIFY_COOKIES_JSON secret in Replit");
  console.error("      → Paste the new cookies from spotify-cookies.json");
  console.error("\n   3. Restart the application");
  
  if (failureCount >= 3) {
    console.error("\n⚠️  WARNING: Multiple consecutive failures detected!");
    console.error("   Your cookies are likely expired. Please refresh them immediately.");
  }
  
  console.error("=".repeat(70) + "\n");
}

/**
 * Check if authentication is likely healthy
 */
export function isAuthHealthy(): boolean {
  // If we have recent failures, auth is unhealthy
  if (authStatus.consecutiveFailures > 0) {
    return false;
  }
  
  // If cookies are expired, auth is unhealthy
  if (authStatus.cookieExpiry) {
    const expiryDate = new Date(authStatus.cookieExpiry);
    if (expiryDate < new Date()) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get current auth status for monitoring
 */
export function getAuthStatus(): AuthStatus {
  return { ...authStatus };
}

/**
 * Reset failure count (useful after successful auth)
 */
export function resetFailureCount() {
  authStatus.consecutiveFailures = 0;
  saveAuthStatus();
}
