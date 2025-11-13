import type { PlaylistSnapshot } from "@shared/schema";

interface ChartmetricAuthResponse {
  token: string;
  expires_in: number;
}

interface ChartmetricTrack {
  id: string;
  name: string;
  isrc: string;
  release_date: string;
  artists: Array<{ id: string; name: string }>;
  album?: {
    name: string;
    image_url?: string;
  };
}

interface ChartmetricSongwriter {
  id: string;
  name: string;
  code?: string;
  image_url?: string;
}

interface ChartmetricStreamStats {
  spotify?: {
    current_streams?: number;
    velocity?: number;
  };
  youtube?: {
    views?: number;
  };
}

interface ChartmetricSongwriterProfile {
  id: string;
  name: string;
  stats?: {
    spotify_monthly_listeners?: number;
    spotify_followers?: number;
    youtube_views?: number;
  };
  track_count?: number;
  genres?: string[];
}

interface ChartmetricCollaborator {
  id: string;
  name: string;
  work_count: number;
  rank?: number;
}

interface ChartmetricPublisher {
  name: string;
  work_count: number;
}

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

const BASE_URL = "https://api.chartmetric.com/api";
const API_KEY = process.env.CHARTMETRIC_API_KEY;

class ChartmetricRateLimiter {
  private lastRequestTime: number = 0;
  private readonly minInterval: number = 2000; // 2 seconds = 30 requests per minute

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new ChartmetricRateLimiter();

// In-memory caches for batch processing
const isrcCache = new Map<string, ChartmetricTrack | null>();
const metadataCache = new Map<string, any>();

async function getAuthToken(): Promise<string> {
  if (!API_KEY) {
    throw new Error("CHARTMETRIC_API_KEY not configured. Please add it to Replit Secrets.");
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  await rateLimiter.throttle();

  const response = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refreshtoken: API_KEY,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chartmetric authentication failed: ${response.status} - ${errorText}`);
  }

  const data: ChartmetricAuthResponse = await response.json();
  
  cachedToken = data.token;
  // Set expiry to 90% of actual expiry time to refresh before it expires
  tokenExpiry = Date.now() + (data.expires_in * 1000 * 0.9);
  
  console.log(`✅ Chartmetric authenticated, token expires in ${data.expires_in}s`);
  
  return cachedToken;
}

async function makeChartmetricRequest<T>(endpoint: string, method: string = "GET", retryCount: number = 0): Promise<T> {
  const token = await getAuthToken();
  await rateLimiter.throttle();

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  // Retry once on 429 (rate limit) or 5xx (server errors) with jitter
  if (!response.ok && retryCount === 0 && (response.status === 429 || response.status >= 500)) {
    const jitter = Math.random() * 2000; // 0-2 seconds random jitter
    const retryDelay = 3000 + jitter; // 3-5 seconds total
    
    console.log(`⚠️  Chartmetric API ${response.status} error - retrying in ${(retryDelay / 1000).toFixed(1)}s...`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    
    return makeChartmetricRequest<T>(endpoint, method, retryCount + 1);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chartmetric API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.obj || data;
}

export async function getTrackByISRC(isrc: string): Promise<ChartmetricTrack | null> {
  // Check cache first
  if (isrcCache.has(isrc)) {
    console.log(`💾 Chartmetric: Using cached result for ISRC ${isrc}`);
    return isrcCache.get(isrc)!;
  }

  try {
    console.log(`🔍 Chartmetric: Looking up track by ISRC ${isrc}`);
    const result = await makeChartmetricRequest<any>(`/track/isrc/${isrc}/get-ids`);
    
    // get-ids returns an array of track IDs with metadata
    if (!result || (Array.isArray(result) && result.length === 0)) {
      console.log(`⚠️  Chartmetric: No track found for ISRC ${isrc}`);
      isrcCache.set(isrc, null);
      return null;
    }
    
    const trackData = Array.isArray(result) ? result[0] : result;
    
    // Response format: { chartmetric_ids: [123], spotify_ids: [...], isrc: "..." }
    const chartmetricIds = trackData.chartmetric_ids || [];
    
    if (!chartmetricIds || chartmetricIds.length === 0) {
      console.log(`⚠️  Chartmetric: No Chartmetric ID in response for ISRC ${isrc}`);
      isrcCache.set(isrc, null);
      return null;
    }
    
    const trackId = chartmetricIds[0];
    console.log(`✅ Chartmetric: Found track with Chartmetric ID ${trackId}`);
    
    // Convert to our ChartmetricTrack format
    const track: ChartmetricTrack = {
      id: trackId.toString(),
      name: '', // Will be populated by metadata call if needed
      isrc: trackData.isrc || isrc,
      release_date: '',
      artists: []
    };
    
    isrcCache.set(isrc, track);
    return track;
  } catch (error: any) {
    if (error.message.includes("404")) {
      console.log(`⚠️  Chartmetric: No track found for ISRC ${isrc}`);
      isrcCache.set(isrc, null);
      return null;
    }
    console.error(`❌ Chartmetric: Error looking up ISRC ${isrc}:`, error.message);
    isrcCache.set(isrc, null);
    return null; // Return null instead of throwing to handle gracefully
  }
}

export async function getTrackStreamingStats(chartmetricId: string): Promise<ChartmetricStreamStats | null> {
  try {
    console.log(`📊 Chartmetric: Fetching streaming stats for track ${chartmetricId}`);
    
    // Use the correct endpoint: /track/:id/spotify/stats
    const spotifyData = await makeChartmetricRequest<any>(`/track/${chartmetricId}/spotify/stats`);
    
    // Calculate velocity from recent data if available
    let velocity: number | undefined;
    let currentStreams: number | undefined;
    
    if (spotifyData && Array.isArray(spotifyData) && spotifyData.length >= 2) {
      const latest = spotifyData[spotifyData.length - 1];
      const previous = spotifyData[spotifyData.length - 2];
      currentStreams = latest?.value || latest?.popularity;
      
      if (latest?.value && previous?.value && previous.value > 0) {
        velocity = ((latest.value - previous.value) / previous.value) * 100;
      }
    } else if (spotifyData && Array.isArray(spotifyData) && spotifyData.length === 1) {
      currentStreams = spotifyData[0]?.value || spotifyData[0]?.popularity;
    }

    // Try to get YouTube views
    let youtubeViews: number | undefined;
    try {
      const youtubeData = await makeChartmetricRequest<any>(`/track/${chartmetricId}/youtube/stats`);
      if (youtubeData && Array.isArray(youtubeData) && youtubeData.length > 0) {
        youtubeViews = youtubeData[youtubeData.length - 1]?.value;
      }
    } catch (err) {
      // YouTube data might not be available for all tracks
      console.log(`⚠️  Chartmetric: No YouTube data for track ${chartmetricId}`);
    }

    const stats: ChartmetricStreamStats = {
      spotify: {
        current_streams: currentStreams,
        velocity,
      },
      youtube: {
        views: youtubeViews
      }
    };

    console.log(`✅ Chartmetric: Retrieved stats - ${currentStreams?.toLocaleString()} Spotify popularity${velocity ? `, ${velocity.toFixed(1)}% velocity` : ''}`);
    return stats;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error fetching streaming stats:`, error.message);
    return null;
  }
}

