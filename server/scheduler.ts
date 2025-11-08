import cron from "node-cron";
import type { IStorage } from "./storage";
import { getAuthStatus } from "./auth-monitor";

/**
 * Automated Scraping Scheduler
 * 
 * Manages scheduled jobs for automatic playlist scraping.
 * All jobs are controlled by the ENABLE_AUTO_SCRAPE environment variable.
 * 
 * Scheduling format (cron):
 *   ┌────────────── second (optional, 0-59)
 *   │ ┌──────────── minute (0-59)
 *   │ │ ┌────────── hour (0-23)
 *   │ │ │ ┌──────── day of month (1-31)
 *   │ │ │ │ ┌────── month (1-12)
 *   │ │ │ │ │ ┌──── day of week (0-7, 0/7 = Sunday)
 *   │ │ │ │ │ │
 *   * * * * * *
 * 
 * Examples:
 *   '0 9 * * 5' = Every Friday at 9:00 AM
 *   '0 0 * * 0' = Every Sunday at midnight
 *   '0 */6 * * *' = Every 6 hours
 */

interface ScheduledJob {
  name: string;
  schedule: string;
  description: string;
  task: () => Promise<void>;
  cronJob?: cron.ScheduledTask;
}

const scheduledJobs: ScheduledJob[] = [];

/**
 * Check if automatic scraping is enabled
 */
function isAutoScrapeEnabled(): boolean {
  const enabled = process.env.ENABLE_AUTO_SCRAPE === 'true';
  return enabled;
}

/**
 * Register a scheduled job
 */
export function registerJob(
  name: string,
  schedule: string,
  description: string,
  task: () => Promise<void>
) {
  const job: ScheduledJob = {
    name,
    schedule,
    description,
    task,
  };
  
  scheduledJobs.push(job);
  console.log(`📅 Registered job: ${name}`);
  console.log(`   Schedule: ${schedule} (${description})`);
}

/**
 * Start all registered scheduled jobs
 */
export function startScheduler() {
  const enabled = isAutoScrapeEnabled();
  
  console.log("\n" + "=".repeat(70));
  console.log("⏰ SCHEDULER INITIALIZATION");
  console.log("=".repeat(70));
  console.log(`Status: ${enabled ? '✅ ENABLED' : '⏸️  DISABLED'}`);
  console.log(`Environment: ENABLE_AUTO_SCRAPE=${process.env.ENABLE_AUTO_SCRAPE || 'not set'}`);
  console.log(`Registered Jobs: ${scheduledJobs.length}`);
  
  if (!enabled) {
    console.log("\n💡 To enable automatic scraping:");
    console.log("   1. Add a Replit Secret: ENABLE_AUTO_SCRAPE = true");
    console.log("   2. Restart the application");
    console.log("=".repeat(70) + "\n");
    return;
  }
  
  // Check auth status before starting
  const authStatus = getAuthStatus();
  if (!authStatus.lastSuccessfulAuth) {
    console.warn("\n⚠️  WARNING: No successful authentication detected!");
    console.warn("   Scheduled jobs may fail without valid Spotify cookies.");
    console.warn("   Run: node spotify-auth-export.js");
  }
  
  console.log("\n🚀 Starting scheduled jobs:");
  
  for (const job of scheduledJobs) {
    // Create and start the cron job
    job.cronJob = cron.schedule(job.schedule, async () => {
      console.log(`\n⏰ [${new Date().toISOString()}] Running: ${job.name}`);
      try {
        await job.task();
        console.log(`✅ [${new Date().toISOString()}] Completed: ${job.name}`);
      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Failed: ${job.name}`);
        console.error(error);
      }
    }, {
      scheduled: true,
      timezone: "America/New_York" // Adjust timezone as needed
    });
    
    console.log(`   ✓ ${job.name}`);
    console.log(`     Schedule: ${job.schedule} (${job.description})`);
  }
  
  console.log("\n" + "=".repeat(70) + "\n");
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler() {
  console.log("⏹️  Stopping scheduler...");
  
  for (const job of scheduledJobs) {
    if (job.cronJob) {
      job.cronJob.stop();
      console.log(`   Stopped: ${job.name}`);
    }
  }
  
  console.log("✅ Scheduler stopped");
}

/**
 * Get status of all scheduled jobs
 */
export function getSchedulerStatus() {
  return {
    enabled: isAutoScrapeEnabled(),
    jobs: scheduledJobs.map(job => ({
      name: job.name,
      schedule: job.schedule,
      description: job.description,
      running: job.cronJob ? true : false,
    })),
  };
}

/**
 * Initialize the scheduler with storage
 * This is called from the main server file
 */
export async function initializeScheduler(storage: IStorage) {
  console.log("🔧 Initializing scheduler with storage...");
  
  // Register Fresh Finds weekly scrape job
  registerJob(
    "Fresh Finds Weekly Update",
    "0 9 * * 5", // Every Friday at 9:00 AM
    "Fridays at 9:00 AM",
    async () => {
      console.log("🎵 Starting Fresh Finds weekly scrape...");
      
      // Fresh Finds playlist URL
      const FRESH_FINDS_URL = "https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n";
      
      try {
        // Try microservice first, fall back to direct scraping
        let result;
        const microserviceUrl = process.env.SCRAPER_API_URL;
        
        if (microserviceUrl) {
          console.log("Using microservice for Fresh Finds scrape...");
          const response = await fetch(`${microserviceUrl}/scrape-playlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playlistUrl: FRESH_FINDS_URL }),
          });
          
          result = await response.json();
        } else {
          console.log("Microservice not available, using direct scraping...");
          const { scrapeSpotifyPlaylist } = await import("./scraper");
          result = await scrapeSpotifyPlaylist(FRESH_FINDS_URL);
        }
        
        if (result.success && result.tracks) {
          console.log(`✅ Scraped ${result.tracks.length} tracks from Fresh Finds`);
          
          // Store tracks in database
          const weekId = `week-${new Date().toISOString().split('T')[0]}`;
          
          for (const track of result.tracks) {
            await storage.createTrack({
              weekId,
              playlistName: result.playlistName || "Fresh Finds",
              trackName: track.trackName,
              artistName: track.artistName,
              album: track.album,
              duration: track.duration,
              spotifyUrl: track.spotifyUrl,
              addedAt: new Date(),
            });
          }
          
          console.log(`✅ Stored ${result.tracks.length} tracks in database`);
        } else {
          console.error("❌ Scrape failed:", result.error);
        }
      } catch (error) {
        console.error("❌ Fresh Finds scrape error:", error);
        throw error;
      }
    }
  );
  
  // Future jobs can be registered here:
  // - Other playlist updates
  // - Data enrichment jobs
  // - Cleanup/maintenance tasks
  
  // Start the scheduler (will only actually start if ENABLE_AUTO_SCRAPE=true)
  startScheduler();
}
