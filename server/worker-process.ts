import { storage } from "./storage";
import { JobQueue } from "./enrichment/jobQueue";
import { EnrichmentWorker } from "./enrichment/worker";

console.log("🔧 Starting standalone enrichment worker...");

const jobQueue = new JobQueue({
  maxConcurrency: 1,
  storage,
});

await jobQueue.initialize();

const worker = new EnrichmentWorker({
  jobQueue,
  storage,
  wsBroadcast: undefined,
});

worker.start();

console.log("✅ Standalone enrichment worker running");

process.on('SIGINT', () => {
  console.log("\n🛑 Shutting down worker...");
  worker.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log("\n🛑 Shutting down worker...");
  worker.stop();
  process.exit(0);
});