export async function getTrackMetadata(chartmetricId: string): Promise<any | null> {
  try {
    console.log(`📋 Chartmetric: Fetching track metadata for ${chartmetricId}`);
    const metadata = await makeChartmetricRequest<any>(`/track/${chartmetricId}`);
    console.log(`✅ Chartmetric: Retrieved metadata for ${metadata.name || 'track'}`);
    return metadata;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error fetching track metadata:`, error.message);
    return null;
  }
}

// Note: Songwriter profiles, collaborators, and publishers are not available in the public API
// These features require accessing Chartmetric's web platform or enterprise API
export async function getSongwriterProfile(songwriterId: string): Promise<ChartmetricSongwriterProfile | null> {
  console.log(`⚠️  Chartmetric: Songwriter profiles not available in public API`);
  return null;
}

export async function getSongwriterCollaborators(songwriterId: string): Promise<ChartmetricCollaborator[]> {
  console.log(`⚠️  Chartmetric: Collaborator data not available in public API`);
  return [];
}

export async function getSongwriterPublishers(songwriterId: string): Promise<ChartmetricPublisher[]> {
  console.log(`⚠️  Chartmetric: Publisher data not available in public API`);
  return [];
}

export async function getTrackCredits(chartmetricId: string): Promise<ChartmetricSongwriter[]> {
  console.log(`⚠️  Chartmetric: Track credits not available in public API - use track metadata instead`);
  return [];
}

export interface ChartmetricEnrichmentResult {
  chartmetricId?: string;
  spotifyStreams?: number;
  streamingVelocity?: number;
  playlistFollowers?: number;
  youtubeViews?: number;
  trackStage?: string;
  songwriterIds?: string[];
  composerName?: string;
  moods?: string[];
  activities?: string[];
  songwriters?: Array<{
    id: string;
    name: string;
  }>;
}

export async function enrichTrackWithChartmetric(track: PlaylistSnapshot): Promise<ChartmetricEnrichmentResult | null> {
  if (!track.isrc) {
    console.log(`⚠️  Chartmetric: Track ${track.trackName} has no ISRC, skipping`);
    return null;
  }

  try {
    console.log(`\n🎵 Chartmetric: Enriching track "${track.trackName}" by ${track.artistName}`);
    
    // Step 1: Look up track by ISRC
    const chartmetricTrack = await getTrackByISRC(track.isrc);
    if (!chartmetricTrack) {
      return null;
    }

    // Step 2: Get streaming stats (gracefully handle 401 for basic tier)
    const stats = await getTrackStreamingStats(chartmetricTrack.id);
    
    // DEBUG: Log what Chartmetric actually returns
    console.log('[Chartmetric DEBUG] Stats object:', JSON.stringify(stats, null, 2));
    if (stats?.spotify) {
      console.log('[Chartmetric DEBUG] Spotify stats keys:', Object.keys(stats.spotify));
    }

    // Step 3: Get full track metadata for songwriter IDs and additional context
    const metadata = await getTrackMetadata(chartmetricTrack.id);

    // Extract Spotify streams - try multiple possible field names
    let spotifyStreams: number | undefined;
    if (stats?.spotify) {
      // Try different field names that Chartmetric might use
      const spotifyStats = stats.spotify as any;
      spotifyStreams = spotifyStats.current_streams 
        || spotifyStats.streams 
        || spotifyStats.total_streams
        || spotifyStats.stream_count;
    }
    
    // Determine track stage based on Spotify streams
    let trackStage: string | undefined;
    if (spotifyStreams !== undefined) {
      // Classify based on stream count
      if (spotifyStreams >= 10000000) trackStage = "Superstar";        // 10M+
      else if (spotifyStreams >= 1000000) trackStage = "Mainstream";   // 1M+
      else if (spotifyStreams >= 100000) trackStage = "Mid-Level";     // 100K+
      else if (spotifyStreams >= 10000) trackStage = "Developing";     // 10K+
      else trackStage = "Emerging";                                     // <10K
    }

    // Extract songwriter IDs and metadata fields
    let songwriterIds: string[] | undefined;
    let composerName: string | undefined;
    let moods: string[] | undefined;
    let activities: string[] | undefined;

    if (metadata) {
      // songwriterIds is an array of Chartmetric songwriter IDs
      if (metadata.songwriterIds && Array.isArray(metadata.songwriterIds)) {
        songwriterIds = metadata.songwriterIds.map((id: any) => String(id));
      }
      
      // composer_name is a string field
      if (metadata.composer_name) {
        composerName = metadata.composer_name;
      }
      
      // moods and activities are arrays of objects {name: string} (added Jan 2025)
      // Extract the name field from each mood/activity object
      if (metadata.moods && Array.isArray(metadata.moods)) {
        moods = metadata.moods
          .map((mood: any) => typeof mood === 'string' ? mood : mood?.name || mood?.mood || String(mood))
          .filter(Boolean);
      }
      
      if (metadata.activities && Array.isArray(metadata.activities)) {
        activities = metadata.activities
          .map((activity: any) => typeof activity === 'string' ? activity : activity?.name || activity?.activity || String(activity))
          .filter(Boolean);
      }
    }

    const result: ChartmetricEnrichmentResult = {
      chartmetricId: chartmetricTrack.id,
      spotifyStreams: spotifyStreams,
      streamingVelocity: stats?.spotify?.velocity,
      youtubeViews: stats?.youtube?.views,
      trackStage,
      songwriterIds,
      composerName,
      moods,
      activities,
    };

    const fieldsCount = Object.keys(result).filter(k => result[k as keyof ChartmetricEnrichmentResult] != null).length;
    console.log(`✅ Chartmetric: Enriched track with ${fieldsCount} fields (ID: ${result.chartmetricId}, Songwriter IDs: ${songwriterIds?.length || 0})`);
    
    return result;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error enriching track ${track.trackName}:`, error.message);
    return null;
  }
}

