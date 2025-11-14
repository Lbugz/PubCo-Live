import type { DatabaseStorage } from "../storage";
import type { InsertPlaylistSnapshot } from "@shared/schema";

// Custom error class for playlist fetch failures
export class PlaylistFetchError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'PlaylistFetchError';
  }
}

// Options for executing playlist fetch
export interface PlaylistFetchOptions {
  mode?: 'all' | 'editorial' | 'non-editorial' | 'specific';
  playlistId?: string;
  trigger: 'http' | 'auto';
  requestId?: string;
  fireAndForget?: boolean;
}

// Dependencies (allows for testing and override)
export interface PlaylistFetchDependencies {
  storage: DatabaseStorage;
  getSpotifyClient: () => Promise<any>;
  fetchEditorialTracks: (url: string) => Promise<any>;
  harvestVirtualizedRows: (url: string) => Promise<any>;
  getPlaylistTracks: (playlistId: string, platform: string) => Promise<any>;
  fetchAllPlaylistTracks: (spotify: any, playlistId: string) => Promise<any[]>;
  calculateUnsignedScore: (params: any) => number;
  broadcast: (event: string, data: any) => void;
  logger?: {
    info: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
  };
}

// Result type returned by executePlaylistFetch
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
  timing?: {
    startTime: Date;
    endTime: Date;
    durationMs: number;
  };
}

/**
 * Main service function to execute playlist fetching
 * Can be called from HTTP endpoint or directly from background triggers
 */
export async function executePlaylistFetch(
  options: PlaylistFetchOptions,
  deps: PlaylistFetchDependencies
): Promise<PlaylistFetchResult> {
  const startTime = new Date();
  const logger = deps.logger || console;
  
  try {
    // Validate and prepare target playlists
    const trackedPlaylists = await prepareTargetPlaylists(options, deps.storage);
    
    if (trackedPlaylists.length === 0) {
      throw new PlaylistFetchError(
        `No playlists found for mode: ${options.mode}`,
        400,
        'NO_PLAYLISTS'
      );
    }
    
    // Fetch tracks for all playlists
    const { allTracks, completenessResults } = await fetchAllPlaylistTracks(
      trackedPlaylists,
      deps
    );
    
    // Persist and enrich tracks
    if (allTracks.length > 0) {
      await persistAndEnrichTracks(allTracks, deps);
    }
    
    const endTime = new Date();
    
    return {
      success: true,
      tracksInserted: allTracks.length,
      playlistsFetched: trackedPlaylists.length,
      completenessResults,
      timing: {
        startTime,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
      },
    };
  } catch (error) {
    if (error instanceof PlaylistFetchError) {
      throw error;
    }
    logger.error('Unexpected error in executePlaylistFetch:', error);
    throw new PlaylistFetchError(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      'UNKNOWN_ERROR'
    );
  }
}

/**
 * Helper: Prepare and filter playlists based on mode
 */
async function prepareTargetPlaylists(
  options: PlaylistFetchOptions,
  storage: DatabaseStorage
): Promise<any[]> {
  const allTrackedPlaylists = await storage.getTrackedPlaylists();
  
  if (allTrackedPlaylists.length === 0) {
    throw new PlaylistFetchError(
      'No playlists are being tracked. Please add playlists to track first.',
      400,
      'NO_TRACKED_PLAYLISTS'
    );
  }
  
  // Filter based on mode
  let trackedPlaylists = allTrackedPlaylists;
  if (options.mode === 'editorial') {
    trackedPlaylists = allTrackedPlaylists.filter(p => p.isEditorial === 1);
  } else if (options.mode === 'non-editorial') {
    trackedPlaylists = allTrackedPlaylists.filter(p => p.isEditorial !== 1);
  } else if (options.mode === 'specific' && options.playlistId) {
    trackedPlaylists = allTrackedPlaylists.filter(p => p.playlistId === options.playlistId);
  }
  
  return trackedPlaylists;
}

/**
 * Helper: Fetch tracks for all playlists
 * This is a placeholder - the full implementation will be moved from routes.ts
 */
async function fetchAllPlaylistTracks(
  trackedPlaylists: any[],
  deps: PlaylistFetchDependencies
): Promise<{
  allTracks: InsertPlaylistSnapshot[];
  completenessResults: Array<{
    name: string;
    fetchCount: number;
    totalTracks: number | null;
    isComplete: boolean;
    skipped: number;
  }>;
}> {
  // TODO: Move the full playlist fetching logic from routes.ts
  // This includes Chartmetric → Spotify API → Puppeteer fallback chain
  return {
    allTracks: [],
    completenessResults: [],
  };
}

/**
 * Helper: Persist tracks to database and trigger enrichment
 */
async function persistAndEnrichTracks(
  allTracks: InsertPlaylistSnapshot[],
  deps: PlaylistFetchDependencies
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const logger = deps.logger || console;
  
  // Force all tracks to chartmetricStatus="pending"
  for (const track of allTracks) {
    track.chartmetricStatus = "pending";
    track.chartmetricId = null;
  }
  
  // Insert tracks
  await deps.storage.insertTracks(allTracks);
  logger.info(`Successfully saved ${allTracks.length} new tracks for ${today}`);
  
  // TODO: Trigger enrichment pipeline
  // This includes Phase 1 (Spotify API), Phase 2 (Credits), Phase 3 (MLC)
}
