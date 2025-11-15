import type { JobQueue } from "./jobQueue";
import type { IStorage } from "../storage";
import type { EnrichmentJob, PlaylistSnapshot } from "@shared/schema";
import { enrichTracksWithCredits } from "./spotifyCreditsScaper";
import { enrichTracksWithMLC } from "./mlcApi";
import { enrichTracksWithSpotifyAPI } from "./spotifyBatchEnrichment";
import { getUncachableSpotifyClient } from "../spotify";
import { searchArtistByName, getArtistExternalLinks } from "../musicbrainz";
import { enrichTrackWithChartmetric } from "../chartmetric";
import type { WebSocket } from "ws";

export interface WorkerOptions {
  jobQueue: JobQueue;
  storage: IStorage;
  wsBroadcast?: (event: string, data: any) => void;
}

type TrackMetadataUpdate = Partial<Omit<PlaylistSnapshot, 'id'>>;

class TrackStateContext {
  private tracks: Map<string, PlaylistSnapshot>;
  private updates: Map<string, TrackMetadataUpdate>;

  constructor(initialTracks: PlaylistSnapshot[]) {
    this.tracks = new Map(initialTracks.map(t => [t.id, { ...t }]));
    this.updates = new Map();
  }

  applyPatch(trackId: string, patch: TrackMetadataUpdate) {
    const existing = this.updates.get(trackId) || {};
    this.updates.set(trackId, { ...existing, ...patch });

    const track = this.tracks.get(trackId);
    if (track) {
      Object.assign(track, patch);
    }
  }

  getTrack(trackId: string): PlaylistSnapshot | undefined {
    return this.tracks.get(trackId);
  }

  getAllTracks(): PlaylistSnapshot[] {
    return Array.from(this.tracks.values());
  }

  getUpdates(): Array<[string, TrackMetadataUpdate]> {
    return Array.from(this.updates.entries());
  }

  clearUpdate(trackId: string) {
    this.updates.delete(trackId);
  }

  hasUpdates(): boolean {
    return this.updates.size > 0;
  }
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

  private async persistPhaseUpdates(
    ctx: TrackStateContext, 
    jobId: string, 
    phaseName: string
  ): Promise<{ persistedCount: number; failedTrackIds: string[] }> {
    const updates = ctx.getUpdates();
    let persistedCount = 0;
    const failedTrackIds: string[] = [];

    for (const [trackId, update] of updates) {
      try {
        await this.storage.updateTrackMetadata(trackId, update);
        ctx.clearUpdate(trackId);
        persistedCount++;
      } catch (error) {
        console.error(`[Worker] Failed to persist ${phaseName} update for track ${trackId}:`, error);
        failedTrackIds.push(trackId);
      }
    }

    if (failedTrackIds.length > 0) {
      await this.jobQueue.updateJobProgress(jobId, {
        logs: [
          `[${new Date().toISOString()}] ${phaseName}: ${failedTrackIds.length} tracks failed to persist (${failedTrackIds.join(', ')})`,
        ],
      });
    }

    return { persistedCount, failedTrackIds };
  }

