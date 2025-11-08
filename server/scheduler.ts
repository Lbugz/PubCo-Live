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
  
  // Jobs will be registered here as we add them
  // For now, this is just a placeholder
  
  // Start the scheduler (will only actually start if ENABLE_AUTO_SCRAPE=true)
  startScheduler();
}
