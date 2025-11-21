import * as cron from "node-cron";
import type { IStorage } from "./storage";
import { getAuthStatus } from "./auth-monitor";
import { calculateUnsignedScore } from "./scoring";
import type { InsertPlaylistSnapshot } from "@shared/schema";
import type { ScrapeResult } from "./scraper";

/**
 * Automated Scraping Scheduler
 * 
 * Manages scheduled jobs for automatic playlist scraping.
 * All jobs are controlled by the ENABLE_AUTO_SCRAPE environment variable.
 * 
 * Cron format: minute hour day month weekday
 * 
 * Examples:
 *   '0 9 * * 5' = Every Friday at 9:00 AM
 *   '0 0 * * 0' = Every Sunday at midnight
 *   '0 /6 * * *' = Every 6 hours (note: use asterisk/6 without spaces)
 */

interface ScheduledJob {
  name: string;
  schedule: string;
  description: string;
  task: () => Promise<void>;
  cronJob?: ReturnType<typeof cron.schedule>;
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
 * Get the start of the current week (Monday)
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Run the playlist update job manually (exported for API endpoint)
 */
export async function runPlaylistUpdateJob() {
  const { storage } = await import("./storage");
  console.log("🎵 Starting batch playlist update...");
  
  try {
    // Get all tracked playlists
    const allPlaylists = await storage.getTrackedPlaylists();
    console.log(`📋 Found ${allPlaylists.length} total tracked playlists`);
    
    // Get the week string for checking which playlists were already updated THIS week
    const today = new Date();
    const weekStart = getWeekStart(today);
    const currentWeek = weekStart.toISOString().split('T')[0];
    
    // Check which playlists have already been processed this specific week
    const playlistsUpdatedThisWeek = new Set<string>();
    for (const playlist of allPlaylists) {
      if (playlist.lastChecked) {
        const lastCheckedDate = new Date(playlist.lastChecked);
        const lastCheckedWeek = getWeekStart(lastCheckedDate).toISOString().split('T')[0];
        if (lastCheckedWeek === currentWeek) {
          playlistsUpdatedThisWeek.add(playlist.id);
        }
      }
    }
    
    // Only process playlists that haven't been scraped THIS week yet
    const playlistsNeedingUpdate = allPlaylists.filter(p => !playlistsUpdatedThisWeek.has(p.id));
    
    console.log(`🔄 ${playlistsNeedingUpdate.length} playlists need updating this week (${playlistsUpdatedThisWeek.size} already done)`);
    
    if (playlistsNeedingUpdate.length === 0) {
      console.log("✅ All playlists already updated this week!");
      return;
    }
    
    // Process next batch (4 playlists per 15-min cycle)
    const BATCH_SIZE = 4;
    const batch = playlistsNeedingUpdate.slice(0, BATCH_SIZE);
    
    console.log(`📦 Processing batch of ${batch.length} playlists`);
    
    for (const playlist of batch) {
      try {
        console.log(`🎵 Scraping: ${playlist.name} (${playlist.id})`);
        
        const microserviceUrl = process.env.SCRAPER_API_URL;
        let result: ScrapeResult | undefined;
        
        // Try microservice first, fall back to direct scraping if it fails
        if (microserviceUrl) {
          try {
            console.log("  Using microservice...");
            const response = await fetch(`${microserviceUrl}/scrape-playlist`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playlistUrl: playlist.spotifyUrl }),
            });
            
            // Check if response is JSON
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              result = await response.json() as ScrapeResult;
            } else {
              console.log("  ⚠️  Microservice returned non-JSON, falling back to direct scraping...");
              throw new Error("Microservice returned non-JSON response");
            }
          } catch (error) {
            console.log("  ⚠️  Microservice failed, using direct scraping...");
            const { scrapeSpotifyPlaylist } = await import("./scraper");
            result = await scrapeSpotifyPlaylist(playlist.spotifyUrl);
          }
        } else {
          console.log("  Using direct scraping...");
          const { scrapeSpotifyPlaylist } = await import("./scraper");
          result = await scrapeSpotifyPlaylist(playlist.spotifyUrl);
        }
        
        if (result?.success && result.tracks) {
          console.log(`  ✅ Scraped ${result.tracks.length} tracks`);
          
          const today = new Date().toISOString().split('T')[0];
          const tracksToInsert: InsertPlaylistSnapshot[] = result.tracks.map(track => {
            const score = calculateUnsignedScore({
              playlistName: playlist.name,
              label: null,
              publisher: null,
              writer: null,
            });
            
            return {
              week: today,
              playlistName: playlist.name,
              playlistId: playlist.id,
              trackName: track.trackName,
              artistName: track.artistName,
              albumArt: track.albumArt || null,
              spotifyUrl: track.spotifyUrl,
              isrc: null,
              label: null,
              unsignedScore: score,
              addedAt: new Date(),
              dataSource: "scraped",
            };
          });
          
          const insertedIds = await storage.insertTracks(tracksToInsert);
          await storage.updatePlaylistLastChecked(playlist.id);
          
          console.log(`  ✅ Processed ${result.tracks.length} tracks (new tracks inserted, duplicates updated)`);
          
          // Automatically queue newly inserted tracks for enrichment (artwork, metadata, etc.)
          if (insertedIds.length > 0) {
            console.log(`  🔄 Queueing ${insertedIds.length} tracks for enrichment...`);
            
            const { getJobQueue } = await import("./enrichment/jobQueueManager");
            const jobQueue = getJobQueue();
            
            if (jobQueue) {
              await jobQueue.enqueue({
                type: 'enrich-tracks',
                trackIds: insertedIds,
                playlistId: playlist.id,
              });
              
              // Update lastEnrichmentAttempt to prevent duplicate queuing if worker crashes
              await storage.updateBatchLastEnrichmentAttempt(insertedIds);
              
              console.log(`  ✅ Queued ${insertedIds.length} tracks for automatic enrichment`);
            } else {
              console.error("  ❌ Job queue not initialized - tracks will not be enriched");
            }
          }
        } else {
          console.error(`  ❌ Scrape failed for ${playlist.name}:`, result?.error);
        }
      } catch (error) {
        console.error(`  ❌ Error processing playlist ${playlist.name}:`, error);
        // Continue to next playlist despite error
      }
      
      // Small delay between playlists to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`✅ Batch complete. ${playlistsNeedingUpdate.length - batch.length} playlists remaining for this week.`);
  } catch (error) {
    console.error("❌ Batch playlist update error:", error);
    throw error;
  }
}

