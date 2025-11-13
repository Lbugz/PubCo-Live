import type { EnrichmentJob, InsertEnrichmentJob } from "@shared/schema";
import type { IStorage } from "../storage";

export interface JobQueueOptions {
  maxConcurrency?: number;
  storage: IStorage;
}

export class JobQueue {
  private maxConcurrency: number;
  private storage: IStorage;

  constructor(options: JobQueueOptions) {
    this.maxConcurrency = options.maxConcurrency || 1;
    this.storage = options.storage;
  }

  async initialize() {
    const runningJobs = await this.storage.getEnrichmentJobsByStatus(['running']);
    
    for (const job of runningJobs) {
      await this.storage.updateEnrichmentJob(job.id, {
        status: 'queued',
        logs: [...(job.logs || []), `[${new Date().toISOString()}] Job reset to queued after process restart`],
        updatedAt: new Date(),
      });
    }

    const queuedJobs = await this.storage.getEnrichmentJobsByStatus(['queued']);
    console.log(`📦 JobQueue initialized with ${queuedJobs.length} pending jobs`);
  }

  async enqueue(jobData: InsertEnrichmentJob): Promise<EnrichmentJob> {
    const job = await this.storage.createEnrichmentJob({
      ...jobData,
      totalTracks: jobData.trackIds.length,
    });

    console.log(`✅ Job ${job.id} enqueued (${job.trackIds.length} tracks)`);
    return job;
  }

  async getNextJob(): Promise<EnrichmentJob | null> {
    try {
      return await this.storage.claimNextEnrichmentJob();
    } catch (error) {
      console.error(`❌ Failed to claim next job:`, error);
      return null;
    }
  }

  async updateJobProgress(
    jobId: string,
    updates: {
      progress?: number;
      enrichedTracks?: number;
      errorCount?: number;
      logs?: string[];
    }
  ): Promise<void> {
    const currentJob = await this.storage.getEnrichmentJobById(jobId);
    if (!currentJob) {
      console.warn(`⚠️ Job ${jobId} not found`);
      return;
    }

    const newLogs = updates.logs
      ? [...(currentJob.logs || []), ...updates.logs]
      : currentJob.logs;

    await this.storage.updateEnrichmentJob(jobId, {
      progress: updates.progress,
      enrichedTracks: updates.enrichedTracks,
      errorCount: updates.errorCount,
      logs: newLogs,
      updatedAt: new Date(),
    });
  }

  async completeJob(jobId: string, success: boolean, finalLogs?: string[]): Promise<void> {
    const currentJob = await this.storage.getEnrichmentJobById(jobId);
    if (!currentJob) {
      console.warn(`⚠️ Job ${jobId} not found`);
      return;
    }

    const logs = finalLogs
      ? [...(currentJob.logs || []), ...finalLogs]
      : currentJob.logs;

    await this.storage.updateEnrichmentJob(jobId, {
      status: success ? 'completed' : 'failed',
      progress: success ? 100 : currentJob.progress,
      logs,
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`${success ? '✅' : '❌'} Job ${jobId} ${success ? 'completed' : 'failed'}`);
  }

  async getJob(jobId: string): Promise<EnrichmentJob | null> {
    return await this.storage.getEnrichmentJobById(jobId);
  }

  async getQueueSize(): Promise<number> {
    const queuedJobs = await this.storage.getEnrichmentJobsByStatus(['queued']);
    return queuedJobs.length;
  }
}
