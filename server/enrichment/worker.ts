import type { JobQueue } from "./jobQueue";
import type { IStorage } from "../storage";
import type { EnrichmentJob, PlaylistSnapshot } from "@shared/schema";
import { enrichTracksWithCredits } from "./spotifyCreditsScaper";
import { enrichTracksWithMLC } from "./mlcApi";
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
  private cleanupInterval: NodeJS.Timeout | null = null;

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

    this.processingInterval = setInterval(() => {
      this.processNextJob().catch((error) => {
        console.error("❌ Fatal worker error:", error);
      });
    }, 2000);

    this.cleanupInterval = setInterval(() => {
      this.jobQueue.cleanupOldJobs(7).catch((error) => {
        console.error("❌ Error during job cleanup:", error);
      });
    }, 3600000);
  }

  stop() {
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log("🛑 Enrichment worker stopped");
  }

  private async processNextJob() {
    if (!this.isRunning) {
      return;
    }

    let jobId: string | null = null;

    try {
      const job = await this.jobQueue.getNextJob();
      
      if (!job) {
        return;
      }

      jobId = job.id;
      console.log(`🔄 Processing job ${job.id} (${job.trackIds.length} tracks)`);
      
      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 0,
        message: `Starting enrichment of ${job.trackIds.length} tracks...`,
      });

      await this.executeJob(job);
    } catch (error) {
      console.error("❌ Worker error:", error);
      
      if (jobId) {
        try {
          await this.jobQueue.completeJob(jobId, false, [
            `[${new Date().toISOString()}] Fatal worker error: ${error instanceof Error ? error.message : String(error)}`,
          ]);
          
          this.broadcastProgress(jobId, {
            status: 'failed',
            progress: 0,
            message: `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
          });
        } catch (cleanupError) {
          console.error("❌ Error during job cleanup:", cleanupError);
        }
      }
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
        progress: 60,
        enrichedTracks: result.tracksEnriched,
        errorCount: result.errors,
        logs: [
          `[${new Date().toISOString()}] Phase 2 complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched`,
        ],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 60,
        message: `Phase 2 complete, starting MLC publisher lookup...`,
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

        const creditsFound = [];
        if (enrichedTrack.songwriter) creditsFound.push('songwriter');
        if (enrichedTrack.producer) creditsFound.push('producer');
        if (enrichedTrack.label) creditsFound.push('label');
        
        const streamsText = enrichedTrack.spotifyStreams 
          ? `, ${enrichedTrack.spotifyStreams.toLocaleString()} streams` 
          : '';
        
        await this.storage.logActivity({
          entityType: 'track',
          trackId: enrichedTrack.trackId,
          playlistId: null,
          eventType: 'credits_enriched',
          eventDescription: `Phase 2: Scraped ${creditsFound.length > 0 ? creditsFound.join(', ') : 'no credits'}${streamsText}`,
          metadata: JSON.stringify({
            phase: 2,
            songwriter: enrichedTrack.songwriter,
            producer: enrichedTrack.producer,
            publisher: enrichedTrack.publisher,
            label: enrichedTrack.label,
            spotifyStreams: enrichedTrack.spotifyStreams,
          }),
        });
      }

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 70,
        logs: [`[${new Date().toISOString()}] Starting Tier 2 enrichment (MLC publisher status)...`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 70,
        message: 'Checking publisher status with MLC API...',
      });

      let mlcResults: Array<{
        trackId: string;
        hasPublisher: boolean;
        publisherNames: string[];
        mlcSongCode?: string;
        error?: string;
      }> = [];

      try {
        const updatedTracks = await this.storage.getTracksByIds(job.trackIds);
        const tracksForMLC = updatedTracks.map((t: PlaylistSnapshot) => ({
          id: t.id,
          isrc: t.isrc,
          trackName: t.trackName,
          artistName: t.artistName,
          songwriter: t.songwriter,
        }));

        mlcResults = await enrichTracksWithMLC(tracksForMLC);

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 85,
          logs: [
            `[${new Date().toISOString()}] MLC enrichment complete: ${mlcResults.filter(r => r.hasPublisher).length}/${mlcResults.length} tracks have publishers`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 85,
          message: `MLC enrichment complete, saving results...`,
        });

        for (const mlcResult of mlcResults) {
          const publisherName = mlcResult.publisherNames.join(', ') || undefined;
          const publisherStatus = mlcResult.error 
            ? undefined 
            : (mlcResult.hasPublisher ? 'published' : 'unknown');

          await this.storage.updateTrackMetadata(mlcResult.trackId, {
            publisher: publisherName,
            publisherStatus,
            mlcSongCode: mlcResult.mlcSongCode || undefined,
          });

          const mlcDescription = mlcResult.error
            ? `MLC: Error - ${mlcResult.error}`
            : mlcResult.hasPublisher
              ? `MLC: Publisher found - ${mlcResult.publisherNames.join(', ')}`
              : 'MLC: No publisher found (unsigned/unknown)';

          await this.storage.logActivity({
            entityType: 'track',
            trackId: mlcResult.trackId,
            playlistId: null,
            eventType: 'mlc_enrichment_completed',
            eventDescription: mlcDescription,
            metadata: JSON.stringify({
              hasPublisher: mlcResult.hasPublisher,
              publisherNames: mlcResult.publisherNames,
              mlcSongCode: mlcResult.mlcSongCode,
              publisherStatus,
              error: mlcResult.error,
            }),
          });
        }
      } catch (mlcError) {
        console.error("[Worker] MLC enrichment failed, continuing job:", mlcError);
        
        await this.jobQueue.updateJobProgress(job.id, {
          progress: 85,
          logs: [
            `[${new Date().toISOString()}] MLC enrichment failed: ${mlcError instanceof Error ? mlcError.message : String(mlcError)}. Continuing with Phase 2 results only.`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 85,
          message: 'MLC enrichment failed, continuing with Phase 2 results...',
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
