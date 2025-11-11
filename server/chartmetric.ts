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
  private readonly minInterval: number = 1000; // 1 request per second

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

async function makeChartmetricRequest<T>(endpoint: string, method: string = "GET"): Promise<T> {
  const token = await getAuthToken();
  await rateLimiter.throttle();

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chartmetric API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.obj || data;
}

export async function getTrackByISRC(isrc: string): Promise<ChartmetricTrack | null> {
  try {
    console.log(`🔍 Chartmetric: Looking up track by ISRC ${isrc}`);
    const result = await makeChartmetricRequest<any>(`/track/isrc/${isrc}/get-ids`);
    
    // get-ids returns an array of track IDs with metadata
    if (!result || (Array.isArray(result) && result.length === 0)) {
      console.log(`⚠️  Chartmetric: No track found for ISRC ${isrc}`);
      return null;
    }
    
    const trackData = Array.isArray(result) ? result[0] : result;
    
    // Response format: { chartmetric_ids: [123], spotify_ids: [...], isrc: "..." }
    const chartmetricIds = trackData.chartmetric_ids || [];
    
    if (!chartmetricIds || chartmetricIds.length === 0) {
      console.log(`⚠️  Chartmetric: No Chartmetric ID in response for ISRC ${isrc}`);
      return null;
    }
    
    const trackId = chartmetricIds[0];
    console.log(`✅ Chartmetric: Found track with Chartmetric ID ${trackId}`);
    
    // Convert to our ChartmetricTrack format
    // Note: track name is not included in get-ids response, will be fetched separately if needed
    return {
      id: trackId.toString(),
      name: '', // Will be populated by metadata call if needed
      isrc: trackData.isrc || isrc,
      release_date: '',
      artists: []
    };
  } catch (error: any) {
    if (error.message.includes("404")) {
      console.log(`⚠️  Chartmetric: No track found for ISRC ${isrc}`);
      return null;
    }
    console.error(`❌ Chartmetric: Error looking up ISRC ${isrc}:`, error.message);
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

    // Step 2: Get streaming stats
    const stats = await getTrackStreamingStats(chartmetricTrack.id);

    // Determine track stage based on Spotify popularity (0-100 scale)
    let trackStage: string | undefined;
    const popularity = stats?.spotify?.current_streams;
    if (popularity !== undefined) {
      // Spotify popularity is 0-100
      if (popularity >= 75) trackStage = "Superstar";
      else if (popularity >= 50) trackStage = "Mainstream";
      else if (popularity >= 25) trackStage = "Mid-Level";
      else trackStage = "Developing";
    }

    const result: ChartmetricEnrichmentResult = {
      chartmetricId: chartmetricTrack.id,
      spotifyStreams: stats?.spotify?.current_streams,
      streamingVelocity: stats?.spotify?.velocity,
      youtubeViews: stats?.youtube?.views,
      trackStage,
    };

    const fieldsCount = Object.keys(result).filter(k => result[k as keyof ChartmetricEnrichmentResult] != null).length;
    console.log(`✅ Chartmetric: Enriched track with ${fieldsCount} fields (ID: ${result.chartmetricId}, Stage: ${trackStage})`);
    
    return result;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error enriching track ${track.trackName}:`, error.message);
    return null;
  }
}
