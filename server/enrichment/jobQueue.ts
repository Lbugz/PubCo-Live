import type { EnrichmentJob, InsertEnrichmentJob } from "@shared/schema";
import type { IStorage } from "../storage";

export interface JobQueueOptions {
  maxConcurrency?: number;
  storage: IStorage;
}

export class JobQueue {
  private jobs: Map<string, EnrichmentJob> = new Map();
  private maxConcurrency: number;
  private storage: IStorage;
  private activeJobId: string | null = null;

  constructor(options: JobQueueOptions) {
    this.maxConcurrency = options.maxConcurrency || 1;
    this.storage = options.storage;
  }

  async initialize() {
    const pendingJobs = await this.storage.getEnrichmentJobsByStatus(['queued', 'running']);
    
    for (const job of pendingJobs) {
      this.jobs.set(job.id, job);
      
      if (job.status === 'running') {
        await this.storage.updateEnrichmentJob(job.id, {
          status: 'queued',
          logs: [...(job.logs || []), `[${new Date().toISOString()}] Job reset to queued after server restart`],
          updatedAt: new Date(),
        });
        const updatedJob = await this.storage.getEnrichmentJobById(job.id);
        if (updatedJob) {
          this.jobs.set(job.id, updatedJob);
        }
      }
    }

    console.log(`📦 JobQueue initialized with ${this.jobs.size} pending jobs`);
  }

  async enqueue(jobData: InsertEnrichmentJob): Promise<EnrichmentJob> {
    const job = await this.storage.createEnrichmentJob({
      ...jobData,
      totalTracks: jobData.trackIds.length,
    });

    this.jobs.set(job.id, job);
    console.log(`✅ Job ${job.id} enqueued (${job.trackIds.length} tracks)`);

    return job;
  }

  async getNextJob(): Promise<EnrichmentJob | null> {
    if (this.activeJobId !== null) {
      return null;
    }

    const allJobs = Array.from(this.jobs.values());
    for (const job of allJobs) {
      if (job.status === 'queued') {
        this.activeJobId = job.id;
        
        await this.storage.updateEnrichmentJob(job.id, {
          status: 'running',
          updatedAt: new Date(),
        });

        const updatedJob = await this.storage.getEnrichmentJobById(job.id);
        if (updatedJob) {
          this.jobs.set(job.id, updatedJob);
          return updatedJob;
        }
      }
    }

    return null;
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
    const currentJob = this.jobs.get(jobId);
    if (!currentJob) {
      console.warn(`⚠️ Job ${jobId} not found in queue`);
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

    const updatedJob = await this.storage.getEnrichmentJobById(jobId);
    if (updatedJob) {
      this.jobs.set(jobId, updatedJob);
    }
  }

  async completeJob(jobId: string, success: boolean, finalLogs?: string[]): Promise<void> {
    const currentJob = this.jobs.get(jobId);
    if (!currentJob) {
      console.warn(`⚠️ Job ${jobId} not found in queue`);
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

    const updatedJob = await this.storage.getEnrichmentJobById(jobId);
    if (updatedJob) {
      this.jobs.set(jobId, updatedJob);
    }

    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }

    console.log(`${success ? '✅' : '❌'} Job ${jobId} ${success ? 'completed' : 'failed'}`);
  }

  async getJob(jobId: string): Promise<EnrichmentJob | null> {
    const cachedJob = this.jobs.get(jobId);
    if (cachedJob) {
      return cachedJob;
    }

    return await this.storage.getEnrichmentJobById(jobId);
  }

  getQueueSize(): number {
    let queuedCount = 0;
    const allJobs = Array.from(this.jobs.values());
    for (const job of allJobs) {
      if (job.status === 'queued') {
        queuedCount++;
      }
    }
    return queuedCount;
  }

  isRunning(): boolean {
    return this.activeJobId !== null;
  }

  getActiveJobId(): string | null {
    return this.activeJobId;
  }
}