// Batch ISRC lookup for upfront enrichment during playlist fetch
interface BatchLookupInput {
  isrc: string;
  trackId: string;
  trackName: string;
}

interface BatchLookupResult {
  status: "success" | "not_found" | "error";
  track?: ChartmetricTrack;
  error?: string;
}

interface BatchLookupResponse {
  results: Record<string, BatchLookupResult>;
  stats: {
    requested: number;
    deduped: number;
    succeeded: number;
    failed: number;
  };
}

// Simple semaphore for concurrency control
class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }

    await new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export async function lookupIsrcBatch(tracks: BatchLookupInput[]): Promise<BatchLookupResponse> {
  console.log(`\n🔍 Chartmetric Batch: Processing ${tracks.length} tracks`);
  
  const stats = {
    requested: tracks.length,
    deduped: 0,
    succeeded: 0,
    failed: 0,
  };

  // Step 1: Deduplicate ISRCs and build mapping
  const isrcToTracks = new Map<string, BatchLookupInput[]>();
  const trackIdToIsrc = new Map<string, string>();

  for (const track of tracks) {
    if (!track.isrc) continue;

    const isrc = track.isrc.trim();
    trackIdToIsrc.set(track.trackId, isrc);

    if (!isrcToTracks.has(isrc)) {
      isrcToTracks.set(isrc, []);
    }
    isrcToTracks.get(isrc)!.push(track);
  }

  const uniqueIsrcs = Array.from(isrcToTracks.keys());
  stats.deduped = uniqueIsrcs.length;
  
  console.log(`📊 Chartmetric Batch: ${stats.deduped} unique ISRCs (${stats.requested - stats.deduped} duplicates removed)`);

  // Step 2: Process unique ISRCs with concurrency control (3 workers)
  const semaphore = new Semaphore(3);
  let completed = 0;
  
  const lookupPromises = uniqueIsrcs.map(isrc =>
    semaphore.run(async () => {
      try {
        const track = await getTrackByISRC(isrc);
        completed++;
        
        // Progress logging every 25 tracks for large batches
        if (stats.deduped >= 25 && completed % 25 === 0) {
          console.log(`  📊 Chartmetric Batch Progress: ${completed}/${stats.deduped} ISRCs processed`);
        }
        
        return { isrc, track, error: null };
      } catch (error: any) {
        completed++;
        return { isrc, track: null, error: error.message };
      }
    })
  );

  const lookupResults = await Promise.allSettled(lookupPromises);

  // Step 3: Build results map for each track ID
  const results: Record<string, BatchLookupResult> = {};

  for (const track of tracks) {
    const isrc = trackIdToIsrc.get(track.trackId);
    if (!isrc) {
      results[track.trackId] = {
        status: "error",
        error: "No ISRC available",
      };
      stats.failed++;
      continue;
    }

    // Get the cached result from isrcCache
    const cachedTrack = isrcCache.get(isrc);

    if (cachedTrack === undefined) {
      results[track.trackId] = {
        status: "error",
        error: "Lookup failed",
      };
      stats.failed++;
    } else if (cachedTrack === null) {
      results[track.trackId] = {
        status: "not_found",
      };
      stats.failed++;
    } else {
      results[track.trackId] = {
        status: "success",
        track: cachedTrack,
      };
      stats.succeeded++;
    }
  }

  console.log(`✅ Chartmetric Batch: Complete - ${stats.succeeded} succeeded, ${stats.failed} failed`);
  
  return { results, stats };
}

