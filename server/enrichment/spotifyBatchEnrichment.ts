import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import type { PlaylistSnapshot } from "@shared/schema";

interface EnrichmentResult {
  success: boolean;
  tracksProcessed: number;
  tracksEnriched: number;
  isrcRecovered: number;
  apiCalls: number;
  errors: string[];
  fieldStats: {
    isrc: number;
    label: number;
    releaseDate: number;
    popularity: number;
    audioFeatures: number;
    artistGenres: number;
    artistFollowers: number;
  };
}

interface TrackUpdate {
  id: string;
  spotifyTrackId?: string;
  isrc?: string;
  label?: string;
  releaseDate?: string;
  popularity?: number;
  duration?: number;
  explicit?: number;
  albumImages?: string;
  audioFeatures?: string;
  artistGenres?: string[];
  artistFollowers?: number;
}

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  retryDelay: number = INITIAL_RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0) {
      throw error;
    }
    
    if (error.status === 429 || error.message?.includes('429')) {
      const backoffDelay = retryDelay * 2;
      console.log(`[SpotifyBatch] Rate limited, retrying in ${backoffDelay}ms... (${retries} retries left)`);
      await delay(backoffDelay);
      return retryWithBackoff(fn, retries - 1, backoffDelay);
    }
    
    throw error;
  }
}

