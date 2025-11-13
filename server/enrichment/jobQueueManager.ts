import { JobQueue } from "./jobQueue";
import { EnrichmentWorker } from "./worker";
import { storage } from "../storage";

let jobQueue: JobQueue | null = null;
let worker: EnrichmentWorker | null = null;

export interface JobQueueManagerOptions {
  wsBroadcast?: (event: string, data: any) => void;
}

export async function initializeJobQueue(options?: JobQueueManagerOptions): Promise<void> {
  if (jobQueue) {
    console.log("⚠️ Job queue already initialized");
    return;
  }

  console.log("🔧 Initializing job queue and worker...");

  jobQueue = new JobQueue({
    maxConcurrency: 1,
    storage,
  });

  await jobQueue.initialize();

  worker = new EnrichmentWorker({
    jobQueue,
    storage,
    wsBroadcast: options?.wsBroadcast,
  });

  worker.start();

  console.log("✅ Job queue and worker initialized successfully");
}

export function getJobQueue(): JobQueue | null {
  return jobQueue;
}

export function getWorker(): EnrichmentWorker | null {
  return worker;
}

export async function shutdownJobQueue(): Promise<void> {
  if (worker) {
    worker.stop();
    worker = null;
  }

  jobQueue = null;

  console.log("🛑 Job queue and worker shut down");
}