export interface ChartmetricPlaylistMetadata {
  id: string;
  name: string;
  curator?: string;
  platform: string;
  followerCount?: number;
  trackCount?: number;
  type?: string;
  genres?: string[];
  imageUrl?: string;
  description?: string;
}

export interface ChartmetricPlaylistStats {
  followerHistory: Array<{
    date: string;
    followers: number;
  }>;
  currentFollowers?: number;
  followerGrowth?: {
    daily?: number;
    weekly?: number;
    monthly?: number;
  };
  momentum?: string;
  trackCountHistory?: Array<{
    date: string;
    count: number;
  }>;
}

export function parseChartmetricPlaylistUrl(url: string): { platform: string; id: string } | null {
  try {
    const match = url.match(/chartmetric\.com\/playlist\/([^/]+)\/([^/?#]+)/);
    if (match) {
      return {
        platform: match[1],
        id: match[2],
      };
    }
    return null;
  } catch (error) {
    console.error('Error parsing Chartmetric URL:', error);
    return null;
  }
}

const playlistIdCache = new Map<string, string | null>();

async function resolvePlaylistId(platformIdOrChartmetricId: string, platform: string = 'spotify'): Promise<string | null> {
  const cacheKey = `${platform}:${platformIdOrChartmetricId}`;
  
  if (playlistIdCache.has(cacheKey)) {
    console.log(`💾 Chartmetric: Using cached ID for ${cacheKey}`);
    return playlistIdCache.get(cacheKey)!;
  }

  if (/^\d+$/.test(platformIdOrChartmetricId)) {
    console.log(`✅ Chartmetric: ID ${platformIdOrChartmetricId} is already numeric (Chartmetric ID)`);
    playlistIdCache.set(cacheKey, platformIdOrChartmetricId);
    return platformIdOrChartmetricId;
  }

  try {
    console.log(`🔍 Chartmetric: Looking up numeric ID for platform playlist ${platform}:${platformIdOrChartmetricId}`);
    const lookupData = await makeChartmetricRequest<any>(`/playlist/${platform}:${platformIdOrChartmetricId}`);
    
    if (lookupData && lookupData.id) {
      const chartmetricId = lookupData.id.toString();
      console.log(`✅ Chartmetric: Resolved ${platform}:${platformIdOrChartmetricId} → Chartmetric ID ${chartmetricId}`);
      playlistIdCache.set(cacheKey, chartmetricId);
      return chartmetricId;
    }
    
    console.log(`⚠️  Chartmetric: No numeric ID found for ${platform}:${platformIdOrChartmetricId}`);
    playlistIdCache.set(cacheKey, null);
    return null;
  } catch (error: any) {
    if (error.message?.includes('404')) {
      console.log(`⚠️  Chartmetric: Playlist ${platform}:${platformIdOrChartmetricId} does not exist (404) - caching null`);
      playlistIdCache.set(cacheKey, null);
      return null;
    }
    
    console.error(`❌ Chartmetric: Transient error looking up playlist ID for ${platform}:${platformIdOrChartmetricId} - not caching:`, error.message);
    return null;
  }
}

export async function getPlaylistMetadata(playlistId: string, platform: string = 'spotify'): Promise<ChartmetricPlaylistMetadata | null> {
  try {
    const chartmetricId = await resolvePlaylistId(playlistId, platform);
    if (!chartmetricId) {
      console.log(`⚠️  Chartmetric: Could not resolve playlist ID ${playlistId}`);
      return null;
    }

    console.log(`📋 Chartmetric: Fetching playlist metadata for ${chartmetricId}`);
    const metadata = await makeChartmetricRequest<any>(`/playlist/${chartmetricId}`);
    
    if (!metadata) {
      return null;
    }

    // Extract image URL from images array (Chartmetric provides array like Spotify)
    let imageUrl: string | undefined;
    if (metadata.images && Array.isArray(metadata.images) && metadata.images.length > 0) {
      // Images might be objects with 'url' property or direct URLs
      const firstImage = metadata.images[0];
      imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
    } else if (metadata.image_url) {
      imageUrl = metadata.image_url;
    }

    return {
      id: metadata.id?.toString() || chartmetricId,
      name: metadata.name || '',
      curator: metadata.curator_name || metadata.curator,
      platform: metadata.platform || platform,
      followerCount: metadata.follower_count || metadata.followers,
      trackCount: metadata.track_count || metadata.tracks,
      type: metadata.type,
      genres: metadata.genres || [],
      imageUrl,
      description: metadata.description,
    };
  } catch (error: any) {
    if (error.message?.includes('401') && error.message?.includes('internal API endpoint')) {
      console.log(`ℹ️  Chartmetric: Playlist metadata endpoint requires Enterprise tier access (playlist: ${playlistId})`);
    } else {
      console.error(`❌ Chartmetric: Error fetching playlist metadata for ${playlistId}:`, error.message);
    }
    return null;
  }
}

export interface ChartmetricPlaylistSearchResult {
  id: string;
  name: string;
  platform: string;
  curator?: string;
  followerCount?: number;
  trackCount?: number;
  imageUrl?: string;
  platformId?: string;
}

export async function searchPlaylists(
  query: string,
  platform: string = 'spotify',
  limit: number = 10
): Promise<ChartmetricPlaylistSearchResult[]> {
  try {
    console.log(`🔍 Chartmetric: Searching for playlists - query="${query}", platform=${platform}, limit=${limit}`);
    
    // Try the search endpoint with query parameter
    const searchResults = await makeChartmetricRequest<any>(
      `/search?q=${encodeURIComponent(query)}&type=playlists&platform=${platform}&limit=${limit}`
    );
    
    if (!searchResults || !searchResults.playlists || !Array.isArray(searchResults.playlists)) {
      console.log(`⚠️  Chartmetric: No playlists found for query "${query}"`);
      return [];
    }
    
    const playlists: ChartmetricPlaylistSearchResult[] = searchResults.playlists.map((p: any) => {
      // Extract image URL
      let imageUrl: string | undefined;
      if (p.images && Array.isArray(p.images) && p.images.length > 0) {
        const firstImage = p.images[0];
        imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
      } else if (p.image_url) {
        imageUrl = p.image_url;
      }
      
      return {
        id: p.id?.toString() || p.chartmetric_id?.toString(),
        name: p.name || '',
        platform: p.platform || platform,
        curator: p.curator_name || p.curator || p.owner,
        followerCount: p.follower_count || p.followers,
        trackCount: p.track_count || p.tracks,
        imageUrl,
        platformId: p.platform_id || p.spotify_id || p.playlist_id,
      };
    });
    
    console.log(`✅ Chartmetric: Found ${playlists.length} playlists for "${query}"`);
    return playlists;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error searching playlists for "${query}":`, error.message);
    return [];
  }
}

export interface ChartmetricPlaylistTrack {
  chartmetricId: string;
  spotifyId?: string;
  name: string;
  artists: Array<{ id?: string; name: string }>;
  isrc?: string;
  album?: {
    name: string;
    image_url?: string;
  };
}

export async function getPlaylistTracks(
  playlistId: string,
  platform: string = 'spotify'
): Promise<ChartmetricPlaylistTrack[] | null> {
  try {
    const chartmetricId = await resolvePlaylistId(playlistId, platform);
    if (!chartmetricId) {
      console.log(`⚠️  Chartmetric: Could not resolve playlist ID ${playlistId}`);
      return null;
    }

    console.log(`🎵 Chartmetric: Fetching tracks for playlist ${chartmetricId} (with pagination)`);
    
    const allTracks: any[] = [];
    let offset = 0;
    const limit = 100; // Chartmetric default is 20, max is 100
    let hasMore = true;
    
    // Pagination loop
    while (hasMore) {
      const endpoint = `/playlist/${chartmetricId}/current/tracks?limit=${limit}&offset=${offset}`;
      const response = await makeChartmetricRequest<any>(endpoint);
      
      if (!response) {
        hasMore = false;
        break;
      }
      
      // Handle both array response and object response with tracks array
      let tracks: any[] = [];
      if (Array.isArray(response)) {
        tracks = response;
      } else if (response.tracks && Array.isArray(response.tracks)) {
        tracks = response.tracks;
      } else if (response.obj && Array.isArray(response.obj.tracks)) {
        tracks = response.obj.tracks;
      }
      
      if (tracks.length === 0) {
        hasMore = false;
      } else {
        allTracks.push(...tracks);
        offset += tracks.length;
        
        // Stop if we got fewer tracks than requested (last page)
        if (tracks.length < limit) {
          hasMore = false;
        }
      }
    }
    
    if (allTracks.length === 0) {
      console.log(`⚠️  Chartmetric: No tracks returned for playlist ${chartmetricId}`);
      return [];
    }
    
    // Normalize track data
    const formattedTracks: ChartmetricPlaylistTrack[] = allTracks
      .map((track: any) => {
        const chartmetricId = track.id?.toString() || track.cm_track?.toString();
        if (!chartmetricId) return null; // Skip tracks without IDs
        
        return {
          chartmetricId,
          spotifyId: track.spotify_id || track.spotify_track_id,
          name: track.name || '',
          artists: Array.isArray(track.artists) 
            ? track.artists.map((a: any) => ({
                id: a.id?.toString() || a.cm_artist?.toString(),
                name: a.name || ''
              }))
            : [],
          isrc: track.isrc || undefined,
          album: track.album ? {
            name: track.album.name || '',
            image_url: track.album.image_url || track.album.images?.[0]?.url
          } : undefined
        };
      })
      .filter((track): track is ChartmetricPlaylistTrack => track !== null);
    
    console.log(`✅ Chartmetric: Retrieved ${formattedTracks.length} tracks with Chartmetric IDs (${formattedTracks.filter(t => t.isrc).length} have ISRCs)`);
    return formattedTracks;
  } catch (error: any) {
    if (error.message?.includes('401')) {
      console.log(`ℹ️  Chartmetric: Playlist tracks endpoint requires Enterprise tier (playlist: ${playlistId})`);
    } else {
      console.error(`❌ Chartmetric: Error fetching playlist tracks:`, error.message);
    }
    return null;
  }
}

export async function getPlaylistStats(playlistId: string, platform: string = 'spotify', startDate?: string, endDate?: string): Promise<ChartmetricPlaylistStats | null> {
  try {
    const chartmetricId = await resolvePlaylistId(playlistId, platform);
    if (!chartmetricId) {
      console.log(`⚠️  Chartmetric: Could not resolve playlist ID ${playlistId}`);
      return null;
    }

    console.log(`📊 Chartmetric: Fetching playlist stats for ${chartmetricId}`);
    
    let endpoint = `/playlist/${chartmetricId}/stats`;
    const params = [];
    if (startDate) params.push(`start_date=${startDate}`);
    if (endDate) params.push(`end_date=${endDate}`);
    if (params.length > 0) endpoint += `?${params.join('&')}`;
    
    const stats = await makeChartmetricRequest<any>(endpoint);
    
    if (!stats || !Array.isArray(stats)) {
      console.log(`⚠️  Chartmetric: No stats data available for playlist ${chartmetricId}`);
      return null;
    }

    const followerHistory = stats
      .filter(item => item.followers !== undefined)
      .map(item => ({
        date: item.timestp || item.date,
        followers: item.followers,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const trackCountHistory = stats
      .filter(item => item.track_count !== undefined)
      .map(item => ({
        date: item.timestp || item.date,
        count: item.track_count,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const currentFollowers = followerHistory.length > 0 
      ? followerHistory[followerHistory.length - 1].followers 
      : undefined;

    let followerGrowth: any = {};
    if (followerHistory.length >= 2) {
      const latest = followerHistory[followerHistory.length - 1];
      const previous = followerHistory[followerHistory.length - 2];
      
      followerGrowth.daily = latest.followers - previous.followers;

      if (followerHistory.length >= 7) {
        const weekAgo = followerHistory[followerHistory.length - 7];
        followerGrowth.weekly = latest.followers - weekAgo.followers;
      }

      if (followerHistory.length >= 30) {
        const monthAgo = followerHistory[followerHistory.length - 30];
        followerGrowth.monthly = latest.followers - monthAgo.followers;
      }
    }

    let momentum = 'stable';
    if (followerGrowth.weekly) {
      if (followerGrowth.weekly > 1000) momentum = 'hot';
      else if (followerGrowth.weekly > 100) momentum = 'growing';
      else if (followerGrowth.weekly < -100) momentum = 'declining';
    }

    console.log(`✅ Chartmetric: Retrieved ${followerHistory.length} follower data points`);

    return {
      followerHistory,
      currentFollowers,
      followerGrowth: Object.keys(followerGrowth).length > 0 ? followerGrowth : undefined,
      momentum,
      trackCountHistory: trackCountHistory.length > 0 ? trackCountHistory : undefined,
    };
  } catch (error: any) {
    if (error.message?.includes('400') && error.message?.includes('platform')) {
      console.log(`ℹ️  Chartmetric: Playlist stats endpoint requires Enterprise tier access (playlist: ${playlistId})`);
    } else if (error.message?.includes('401')) {
      console.log(`ℹ️  Chartmetric: Playlist stats endpoint requires Enterprise tier access (playlist: ${playlistId})`);
    } else {
      console.error(`❌ Chartmetric: Error fetching playlist stats for ${playlistId}:`, error.message);
    }
    return null;
  }
}
