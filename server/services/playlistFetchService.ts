/**
 * Service wrapper for playlist fetching that eliminates HTTP loopback overhead
 * 
 * This module provides a clean interface for triggering playlist fetches
 * without the 20-40ms HTTP round-trip, network worker consumption, and
 * local networking failure modes of the previous fetch() approach.
 */

export interface PlaylistFetchOptions {
  mode?: 'all' | 'editorial' | 'non-editorial' | 'specific';
  playlistId?: string;
}

// Handler will be registered by routes.ts
type FetchHandler = (options: PlaylistFetchOptions) => Promise<{
  success: boolean;
  tracksInserted: number;
  playlistsFetched: number;
  completenessResults: any[];
}>;

let registeredHandler: FetchHandler | null = null;

/**
 * Register the core playlist fetch handler
 * Called once by routes.ts during initialization
 */
export function registerFetchHandler(handler: FetchHandler): void {
  registeredHandler = handler;
}

/**
 * Execute playlist fetch directly (no HTTP overhead)
 * Throws if handler not registered - indicates initialization error
 */
export async function triggerPlaylistFetch(
  options: PlaylistFetchOptions
): Promise<{
  success: boolean;
  tracksInserted: number;
  playlistsFetched: number;
  completenessResults: any[];
}> {
  if (!registeredHandler) {
    throw new Error(
      'Playlist fetch handler not initialized. This indicates a system startup error.'
    );
  }
  
  return await registeredHandler(options);
}
