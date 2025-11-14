/**
 * Core playlist fetching logic extracted from routes.ts
 * This module contains the authoritative fetch flow for playlists
 */

import type { PlaylistFetchOptions } from "./playlistFetchService";
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

/**
 * Core fetch implementation that handles playlist data retrieval, track processing, and storage
 * Called by both HTTP endpoint and auto-trigger service
 */
export async function fetchPlaylistsCore(options: PlaylistFetchOptions): Promise<PlaylistFetchResult> {
  const { mode = 'all', playlistId } = options;
  const today = new Date().toISOString().split('T')[0];
  
  const allTrackedPlaylists = await storage.getTrackedPlaylists();
  
  if (allTrackedPlaylists.length === 0) {
    throw new Error("No playlists are being tracked. Please add playlists to track first.");
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
    throw new Error(`No playlists found for mode: ${mode}`);
  }
  
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
  
  const allTracks: InsertPlaylistSnapshot[] = [];
  const completenessResults: Array<{ name: string; fetchCount: number; totalTracks: number | null; isComplete: boolean; skipped: number }> = [];
  
  // Import Puppeteer functions for editorial playlists
  const { fetchEditorialTracksViaNetwork } = await import("../scrapers/spotifyEditorialNetwork");
  
  for (const playlist of trackedPlaylists) {
    try {
      console.log(`Fetching playlist: ${playlist.name} (isEditorial=${playlist.isEditorial}, method=${playlist.fetchMethod})`);
      
      let playlistTracks: any[] = [];
      let playlistTotalTracks = playlist.totalTracks;
      let skippedCount = 0;
      
      // fetchMethod will be set based on which tier actually succeeds
      let fetchMethod = null;
      let chartmetricSucceeded = false;
      let spotifyApiSucceeded = false;
      let puppeteerSucceeded = false;
      
      // PHASE 1: Try Chartmetric FIRST for ALL playlists (editorial AND non-editorial)
      try {
        console.log(`[Tracks] Starting fetch for ${playlist.name} (isEditorial=${playlist.isEditorial})`);
        console.log(`[Tracks] Trying Chartmetric track lookup for ${playlist.playlistId}...`);
        
        const cmTracks = await getPlaylistTracks(playlist.playlistId, 'spotify');
        
        if (cmTracks && cmTracks.length > 0) {
          console.log(`[Tracks] ✅ Chartmetric success: ${cmTracks.length} tracks`);
          
          // Set success flag immediately after capturing Chartmetric data
          chartmetricSucceeded = true;
          fetchMethod = 'chartmetric';
          
          // Convert Chartmetric tracks to our format
          for (const cmTrack of cmTracks) {
            const trackKey = `${playlist.playlistId}_https://open.spotify.com/track/${cmTrack.spotifyId}`;
            
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
              playlistId: playlist.playlistId,
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
            
            allTracks.push(newTrack);
            existingTrackKeys.add(trackKey);
          }
          
          fetchMethod = 'chartmetric';
          playlistTotalTracks = cmTracks.length;
          console.log(`[Tracks] Fetch Method = chartmetric (${cmTracks.length} tracks, ${skippedCount} skipped)`);
          
          // Successfully got tracks from Chartmetric - skip to next playlist
          completenessResults.push({
            name: playlist.name,
            fetchCount: cmTracks.length - skippedCount,
            totalTracks: playlistTotalTracks,
            isComplete: true,
            skipped: skippedCount,
          });
          
          await storage.updatePlaylistCompleteness(playlist.playlistId, cmTracks.length - skippedCount, playlistTotalTracks ?? 0, new Date());
          
          continue; // Move to next playlist
        } else {
          console.log(`[Tracks] Chartmetric returned no tracks`);
        }
      } catch (cmError: any) {
        console.log(`[Tracks] Chartmetric failed: ${cmError.message}`);
      }
      
      // PHASE 2: Try Spotify API (for NON-editorial playlists only)
      if (playlist.isEditorial !== 1 && spotify) {
        try {
          console.log(`[Tracks] Trying Spotify API for ${playlist.playlistId}...`);
          
          const playlistData = await spotify.playlists.getPlaylist(playlist.playlistId, "from_token" as any);
          playlistTotalTracks = playlistData.tracks?.total || 0;
          
          let offset = 0;
          const limit = 100;
          
          while (offset < (playlistTotalTracks ?? 0)) {
            const tracksPage = await spotify.playlists.getPlaylistItems(
              playlist.playlistId,
              undefined,
              `items(track(id,name,artists(name),album(name,images),external_urls))`,
              limit,
              offset,
              "from_token" as any
            );
            
            if (!tracksPage.items) break;
            
            for (const item of tracksPage.items) {
              if (!item.track?.id) continue;
              
              const trackKey = `${playlist.playlistId}_${item.track.external_urls?.spotify}`;
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
                playlistId: playlist.playlistId,
                trackName: item.track.name,
                artistName: item.track.artists?.map((a: any) => a.name).join(", ") || "Unknown",
                spotifyUrl: item.track.external_urls?.spotify || "",
                albumArt: item.track.album?.images?.[0]?.url || null,
                unsignedScore: score,
                addedAt: new Date(),
                dataSource: "spotify_api",
              };
              
              playlistTracks.push(newTrack);
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            offset += limit;
          }
          
          spotifyApiSucceeded = true;
          fetchMethod = 'spotify_api';
          console.log(`[Tracks] ✅ Spotify API success: ${playlistTracks.length} tracks`);
          
          completenessResults.push({
            name: playlist.name,
            fetchCount: playlistTracks.length,
            totalTracks: playlistTotalTracks ?? 0,
            isComplete: playlistTracks.length === (playlistTotalTracks ?? 0),
            skipped: skippedCount,
          });
          
          await storage.updatePlaylistCompleteness(playlist.playlistId, playlistTracks.length, playlistTotalTracks ?? 0, new Date());
          
          continue; // Move to next playlist
        } catch (spotifyError: any) {
          console.log(`[Tracks] Spotify API failed: ${spotifyError.message}`);
        }
      }
      
      // PHASE 3: Try Puppeteer (for editorial playlists OR as fallback)
      if (playlist.isEditorial === 1) {
        try {
          console.log(`[Tracks] Trying Puppeteer scraper for ${playlist.playlistId}...`);
          
          const playlistUrl = `https://open.spotify.com/playlist/${playlist.playlistId}`;
          const puppeteerResult = await fetchEditorialTracksViaNetwork(playlistUrl);
          const puppeteerTracks = puppeteerResult.success ? puppeteerResult.tracks : [];
          
          if (puppeteerTracks && puppeteerTracks.length > 0) {
            for (const track of puppeteerTracks) {
              const trackKey = `${playlist.playlistId}_${track.spotifyUrl}`;
              
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
                playlistId: playlist.playlistId,
                trackName: track.name,
                artistName: track.artists.join(", "),
                spotifyUrl: track.spotifyUrl,
                albumArt: track.albumArt,
                isrc: track.isrc,
                unsignedScore: score,
                addedAt: new Date(),
                dataSource: "puppeteer",
              };
              
              playlistTracks.push(newTrack);
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            puppeteerSucceeded = true;
            fetchMethod = 'puppeteer';
            playlistTotalTracks = puppeteerTracks.length;
            console.log(`[Tracks] ✅ Puppeteer success: ${puppeteerTracks.length} tracks`);
            
            completenessResults.push({
              name: playlist.name,
              fetchCount: puppeteerTracks.length - skippedCount,
              totalTracks: playlistTotalTracks,
              isComplete: true,
              skipped: skippedCount,
            });
            
            await storage.updatePlaylistCompleteness(playlist.playlistId, puppeteerTracks.length - skippedCount, playlistTotalTracks, new Date());
            
            continue; // Move to next playlist
          } else {
            console.log(`[Tracks] Puppeteer returned no tracks`);
          }
        } catch (puppeteerError: any) {
          console.log(`[Tracks] Puppeteer failed: ${puppeteerError.message}`);
        }
      }
      
      // If all methods failed
      console.warn(`⚠️ All fetch methods failed for ${playlist.name}`);
      completenessResults.push({
        name: playlist.name,
        fetchCount: 0,
        totalTracks: playlistTotalTracks,
        isComplete: false,
        skipped: skippedCount,
      });
      
    } catch (error: any) {
      console.error(`Error fetching playlist ${playlist.name}:`, error);
      completenessResults.push({
        name: playlist.name,
        fetchCount: 0,
        totalTracks: null,
        isComplete: false,
        skipped: 0,
      });
    }
  }
  
  // Insert all tracks
  if (allTracks.length > 0) {
    console.log(`Inserting ${allTracks.length} tracks into database...`);
    await storage.insertTracks(allTracks);
    
    // Schedule background enrichment
    console.log(`Scheduling background enrichment for ${allTracks.length} new tracks...`);
    scheduleMetricsUpdate({ source: "fetch_playlists" });
  }
  
  return {
    success: true,
    tracksInserted: allTracks.length,
    playlistsFetched: trackedPlaylists.length,
    completenessResults
  };
}
