/**
 * Core playlist fetching logic with parallel processing
 * Phase 4: Playlist-Level Parallelism with Rate Limiting
 */

import type { PlaylistFetchOptions } from "./playlistFetchService";
import { PlaylistValidationError, PlaylistFetchError } from "./playlistFetchErrors";
import { playlistLimiter, chartmetricLimiter, spotifyLimiter, puppeteerLimiter, delay, CHARTMETRIC_DELAY_MS } from "./rateLimiters";
import { storage } from "../storage";
import { getUncachableSpotifyClient } from "../spotify";
import { getPlaylistTracks } from "../chartmetric";
import { calculateUnsignedScore } from "../scoring";
import type { InsertPlaylistSnapshot } from "../../shared/schema";
import { scheduleMetricsUpdate } from "../metricsUpdateManager";

export interface PlaylistFetchResult {
  success: boolean;
  tracksInserted: number;
  playlistsFetched: number;
  completenessResults: Array<{
    name: string;
    fetchCount: number;
    totalTracks: number | null;
    isComplete: boolean;
    skipped: number;
  }>;
}

interface SinglePlaylistResult {
  playlistName: string;
  playlistId: string;
  newTracks: InsertPlaylistSnapshot[];
  completeness: {
    name: string;
    fetchCount: number;
    totalTracks: number | null;
    isComplete: boolean;
    skipped: number;
  };
  error?: Error;
}

/**
 * Fetch a single playlist with rate-limited external calls
 * Returns structured result for aggregation
 */