/**
 * Initialize the scheduler with storage
 * This is called from the main server file
 */
export async function initializeScheduler(storage: IStorage) {
  console.log("🔧 Initializing scheduler with storage...");
  
  // Register all playlists weekly update job (staggered updates)
  registerJob(
    "All Playlists Weekly Update",
    "*/15 10-12 * * 5", // Every 15 minutes on Fridays from 10:00-12:00 UTC (5-7 AM EST)
    "Every 15 minutes on Fridays 10:00-12:00 UTC",
    runPlaylistUpdateJob
  );
  
  // Register failed enrichment retry job
  registerJob(
    "Failed Enrichment Retry",
    "0 2 * * *", // Every day at 2:00 AM
    "Daily at 2:00 AM",
    async () => {
      console.log("🔄 Starting failed enrichment retry job...");
      
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Find tracks that need retry (failed or no_data, last attempt > 7 days ago)
        const tracksNeedingRetry = await storage.getTracksNeedingRetry(sevenDaysAgo);
        
        if (tracksNeedingRetry.length === 0) {
          console.log("✅ No tracks need retry");
          return;
        }
        
        console.log(`📋 Found ${tracksNeedingRetry.length} tracks needing retry`);
        
        // Queue them for enrichment (limit to 100 per day to avoid overwhelming the system)
        const tracksToRetry = tracksNeedingRetry.slice(0, 100);
        const trackIds = tracksToRetry.map(t => t.id);
        
        // Import job queue
        const { getJobQueue } = await import("./enrichment/jobQueueManager");
        const jobQueue = getJobQueue();
        
        if (jobQueue) {
          await jobQueue.enqueue({
            type: 'enrich-tracks',
            trackIds,
            playlistId: null, // Mixed playlists
          });
          
          // Update lastEnrichmentAttempt to prevent duplicate queuing if worker crashes
          await storage.updateBatchLastEnrichmentAttempt(trackIds);
          
          console.log(`✅ Queued ${trackIds.length} tracks for retry enrichment`);
        } else {
          console.error("❌ Job queue not initialized");
        }
      } catch (error) {
        console.error("❌ Failed enrichment retry error:", error);
        throw error;
      }
    }
  );
  
  // Register weekly performance snapshot job (Spotify + YouTube)
  registerJob(
    "Weekly Performance Snapshots",
    "59 4 * * 5", // Every Friday at 4:59 AM UTC (Thursday 11:59 PM EST)
    "Thursdays at 11:59 PM EST (Friday 4:59 AM UTC)",
    async () => {
      console.log("📊 Starting weekly performance snapshot capture (Spotify + YouTube)...");
      console.log("⏱️  Queueing enrichment jobs to refresh streaming data before snapshot...");
      
      try {
        // Get all tracks with streaming data
        const tracks = await db
          .select({
            id: playlistSnapshots.id,
          })
          .from(playlistSnapshots)
          .where(sql`(${playlistSnapshots.spotifyStreams} IS NOT NULL OR ${playlistSnapshots.youtubeViews} IS NOT NULL)`);

        console.log(`Found ${tracks.length} tracks with streaming data to refresh`);

        if (tracks.length === 0) {
          console.log("⚠️ No tracks with streaming data found to snapshot");
          return;
        }

        // Import job queue
        const { getJobQueue } = await import("./enrichment/jobQueueManager");
        const jobQueue = getJobQueue();

        if (!jobQueue) {
          throw new Error("Job queue not initialized");
        }

        // Queue enrichment jobs in batches of 50
        const batchSize = 50;
        const batches: string[][] = [];
        for (let i = 0; i < tracks.length; i += batchSize) {
          batches.push(tracks.slice(i, i + batchSize).map(t => t.id));
        }

        for (const [index, batch] of batches.entries()) {
          // Only set captureSnapshotAfter flag for the LAST batch to avoid duplicate snapshot captures
          const isLastBatch = index === batches.length - 1;
          const job = await jobQueue.enqueue({
            type: 'enrich-tracks',
            playlistId: null,
            trackIds: batch,
            targetPhase: null, // Will run all phases, but we care about 2 and 6
            captureSnapshotAfter: isLastBatch ? 1 : 0, // Only capture snapshot after last batch completes
          });
          console.log(`✅ Queued enrichment job ${index + 1}/${batches.length}: ${job.id} (${batch.length} tracks)${isLastBatch ? ' [WILL CAPTURE SNAPSHOT]' : ''}`);
        }

        console.log(`✅ Queued ${batches.length} enrichment job(s) for ${tracks.length} tracks. Snapshots will be captured automatically when enrichment completes.`);
      } catch (error) {
        console.error("❌ Weekly performance snapshot queueing error:", error);
        throw error;
      }
    }
  );
  
  // Start the scheduler (will only actually start if ENABLE_AUTO_SCRAPE=true)
  startScheduler();
}