  private async executeJob(job: EnrichmentJob) {
    try {
      // Broadcast job started
      if (this.wsBroadcast) {
        this.wsBroadcast('enrichment_job_started', {
          type: 'enrichment_job_started',
          jobId: job.id,
          trackCount: job.trackIds.length,
          playlistId: job.playlistId,
        });
      }

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
        
        // Broadcast job failed
        if (this.wsBroadcast) {
          this.wsBroadcast('enrichment_job_failed', {
            type: 'enrichment_job_failed',
            jobId: job.id,
            error: 'No tracks found',
          });
        }
        return;
      }

      const ctx = new TrackStateContext(tracks);

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 5,
        logs: [`[${new Date().toISOString()}] Retrieved ${tracks.length} tracks from database`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 5,
        message: `Retrieved ${tracks.length} tracks, starting enrichment...`,
      });

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 10,
        logs: [`[${new Date().toISOString()}] Starting Phase 1 enrichment (Spotify API batch enrichment)...`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 10,
        message: 'Phase 1: Fetching metadata from Spotify API...',
      });

      try {
        const spotify = await getUncachableSpotifyClient();

        const updateTrackInContext = async (trackId: string, metadata: any) => {
          ctx.applyPatch(trackId, metadata);
        };

        const phase1Result = await enrichTracksWithSpotifyAPI(
          spotify,
          ctx.getAllTracks(),
          updateTrackInContext
        );

        const { persistedCount, failedTrackIds } = await this.persistPhaseUpdates(ctx, job.id, 'Phase 1');

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 35,
          logs: [
            `[${new Date().toISOString()}] Phase 1 complete: ${phase1Result.tracksEnriched}/${phase1Result.tracksProcessed} tracks enriched, ${persistedCount} persisted`,
            `[${new Date().toISOString()}] Phase 1 stats: ISRC recovered=${phase1Result.isrcRecovered}, API calls=${phase1Result.apiCalls}`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 35,
          message: `Phase 1 complete: ${persistedCount} tracks persisted, ${phase1Result.isrcRecovered} ISRCs recovered`,
        });

        for (const trackId of job.trackIds) {
          if (!failedTrackIds.includes(trackId) && this.wsBroadcast) {
            this.wsBroadcast('track_enriched', {
              type: 'track_enriched',
              trackId,
              phase: 1,
            });
          }
        }

        // Broadcast quality metric update for UI refresh
        if (this.wsBroadcast && job.playlistId) {
          this.wsBroadcast('playlist_quality_updated', {
            type: 'playlist_quality_updated',
            playlistId: job.playlistId,
            phase: 1,
            isrcRecovered: phase1Result.isrcRecovered,
            tracksEnriched: phase1Result.tracksEnriched,
          });
        }

        console.log(`[Phase 1: Spotify API] ✅ Complete: ${phase1Result.tracksEnriched}/${phase1Result.tracksProcessed} tracks enriched, ${persistedCount} persisted`);
        console.log(`[Phase 1: Spotify API] ISRC Recovery: ${phase1Result.isrcRecovered} tracks`);
        console.log(`[Phase 1: Spotify API] Field Stats:`, phase1Result.fieldStats);
      } catch (phase1Error) {
        console.error("[Worker] Phase 1 (Spotify API) failed, continuing to Phase 2:", phase1Error);

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 35,
          logs: [
            `[${new Date().toISOString()}] Phase 1 failed: ${phase1Error instanceof Error ? phase1Error.message : String(phase1Error)}. Continuing to Phase 2.`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 35,
          message: 'Phase 1 failed, continuing to Phase 2...',
        });
      }

      const tracksForEnrichment = ctx.getAllTracks().map((t: PlaylistSnapshot) => ({
        id: t.id,
        spotifyUrl: t.spotifyUrl,
        songwriter: t.songwriter,
        spotifyStreams: t.spotifyStreams,
      }));

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 35,
        logs: [`[${new Date().toISOString()}] Starting Phase 2 enrichment (Spotify credits scraping)...`],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 35,
        message: 'Starting Phase 2: Puppeteer scraping...',
      });

      const result = await enrichTracksWithCredits(tracksForEnrichment);

      // Create sets to track enrichment outcomes
      const enrichedTrackIds = new Set(result.enrichedTracks.map(t => t.trackId));
      const failedTrackIds = new Set(result.errorDetails.map(e => e.trackId));

      // Update tracks with credits data AND set creditsStatus
      for (const enrichedTrack of result.enrichedTracks) {
        ctx.applyPatch(enrichedTrack.trackId, {
          songwriter: enrichedTrack.songwriter || undefined,
          producer: enrichedTrack.producer || undefined,
          publisher: enrichedTrack.publisher || undefined,
          label: enrichedTrack.label || undefined,
          spotifyStreams: enrichedTrack.spotifyStreams || undefined,
          enrichedAt: new Date(),
          enrichmentStatus: 'enriched',
          creditsStatus: 'success',
          lastEnrichmentAttempt: new Date(),
        });
      }

      // Mark tracks that were processed but found no data
      for (const track of tracksForEnrichment) {
        if (!enrichedTrackIds.has(track.id) && !failedTrackIds.has(track.id)) {
          ctx.applyPatch(track.id, {
            enrichmentStatus: 'partial',
            creditsStatus: 'no_data',
            lastEnrichmentAttempt: new Date(),
          });
        }
      }

      // Mark tracks that failed
      for (const errorDetail of result.errorDetails) {
        ctx.applyPatch(errorDetail.trackId, {
          enrichmentStatus: 'partial',
          creditsStatus: 'failed',
          lastEnrichmentAttempt: new Date(),
        });
      }

      const { persistedCount: phase2Persisted, failedTrackIds: phase2Failed } = await this.persistPhaseUpdates(ctx, job.id, 'Phase 2');

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 70,
        enrichedTracks: result.tracksEnriched,
        errorCount: result.errors,
        logs: [
          `[${new Date().toISOString()}] Phase 2 complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched, ${phase2Persisted} persisted`,
        ],
      });

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 70,
        message: `Phase 2 complete: ${phase2Persisted} tracks persisted, starting MLC lookup...`,
      });

      for (const enrichedTrack of result.enrichedTracks) {
        if (!phase2Failed.includes(enrichedTrack.trackId)) {
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

          if (this.wsBroadcast) {
            this.wsBroadcast('track_enriched', {
              type: 'track_enriched',
              trackId: enrichedTrack.trackId,
              phase: 2,
              tracksEnriched: result.tracksEnriched,
              totalTracks: result.tracksProcessed,
            });
          }
        }
      }

      // Broadcast quality metric update after Phase 2
      if (this.wsBroadcast && job.playlistId) {
        this.wsBroadcast('playlist_quality_updated', {
          type: 'playlist_quality_updated',
          playlistId: job.playlistId,
          phase: 2,
          tracksEnriched: phase2Persisted,
        });
      }

      console.log(`[Phase 2: Credits Scraping] ✅ Complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched, ${phase2Persisted} persisted`);

      // Phase 3: MusicBrainz (artist social links)
      await this.jobQueue.updateJobProgress(job.id, {
        progress: 72,
        logs: [`[${new Date().toISOString()}] Starting Phase 3 enrichment (MusicBrainz artist social links)...`],
      });

      // Broadcast Phase 3 start
      if (this.wsBroadcast) {
        this.wsBroadcast('enrichment_phase_started', {
          type: 'enrichment_phase_started',
          jobId: job.id,
          phase: 3,
          phaseName: 'MusicBrainz Artist Links',
        });
      }

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 72,
        message: 'Phase 3: Fetching artist social links from MusicBrainz...',
      });

      let phase3ArtistsCreated = 0;
      let phase3LinksFound = 0;

      try {
        for (const track of ctx.getAllTracks()) {
          if (!track.songwriter) continue;

          const songwriterNames = track.songwriter
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

          for (const songwriterName of songwriterNames) {
            try {
              // Search for artist by name
              const artistResult = await searchArtistByName(songwriterName);
              
              if (artistResult && artistResult.score >= 90) {
                // Get external links
                const links = await getArtistExternalLinks(artistResult.id);

                // Create or update artist
                const artist = await this.storage.createOrUpdateArtist({
                  name: songwriterName,
                  musicbrainzId: artistResult.id,
                  ...links,
                });

                // Link artist to track
                await this.storage.linkArtistToTrack(artist.id, track.id);
                phase3ArtistsCreated++;

                if (Object.keys(links).length > 0) {
                  phase3LinksFound++;
                  console.log(`[Phase 3] ✅ Found ${Object.keys(links).length} social links for ${songwriterName}`);
                }
              }
            } catch (error) {
              console.error(`[Phase 3] Error enriching artist ${songwriterName}:`, error);
            }
          }
        }

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 75,
          logs: [
            `[${new Date().toISOString()}] Phase 3 (MusicBrainz) complete: ${phase3ArtistsCreated} artists created, ${phase3LinksFound} with social links`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 75,
          message: `Phase 3 complete: ${phase3LinksFound} artists with social links found`,
        });

        console.log(`[Phase 3: MusicBrainz] ✅ Complete: ${phase3ArtistsCreated} artists, ${phase3LinksFound} with links`);

        // Broadcast quality metric update
        if (this.wsBroadcast && job.playlistId) {
          this.wsBroadcast('playlist_quality_updated', {
            type: 'playlist_quality_updated',
            playlistId: job.playlistId,
            phase: 3,
            artistsWithLinks: phase3LinksFound,
          });
        }
      } catch (phase3Error) {
        console.error("[Worker] Phase 3 (MusicBrainz) failed, continuing to Phase 4:", phase3Error);

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 75,
          logs: [
            `[${new Date().toISOString()}] Phase 3 failed: ${phase3Error instanceof Error ? phase3Error.message : String(phase3Error)}. Continuing to Phase 4.`,
          ],
        });
      }

      // Phase 4: Chartmetric (streaming analytics, moods, activities)
      await this.jobQueue.updateJobProgress(job.id, {
        progress: 75,
        logs: [`[${new Date().toISOString()}] Starting Phase 4 enrichment (Chartmetric analytics)...`],
      });

      // Broadcast Phase 4 start
      if (this.wsBroadcast) {
        this.wsBroadcast('enrichment_phase_started', {
          type: 'enrichment_phase_started',
          jobId: job.id,
          phase: 4,
          phaseName: 'Chartmetric Analytics',
        });
      }

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 75,
        message: 'Phase 4: Fetching Chartmetric analytics...',
      });

      let phase4EnrichedCount = 0;
      let phase4NotFoundCount = 0;
      let phase4FailedCount = 0;

      try {
        for (const track of ctx.getAllTracks()) {
          // Skip if already enriched
          if (track.chartmetricStatus === 'success' || track.chartmetricStatus === 'not_found') {
            continue;
          }

          if (!track.isrc) {
            ctx.applyPatch(track.id, {
              chartmetricStatus: 'failed_missing_isrc',
              chartmetricEnrichedAt: new Date(),
            });
            phase4FailedCount++;
            continue;
          }

          try {
            const chartmetricData = await enrichTrackWithChartmetric(track);

            if (chartmetricData && chartmetricData.chartmetricId) {
              ctx.applyPatch(track.id, {
                chartmetricId: chartmetricData.chartmetricId,
                spotifyStreams: chartmetricData.spotifyStreams,
                streamingVelocity: chartmetricData.streamingVelocity?.toString(),
                youtubeViews: chartmetricData.youtubeViews,
                trackStage: chartmetricData.trackStage,
                moods: chartmetricData.moods,
                activities: chartmetricData.activities,
                chartmetricStatus: 'success',
                chartmetricEnrichedAt: new Date(),
              });
              phase4EnrichedCount++;
              console.log(`[Phase 4] ✅ Enriched ${track.trackName}: ${chartmetricData.spotifyStreams?.toLocaleString()} streams`);
            } else {
              ctx.applyPatch(track.id, {
                chartmetricStatus: 'not_found',
                chartmetricEnrichedAt: new Date(),
              });
              phase4NotFoundCount++;
            }
          } catch (error) {
            console.error(`[Phase 4] Error enriching track ${track.id}:`, error);
            ctx.applyPatch(track.id, {
              chartmetricStatus: 'failed_api',
              chartmetricEnrichedAt: new Date(),
            });
            phase4FailedCount++;
          }
        }

        const { persistedCount: phase4Persisted } = await this.persistPhaseUpdates(ctx, job.id, 'Phase 4');

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 82,
          logs: [
            `[${new Date().toISOString()}] Phase 4 (Chartmetric) complete: ${phase4EnrichedCount} enriched, ${phase4NotFoundCount} not found, ${phase4FailedCount} failed, ${phase4Persisted} persisted`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 82,
          message: `Phase 4 complete: ${phase4EnrichedCount} tracks enriched with analytics`,
        });

        console.log(`[Phase 4: Chartmetric] ✅ Complete: ${phase4EnrichedCount} enriched, ${phase4NotFoundCount} not found, ${phase4FailedCount} failed`);

        // Broadcast quality metric update
        if (this.wsBroadcast && job.playlistId) {
          this.wsBroadcast('playlist_quality_updated', {
            type: 'playlist_quality_updated',
            playlistId: job.playlistId,
            phase: 4,
            tracksEnriched: phase4EnrichedCount,
          });
        }
      } catch (phase4Error) {
        console.error("[Worker] Phase 4 (Chartmetric) failed, continuing to Phase 5:", phase4Error);

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 82,
          logs: [
            `[${new Date().toISOString()}] Phase 4 failed: ${phase4Error instanceof Error ? phase4Error.message : String(phase4Error)}. Continuing to Phase 5.`,
          ],
        });
      }

      await this.jobQueue.updateJobProgress(job.id, {
        progress: 82,
        logs: [`[${new Date().toISOString()}] Starting Phase 5 enrichment (MLC publisher status)...`],
      });

      // Broadcast Phase 5 start
      if (this.wsBroadcast) {
        this.wsBroadcast('enrichment_phase_started', {
          type: 'enrichment_phase_started',
          jobId: job.id,
          phase: 5,
          phaseName: 'MLC Publisher Lookup',
        });
      }

      this.broadcastProgress(job.id, {
        status: 'running',
        progress: 82,
        message: 'Phase 5: Checking publisher status with MLC API...',
      });

      let mlcResults: Array<{
        trackId: string;
        hasPublisher: boolean;
        publisherNames: string[];
        mlcSongCode?: string;
        error?: string;
      }> = [];

      try {
        const tracksForMLC = ctx.getAllTracks().map((t: PlaylistSnapshot) => ({
          id: t.id,
          isrc: t.isrc,
          trackName: t.trackName,
          artistName: t.artistName,
          songwriter: t.songwriter,
        }));

        mlcResults = await enrichTracksWithMLC(tracksForMLC);

        for (const mlcResult of mlcResults) {
          const publisherName = mlcResult.publisherNames.join(', ') || undefined;
          const publisherStatus = mlcResult.error 
            ? undefined 
            : (mlcResult.hasPublisher ? 'published' : 'unknown');

          ctx.applyPatch(mlcResult.trackId, {
            publisher: publisherName,
            publisherStatus,
            mlcSongCode: mlcResult.mlcSongCode || undefined,
            enrichmentStatus: 'enriched',
          });
        }

        const { persistedCount: mlcPersisted, failedTrackIds: mlcFailed } = await this.persistPhaseUpdates(ctx, job.id, 'MLC');

        console.log(`[Phase 5: MLC] ✅ Complete: ${mlcResults.filter(r => r.hasPublisher).length}/${mlcResults.length} tracks have publishers, ${mlcPersisted} persisted`);

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 92,
          logs: [
            `[${new Date().toISOString()}] Phase 5 (MLC) enrichment complete: ${mlcResults.filter(r => r.hasPublisher).length}/${mlcResults.length} tracks have publishers, ${mlcPersisted} persisted`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 92,
          message: `Phase 5 complete: ${mlcPersisted} tracks persisted`,
        });

        for (const mlcResult of mlcResults) {
          if (!mlcFailed.includes(mlcResult.trackId)) {
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
                publisherStatus: mlcResult.error 
                  ? undefined 
                  : (mlcResult.hasPublisher ? 'published' : 'unknown'),
                error: mlcResult.error,
              }),
            });

            if (this.wsBroadcast) {
              this.wsBroadcast('track_enriched', {
                type: 'track_enriched',
                trackId: mlcResult.trackId,
                phase: 'mlc',
              });
            }
          }
        }

        // Broadcast final quality metric update after MLC
        if (this.wsBroadcast && job.playlistId) {
          this.wsBroadcast('playlist_quality_updated', {
            type: 'playlist_quality_updated',
            playlistId: job.playlistId,
            phase: 'mlc',
            tracksWithPublisher: mlcResults.filter(r => r.hasPublisher).length,
            totalTracks: mlcResults.length,
          });
        }
      } catch (mlcError) {
        console.error("[Worker] MLC enrichment failed, continuing job:", mlcError);

        await this.jobQueue.updateJobProgress(job.id, {
          progress: 92,
          logs: [
            `[${new Date().toISOString()}] Phase 5 (MLC) failed: ${mlcError instanceof Error ? mlcError.message : String(mlcError)}. Job continuing.`,
          ],
        });

        this.broadcastProgress(job.id, {
          status: 'running',
          progress: 92,
          message: 'Phase 5 failed, finalizing job...',
        });

        for (const trackId of job.trackIds) {
          ctx.applyPatch(trackId, {
            enrichmentStatus: 'enriched',
            publisherStatus: 'unknown',
            enrichedAt: new Date(),
          });
        }

        await this.persistPhaseUpdates(ctx, job.id, 'MLC Fallback');

        for (const trackId of job.trackIds) {
          if (this.wsBroadcast) {
            this.wsBroadcast('track_enriched', {
              type: 'track_enriched',
              trackId,
              phase: 'mlc_fallback',
            });
          }
        }
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

      // Broadcast job completed
      if (this.wsBroadcast) {
        this.wsBroadcast('enrichment_job_completed', {
          type: 'enrichment_job_completed',
          jobId: job.id,
          tracksEnriched: result.tracksEnriched,
          errors: result.errors,
          success,
        });
      }

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

      // Broadcast job failed
      if (this.wsBroadcast) {
        this.wsBroadcast('enrichment_job_failed', {
          type: 'enrichment_job_failed',
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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