async function fetchSinglePlaylist(
  playlist: any,
  spotify: any | null,
  today: string,
  existingTrackKeys: Set<string>,
  fetchEditorialTracksViaNetwork: any
): Promise<SinglePlaylistResult> {
  console.log(`[Playlist ${playlist.playlistId}] Starting fetch for ${playlist.name} (isEditorial=${playlist.isEditorial})`);
  
  const newTracks: InsertPlaylistSnapshot[] = [];
  let playlistTotalTracks = playlist.totalTracks;
  let skippedCount = 0;
  let fetchMethod: string | null = null;
  
  try {
    // PHASE 1: Try Chartmetric FIRST (with rate limiting)
    try {
      console.log(`[Playlist ${playlist.playlistId}] Trying Chartmetric...`);
      
      const cmTracks = await chartmetricLimiter(async () => {
        try {
          return await getPlaylistTracks(playlist.playlistId, 'spotify');
        } finally {
          // ALWAYS enforce 2-second delay (even on error) to prevent rate limit violations
          await delay(CHARTMETRIC_DELAY_MS);
        }
      });
      
      if (cmTracks && cmTracks.length > 0) {
        console.log(`[Playlist ${playlist.playlistId}] ✅ Chartmetric: ${cmTracks.length} tracks`);
        
        for (const cmTrack of cmTracks) {
          const trackKey = `${playlist.id}_https://open.spotify.com/track/${cmTrack.spotifyId}`;
          
          // Synchronous check before any await to prevent race conditions
          if (existingTrackKeys.has(trackKey)) {
            skippedCount++;
            continue;
          }
          
          const score = calculateUnsignedScore({
            playlistName: playlist.name,
            label: null,
            publisher: null,
            writer: null,
          });
          
          const newTrack: InsertPlaylistSnapshot = {
            week: today,
            playlistName: playlist.name,
            playlistId: playlist.id,
            trackName: cmTrack.name,
            artistName: cmTrack.artists.map(a => a.name).join(", "),
            spotifyUrl: `https://open.spotify.com/track/${cmTrack.spotifyId}`,
            albumArt: cmTrack.album?.image_url || null,
            isrc: cmTrack.isrc || null,
            label: null,
            unsignedScore: score,
            addedAt: new Date(),
            dataSource: "chartmetric",
            chartmetricId: cmTrack.chartmetricId ? String(cmTrack.chartmetricId) : null,
            chartmetricStatus: "completed",
          };
          
          newTracks.push(newTrack);
          existingTrackKeys.add(trackKey);
        }
        
        fetchMethod = 'chartmetric';
        playlistTotalTracks = cmTracks.length;
        
        await storage.updatePlaylistCompleteness(playlist.id, cmTracks.length - skippedCount, playlistTotalTracks, new Date());
        
        return {
          playlistName: playlist.name,
          playlistId: playlist.id,
          newTracks,
          completeness: {
            name: playlist.name,
            fetchCount: cmTracks.length - skippedCount,
            totalTracks: playlistTotalTracks,
            isComplete: true,
            skipped: skippedCount,
          },
        };
      } else {
        console.log(`[Playlist ${playlist.playlistId}] Chartmetric returned no tracks`);
      }
    } catch (cmError: any) {
      console.log(`[Playlist ${playlist.playlistId}] Chartmetric failed: ${cmError.message}`);
    }
    
    // PHASE 2: Try Spotify API (for NON-editorial playlists, with rate limiting)
    if (playlist.isEditorial !== 1 && spotify) {
      try {
        console.log(`[Playlist ${playlist.playlistId}] Trying Spotify API...`);
        
        const playlistData = await spotifyLimiter(() => 
          spotify.playlists.getPlaylist(playlist.playlistId, "from_token" as any)
        );
        playlistTotalTracks = playlistData.tracks?.total || 0;
        
        let offset = 0;
        const limit = 100;
        
        while (offset < (playlistTotalTracks ?? 0)) {
          const tracksPage = await spotifyLimiter(() =>
            spotify.playlists.getPlaylistItems(
              playlist.playlistId,
              undefined,
              `items(track(id,name,artists(name),album(name,images),external_urls,external_ids,duration_ms,explicit,popularity))`,
              limit,
              offset,
              "from_token" as any
            )
          );
          
          if (!tracksPage.items) break;
          
          for (const item of tracksPage.items) {
            if (!item.track?.id) continue;
            
            const trackKey = `${playlist.id}_${item.track.external_urls?.spotify}`;
            
            // Synchronous check before any await
            if (existingTrackKeys.has(trackKey)) {
              skippedCount++;
              continue;
            }
            
            const score = calculateUnsignedScore({
              playlistName: playlist.name,
              label: null,
              publisher: null,
              writer: null,
            });
            
            const newTrack: InsertPlaylistSnapshot = {
              week: today,
              playlistName: playlist.name,
              playlistId: playlist.id,
              trackName: item.track.name,
              artistName: item.track.artists?.map((a: any) => a.name).join(", ") || "Unknown",
              spotifyUrl: item.track.external_urls?.spotify || "",
              spotifyTrackId: item.track.id,
              albumArt: item.track.album?.images?.[0]?.url || null,
              isrc: (item.track as any).external_ids?.isrc || null,
              duration: (item.track as any).duration_ms || null,
              explicit: (item.track as any).explicit ? 1 : 0,
              popularity: (item.track as any).popularity || null,
              unsignedScore: score,
              addedAt: new Date(),
              dataSource: "spotify_api",
            };
            
            newTracks.push(newTrack);
            existingTrackKeys.add(trackKey);
          }
          
          offset += limit;
        }
        
        fetchMethod = 'spotify_api';
        console.log(`[Playlist ${playlist.playlistId}] ✅ Spotify API: ${newTracks.length} tracks`);
        
        await storage.updatePlaylistCompleteness(playlist.id, newTracks.length, playlistTotalTracks ?? 0, new Date());
        
        return {
          playlistName: playlist.name,
          playlistId: playlist.id,
          newTracks,
          completeness: {
            name: playlist.name,
            fetchCount: newTracks.length,
            totalTracks: playlistTotalTracks ?? 0,
            isComplete: newTracks.length === (playlistTotalTracks ?? 0),
            skipped: skippedCount,
          },
        };
      } catch (spotifyError: any) {
        console.log(`[Playlist ${playlist.playlistId}] Spotify API failed: ${spotifyError.message}`);
      }
    }
    
    // PHASE 3: Try Puppeteer (for editorial playlists, with rate limiting)
    if (playlist.isEditorial === 1) {
      try {
        console.log(`[Playlist ${playlist.playlistId}] Trying Puppeteer...`);
        
        const playlistUrl = `https://open.spotify.com/playlist/${playlist.playlistId}`;
        const puppeteerResult = await puppeteerLimiter(() => 
          fetchEditorialTracksViaNetwork(playlistUrl)
        );
        const puppeteerTracks = puppeteerResult.success ? puppeteerResult.tracks : [];
        
        if (puppeteerTracks && puppeteerTracks.length > 0) {
          for (const track of puppeteerTracks) {
            const trackKey = `${playlist.id}_${track.spotifyUrl}`;
            
            // Synchronous check before any await
            if (existingTrackKeys.has(trackKey)) {
              skippedCount++;
              continue;
            }
            
            const score = calculateUnsignedScore({
              playlistName: playlist.name,
              label: null,
              publisher: null,
              writer: null,
            });
            
            const newTrack: InsertPlaylistSnapshot = {
              week: today,
              playlistName: playlist.name,
              playlistId: playlist.id,
              trackName: track.name,
              artistName: track.artists.join(", "),
              spotifyUrl: track.spotifyUrl,
              albumArt: track.albumArt,
              isrc: track.isrc,
              unsignedScore: score,
              addedAt: new Date(),
              dataSource: "puppeteer",
            };
            
            newTracks.push(newTrack);
            existingTrackKeys.add(trackKey);
          }
          
          fetchMethod = 'puppeteer';
          playlistTotalTracks = puppeteerTracks.length;
          console.log(`[Playlist ${playlist.playlistId}] ✅ Puppeteer: ${puppeteerTracks.length} tracks`);
          
          // CRITICAL FIX: Batch enrich editorial tracks via Spotify API to recover ISRCs
          if (spotify && newTracks.length > 0) {
            console.log(`[Playlist ${playlist.playlistId}] 🔄 Batch enriching ${newTracks.length} editorial tracks via Spotify API...`);
            
            try {
              const { enrichTracksWithSpotifyAPI } = await import("../enrichment/spotifyBatchEnrichment");
              
              // Create temporary track objects for enrichment
              const tracksForEnrichment = newTracks.map(track => ({
                id: track.spotifyUrl, // Use URL as temporary ID
                spotifyUrl: track.spotifyUrl,
                trackName: track.trackName,
                artistName: track.artistName,
                isrc: track.isrc,
                label: track.label,
                releaseDate: track.releaseDate,
                popularity: track.popularity,
                duration: track.duration,
                explicit: track.explicit,
                albumImages: track.albumImages,
                audioFeatures: track.audioFeatures,
                artistGenres: track.artistGenres,
                artistFollowers: track.artistFollowers,
              }));
              
              // Update tracks in-place via callback
              const updateTrackMetadata = async (trackUrl: string, metadata: any) => {
                const track = newTracks.find(t => t.spotifyUrl === trackUrl);
                if (track) {
                  if (metadata.spotifyTrackId) track.spotifyTrackId = metadata.spotifyTrackId;
                  if (metadata.isrc) track.isrc = metadata.isrc;
                  if (metadata.label) track.label = metadata.label;
                  if (metadata.releaseDate) track.releaseDate = metadata.releaseDate;
                  if (metadata.popularity !== undefined) track.popularity = metadata.popularity;
                  if (metadata.duration) track.duration = metadata.duration;
                  if (metadata.explicit !== undefined) track.explicit = metadata.explicit;
                  if (metadata.albumImages) track.albumImages = metadata.albumImages;
                  if (metadata.audioFeatures) track.audioFeatures = metadata.audioFeatures;
                  if (metadata.artistGenres) track.artistGenres = metadata.artistGenres;
                  if (metadata.artistFollowers !== undefined) track.artistFollowers = metadata.artistFollowers;
                }
              };
              
              const enrichmentResult = await enrichTracksWithSpotifyAPI(
                spotify,
                tracksForEnrichment as any,
                updateTrackMetadata
              );
              
              console.log(`[Playlist ${playlist.playlistId}] ✅ Batch enrichment: ${enrichmentResult.isrcRecovered} ISRCs recovered, ${enrichmentResult.tracksEnriched} tracks enriched`);
            } catch (enrichError: any) {
              console.error(`[Playlist ${playlist.playlistId}] ⚠️ Batch enrichment failed:`, enrichError.message);
              // Continue even if enrichment fails - tracks are still valid
            }
          }
          
          await storage.updatePlaylistCompleteness(playlist.id, puppeteerTracks.length - skippedCount, playlistTotalTracks, new Date());
          
          return {
            playlistName: playlist.name,
            playlistId: playlist.id,
            newTracks,
            completeness: {
              name: playlist.name,
              fetchCount: puppeteerTracks.length - skippedCount,
              totalTracks: playlistTotalTracks,
              isComplete: true,
              skipped: skippedCount,
            },
          };
        } else {
          console.log(`[Playlist ${playlist.playlistId}] Puppeteer returned no tracks`);
        }
      } catch (puppeteerError: any) {
        console.log(`[Playlist ${playlist.playlistId}] Puppeteer failed: ${puppeteerError.message}`);
      }
    }
    
    // All methods failed
    console.warn(`[Playlist ${playlist.playlistId}] ⚠️ All fetch methods failed`);
    return {
      playlistName: playlist.name,
      playlistId: playlist.id,
      newTracks: [],
      completeness: {
        name: playlist.name,
        fetchCount: 0,
        totalTracks: playlistTotalTracks,
        isComplete: false,
        skipped: skippedCount,
      },
    };
    
  } catch (error: any) {
    console.error(`[Playlist ${playlist.playlistId}] Error:`, error);
    return {
      playlistName: playlist.name,
      playlistId: playlist.id,
      newTracks: [],
      completeness: {
        name: playlist.name,
        fetchCount: 0,
        totalTracks: null,
        isComplete: false,
        skipped: 0,
      },
      error,
    };
  }
}

