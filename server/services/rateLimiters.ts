/**
 * Rate limiter utilities for external API providers
 * Ensures we don't exceed rate limits when processing playlists in parallel
 */

import pLimit from 'p-limit';

/**
 * Chartmetric API rate limiter
 * - Limit: 30 requests/minute (~1 request every 2 seconds)
 * - Global limiter shared across all playlists
 */
export const chartmetricLimiter = pLimit(1);
export const CHARTMETRIC_DELAY_MS = 2000; // 2 seconds between requests

/**
 * Spotify API rate limiter
 * - Allows 3-5 concurrent requests
 * - Shared across all playlists to avoid token refresh churn
 */
export const spotifyLimiter = pLimit(3);

/**
 * Puppeteer browser pool limiter
 * - Max 2 concurrent browser instances to control RAM usage
 * - Each browser session can handle one playlist at a time
 */
export const puppeteerLimiter = pLimit(2);

/**
 * Playlist processing limiter
 * - Process 3 playlists concurrently
 * - Balances throughput with resource usage
 */
export const playlistLimiter = pLimit(3);

/**
 * Helper to add delay for rate limiting
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