export async function enrichTracksWithSpotifyAPI(
  spotify: SpotifyApi,
  tracks: PlaylistSnapshot[],
  updateTrackMetadata: (trackId: string, metadata: any) => Promise<void>
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    success: true,
    tracksProcessed: 0,
    tracksEnriched: 0,
    isrcRecovered: 0,
    apiCalls: 0,
    errors: [],
    fieldStats: {
      isrc: 0,
      label: 0,
      releaseDate: 0,
      popularity: 0,
      audioFeatures: 0,
      artistGenres: 0,
      artistFollowers: 0,
    },
  };

  console.log(`[Phase 1] Starting Spotify API batch enrichment for ${tracks.length} tracks`);

  const tracksNeedingEnrichment = tracks.filter(track => {
    const needsIsrc = !track.isrc;
    const needsLabel = !track.label;
    const needsReleaseDate = !track.releaseDate;
    const needsPopularity = track.popularity === null || track.popularity === undefined;
    const needsAudioFeatures = !track.audioFeatures;
    const needsArtistData = !track.artistGenres || !track.artistFollowers;
    
    return needsIsrc || needsLabel || needsReleaseDate || needsPopularity || needsAudioFeatures || needsArtistData;
  });

  if (tracksNeedingEnrichment.length === 0) {
    console.log(`[Phase 1] All tracks already have complete metadata, skipping enrichment`);
    return result;
  }

  console.log(`[Phase 1] ${tracksNeedingEnrichment.length}/${tracks.length} tracks need enrichment`);

  for (let i = 0; i < tracksNeedingEnrichment.length; i += BATCH_SIZE) {
    const batch = tracksNeedingEnrichment.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tracksNeedingEnrichment.length / BATCH_SIZE);
    
    console.log(`[Phase 1] Processing batch ${batchNum}/${totalBatches} (${batch.length} tracks)`);

    const trackIds: string[] = [];
    const trackIdMap = new Map<string, PlaylistSnapshot>();

    for (const track of batch) {
      const trackId = extractSpotifyTrackId(track.spotifyUrl);
      if (trackId) {
        trackIds.push(trackId);
        trackIdMap.set(trackId, track);
      } else {
        console.warn(`[Phase 1] Could not extract Spotify track ID from: ${track.spotifyUrl}`);
      }
    }

    if (trackIds.length === 0) {
      console.warn(`[Phase 1] No valid track IDs in batch ${batchNum}, skipping`);
      continue;
    }

    try {
      const [tracksData, audioFeaturesData] = await Promise.all([
        retryWithBackoff(() => spotify.tracks.get(trackIds)),
        retryWithBackoff(() => spotify.tracks.audioFeatures(trackIds).catch(() => null)),
      ]);

      result.apiCalls += 2;

      const audioFeaturesMap = new Map<string, any>();
      if (audioFeaturesData) {
        for (const features of audioFeaturesData) {
          if (features && features.id) {
            audioFeaturesMap.set(features.id, features);
          }
        }
      }

      const artistDataMap = new Map<string, any>();
      const artistIdsToFetch = new Set<string>();
      for (const trackData of tracksData) {
        if (trackData.artists && trackData.artists.length > 0) {
          const primaryArtistId = trackData.artists[0].id;
          const dbTrack = trackIdMap.get(trackData.id);
          if (dbTrack && (!dbTrack.artistGenres || !dbTrack.artistFollowers)) {
            artistIdsToFetch.add(primaryArtistId);
          }
        }
      }

      if (artistIdsToFetch.size > 0) {
        try {
          const artistIds = Array.from(artistIdsToFetch);
          const artistsData = await retryWithBackoff(() => 
            spotify.artists.get(artistIds)
          );
          result.apiCalls++;

          for (const artistData of artistsData) {
            if (artistData && artistData.id) {
              artistDataMap.set(artistData.id, artistData);
            }
          }
        } catch (artistBatchError: any) {
          console.warn(`[Phase 1] Batch artist fetch failed, falling back to individual requests: ${artistBatchError.message}`);
        }
      }

      for (const trackData of tracksData) {
        if (!trackData || !trackData.id) continue;

        const dbTrack = trackIdMap.get(trackData.id);
        if (!dbTrack) continue;

        const update: TrackUpdate = { id: dbTrack.id };
        let hasUpdates = false;

        if (!dbTrack.spotifyTrackId) {
          update.spotifyTrackId = trackData.id;
          hasUpdates = true;
        }

        if (!dbTrack.isrc && trackData.external_ids?.isrc) {
          update.isrc = trackData.external_ids.isrc;
          result.isrcRecovered++;
          result.fieldStats.isrc++;
          hasUpdates = true;
        }

        if (!dbTrack.label && trackData.album?.label) {
          update.label = trackData.album.label;
          result.fieldStats.label++;
          hasUpdates = true;
        }

        if (!dbTrack.releaseDate && trackData.album?.release_date) {
          update.releaseDate = trackData.album.release_date;
          result.fieldStats.releaseDate++;
          hasUpdates = true;
        }

        if ((dbTrack.popularity === null || dbTrack.popularity === undefined) && trackData.popularity !== undefined) {
          update.popularity = trackData.popularity;
          result.fieldStats.popularity++;
          hasUpdates = true;
        }

        if (!dbTrack.duration && trackData.duration_ms) {
          update.duration = trackData.duration_ms;
          hasUpdates = true;
        }

        if (dbTrack.explicit === null || dbTrack.explicit === undefined) {
          update.explicit = trackData.explicit ? 1 : 0;
          hasUpdates = true;
        }

        if (!dbTrack.albumImages && trackData.album?.images?.length) {
          update.albumImages = JSON.stringify(trackData.album.images);
          hasUpdates = true;
        }

        if (!dbTrack.audioFeatures) {
          const features = audioFeaturesMap.get(trackData.id);
          if (features) {
            update.audioFeatures = JSON.stringify({
              energy: features.energy,
              valence: features.valence,
              danceability: features.danceability,
              tempo: features.tempo,
              acousticness: features.acousticness,
              instrumentalness: features.instrumentalness,
              liveness: features.liveness,
              speechiness: features.speechiness,
              key: features.key,
              mode: features.mode,
              loudness: features.loudness,
              time_signature: features.time_signature,
            });
            result.fieldStats.audioFeatures++;
            hasUpdates = true;
          }
        }

        if (trackData.artists && trackData.artists.length > 0) {
          const primaryArtist = trackData.artists[0];
          let artistData = artistDataMap.get(primaryArtist.id);

          if (!artistData && (!dbTrack.artistGenres || !dbTrack.artistFollowers)) {
            try {
              artistData = await retryWithBackoff(() => 
                spotify.artists.get(primaryArtist.id)
              );
              result.apiCalls++;
              artistDataMap.set(primaryArtist.id, artistData);
            } catch (artistError: any) {
              console.warn(`[Phase 1] Failed to fetch artist data for ${primaryArtist.name}: ${artistError.message}`);
            }
          }

          if (artistData) {
            if (!dbTrack.artistGenres && artistData.genres?.length) {
              update.artistGenres = artistData.genres;
              result.fieldStats.artistGenres++;
              hasUpdates = true;
            }

            if (!dbTrack.artistFollowers && artistData.followers?.total !== undefined) {
              update.artistFollowers = artistData.followers.total;
              result.fieldStats.artistFollowers++;
              hasUpdates = true;
            }
          }
        }

        if (hasUpdates) {
          try {
            await updateTrackMetadata(dbTrack.id, update);
            result.tracksEnriched++;
          } catch (updateError: any) {
            console.error(`[Phase 1] Failed to update track ${dbTrack.id}:`, updateError.message);
            result.errors.push(`Update failed for track ${dbTrack.trackName}: ${updateError.message}`);
          }
        }

        result.tracksProcessed++;
      }

      await delay(100);
    } catch (error: any) {
      console.error(`[Phase 1] Batch ${batchNum} failed:`, error.message);
      result.errors.push(`Batch ${batchNum} failed: ${error.message}`);
      result.success = false;
    }
  }

  console.log(`[Phase 1] ✅ Complete: ${result.tracksEnriched}/${result.tracksProcessed} tracks enriched`);
  console.log(`[Phase 1] ISRC Recovery: ${result.isrcRecovered} tracks`);
  console.log(`[Phase 1] Field Stats:`, result.fieldStats);
  console.log(`[Phase 1] API Calls: ${result.apiCalls}`);

  if (result.errors.length > 0) {
    console.warn(`[Phase 1] Errors encountered: ${result.errors.length}`);
  }

  return result;
}

function extractSpotifyTrackId(spotifyUrl: string): string | null {
  const match = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