/**
 * Core fetch implementation with parallel playlist processing
 * Called by both HTTP endpoint and auto-trigger service
 */
export async function fetchPlaylistsCore(options: PlaylistFetchOptions): Promise<PlaylistFetchResult> {
  const { mode = 'all', playlistId } = options;
  const today = new Date().toISOString().split('T')[0];
  
  const allTrackedPlaylists = await storage.getTrackedPlaylists();
  
  if (allTrackedPlaylists.length === 0) {
    throw new PlaylistValidationError("No playlists are being tracked. Please add playlists to track first.");
  }
  
  // Filter playlists based on mode
  let trackedPlaylists = allTrackedPlaylists;
  if (mode === 'editorial') {
    trackedPlaylists = allTrackedPlaylists.filter(p => p.isEditorial === 1);
  } else if (mode === 'non-editorial') {
    trackedPlaylists = allTrackedPlaylists.filter(p => p.isEditorial !== 1);
  } else if (mode === 'specific' && playlistId) {
    trackedPlaylists = allTrackedPlaylists.filter(p => p.playlistId === playlistId);
  }
  
  if (trackedPlaylists.length === 0) {
    throw new PlaylistValidationError(`No playlists found for mode: ${mode}`);
  }
  
  console.log(`\n🚀 Starting PARALLEL fetch for ${trackedPlaylists.length} playlists (concurrency: 3)`);
  
  // Only get Spotify client if we have non-editorial playlists to fetch
  const hasNonEditorialPlaylists = trackedPlaylists.some(p => p.isEditorial !== 1);
  let spotify: any = null;
  
  if (hasNonEditorialPlaylists) {
    try {
      spotify = await getUncachableSpotifyClient();
    } catch (authError) {
      console.warn('Failed to get Spotify client (not authenticated). Editorial playlists will use scraping.');
    }
  }
  
  // Get existing tracks for this week to avoid duplicates
  const existingTracks = await storage.getTracksByWeek(today);
  const existingTrackKeys = new Set(
    existingTracks.map(t => `${t.playlistId}_${t.spotifyUrl}`)
  );
  
  // Import Puppeteer functions
  const { fetchEditorialTracksViaNetwork } = await import("../scrapers/spotifyEditorialNetwork");
  
  // Process playlists in parallel using playlistLimiter (concurrency: 3)
  const playlistPromises = trackedPlaylists.map((playlist, index) =>
    playlistLimiter(async () => {
      console.log(`[Queue] Processing playlist ${index + 1}/${trackedPlaylists.length}: ${playlist.name}`);
      return fetchSinglePlaylist(playlist, spotify, today, existingTrackKeys, fetchEditorialTracksViaNetwork);
    })
  );
  
  // Wait for all playlists to complete (use allSettled to prevent one failure from stopping others)
  const results = await Promise.allSettled(playlistPromises);
  
  // Aggregate results
  const allTracks: InsertPlaylistSnapshot[] = [];
  const completenessResults: Array<{ name: string; fetchCount: number; totalTracks: number | null; isComplete: boolean; skipped: number }> = [];
  let successCount = 0;
  let failureCount = 0;
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const playlistResult = result.value;
      allTracks.push(...playlistResult.newTracks);
      completenessResults.push(playlistResult.completeness);
      
      if (playlistResult.error) {
        failureCount++;
        console.error(`❌ Playlist "${playlistResult.playlistName}" failed:`, playlistResult.error.message);
      } else {
        successCount++;
      }
    } else {
      failureCount++;
      console.error(`❌ Playlist fetch rejected:`, result.reason);
      completenessResults.push({
        name: 'Unknown',
        fetchCount: 0,
        totalTracks: null,
        isComplete: false,
        skipped: 0,
      });
    }
  }
  
  console.log(`\n✅ Parallel fetch complete: ${successCount} succeeded, ${failureCount} failed`);
  console.log(`📊 Total tracks collected: ${allTracks.length}`);
  
  // Insert all tracks
  if (allTracks.length > 0) {
    console.log(`Inserting ${allTracks.length} tracks into database...`);
    
    try {
      const trackIds = await storage.insertTracks(allTracks);
      
      // Auto-trigger enrichment for newly inserted tracks
      if (trackIds.length > 0) {
        console.log(`🎯 Auto-triggering enrichment for ${trackIds.length} new tracks...`);
        const { getJobQueue } = await import("../enrichment/jobQueueManager");
        const jobQueue = getJobQueue();
        
        if (jobQueue) {
          try {
            // Enqueue enrichment job for all newly inserted tracks
            await jobQueue.enqueue({
              type: 'enrich-tracks',
              trackIds,
            });
            console.log(`✅ Enrichment job queued for ${trackIds.length} tracks`);
          } catch (error: any) {
            console.error(`❌ Failed to enqueue enrichment job:`, error.message);
          }
        } else {
          console.warn(`⚠️  Job queue not initialized - enrichment will not run automatically`);
        }
      }
      
      // Schedule metrics update only on successful insertion
      console.log(`Scheduling background metrics update for ${trackIds.length} new tracks...`);
      scheduleMetricsUpdate({ source: "fetch_playlists" });
    } catch (error: any) {
      console.error(`❌ Failed to insert tracks:`, error.message);
      // Do not schedule enrichment or metrics updates on insertion failure
      throw error; // Re-throw to signal failure to caller
    }
  }
  
  return {
    success: true,
    tracksInserted: allTracks.length,
    playlistsFetched: trackedPlaylists.length,
    completenessResults
  };
}
