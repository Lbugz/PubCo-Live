import type { JobQueue } from "./jobQueue";
import type { IStorage } from "../storage";
import type { EnrichmentJob, PlaylistSnapshot } from "@shared/schema";
import { enrichTracksWithCredits } from "./spotifyCreditsScaper";
import type { WebSocket } from "ws";

export interface WorkerOptions {
  jobQueue: JobQueue;
  storage: IStorage;
  wsBroadcast?: (event: string, data: any) => void;
}

export class EnrichmentWorker {
  private jobQueue: JobQueue;
  private storage: IStorage;
  private wsBroadcast?: (event: string, data: any) => void;
  private isRunning: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(options: WorkerOptions) {
    this.jobQueue = options.jobQueue;
    this.storage = options.storage;
    this.wsBroadcast = options.wsBroadcast;
  }

  start() {
    if (this.isRunning) {
      console.log("⚠️ Worker already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Enrichment worker started");

    this.processingInterval = setInterval(async () => {
      await this.processNextJob();
    }, 2000);
  }

  stop() {
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log("🛑 Enrichment worker stopped");
  }

  private async processNextJob() {
    if (!this.isRunning) {
      return;
    }

    try {
      const job = await this.jobQueue.getNextJob();
      
      if (!job) {
        return;
      }

      console.log(`🔄 Processing job ${job.id} (${job.trackIds.length} tracks)`);
      
      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 0,
        message: `Starting enrichment of ${job.trackIds.length} tracks...`,
      });

      await this.executeJob(job);
    } catch (error) {
      console.error("❌ Worker error:", error);
    }
  }

  private async executeJob(job: EnrichmentJob) {
    try {
      const tracks = await this.storage.getTracksByIds(job.trackIds);
      
      if (tracks.length === 0) {
        await this.jobQueue.completeJob(job.id, false, [
          `[${new Date().toISOString()}] No tracks found for job`,
        ]);
        this.broadcastProgress(job.id, {
          status: 'failed',
          progress: 0,
          message: 'No tracks found',
        });
        return;
      }

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 5,
        logs: [`[${new Date().toISOString()}] Retrieved ${tracks.length} tracks from database`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 5,
        message: `Retrieved ${tracks.length} tracks, starting enrichment...`,
      });

      const tracksForEnrichment = tracks.map((t: PlaylistSnapshot) => ({
        id: t.id,
        spotifyUrl: t.spotifyUrl,
        songwriter: t.songwriter,
        spotifyStreams: t.spotifyStreams,
      }));

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 10,
        logs: [`[${new Date().toISOString()}] Starting Phase 2 enrichment (Spotify credits scraping)...`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 10,
        message: 'Starting Puppeteer scraping...',
      });

      const result = await enrichTracksWithCredits(tracksForEnrichment);

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 80,
        enrichedTracks: result.tracksEnriched,
        errorCount: result.errors,
        logs: [
          `[${new Date().toISOString()}] Phase 2 complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched`,
        ],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 80,
        message: `Enriched ${result.tracksEnriched}/${result.tracksProcessed} tracks, saving to database...`,
      });

      for (const enrichedTrack of result.enrichedTracks) {
        await this.storage.updateTrackMetadata(enrichedTrack.trackId, {
          songwriter: enrichedTrack.songwriter || undefined,
          producer: enrichedTrack.producer || undefined,
          publisher: enrichedTrack.publisher || undefined,
          label: enrichedTrack.label || undefined,
          spotifyStreams: enrichedTrack.spotifyStreams || undefined,
          enrichedAt: new Date(),
        });

        await this.storage.logActivity({
          entityType: 'track',
          trackId: enrichedTrack.trackId,
          playlistId: null,
          eventType: 'enrichment_completed',
          eventDescription: 'Phase 2 enrichment completed via background job',
          metadata: JSON.stringify({
            songwriter: enrichedTrack.songwriter,
            producer: enrichedTrack.producer,
            publisher: enrichedTrack.publisher,
            spotifyStreams: enrichedTrack.spotifyStreams,
          }),
        });
      }

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 95,
        logs: [`[${new Date().toISOString()}] Saved ${result.enrichedTracks.length} enriched tracks to database`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 95,
        message: 'Finalizing job...',
      });

      const success = result.errors === 0;
      await this.jobQueue.completeJob(job.id, success, [
        `[${new Date().toISOString()}] Job completed: ${result.tracksEnriched} enriched, ${result.errors} errors`,
      ]);

      this.broadcastProgress(job.id, {
        status: success ? 'completed' : 'completed_with_errors',
        progress: 100,
        message: `Job complete: ${result.tracksEnriched} tracks enriched${result.errors > 0 ? `, ${result.errors} errors` : ''}`,
      });

      console.log(`✅ Job ${job.id} completed: ${result.tracksEnriched} enriched, ${result.errors} errors`);
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error);
      
      await this.jobQueue.completeJob(job.id, false, [
        `[${new Date().toISOString()}] Job failed: ${error instanceof Error ? error.message : String(error)}`,
      ]);

      this.broadcastProgress(job.id, {
        status: 'failed',
        progress: job.progress || 0,
        message: `Job failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private broadcastProgress(jobId: string, data: any) {
    if (this.wsBroadcast) {
      this.wsBroadcast('enrichment_progress', {
        jobId,
        ...data,
      });
    }
  }
}
