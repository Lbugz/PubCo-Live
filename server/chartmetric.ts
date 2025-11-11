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
    const result = await makeChartmetricRequest<ChartmetricTrack>(`/track/isrc/${isrc}`);
    console.log(`✅ Chartmetric: Found track ${result.name} (ID: ${result.id})`);
    return result;
  } catch (error: any) {
    if (error.message.includes("404")) {
      console.log(`⚠️  Chartmetric: No track found for ISRC ${isrc}`);
      return null;
    }
    console.error(`❌ Chartmetric: Error looking up ISRC ${isrc}:`, error.message);
    throw error;
  }
}

export async function getTrackStreamingStats(chartmetricId: string): Promise<ChartmetricStreamStats | null> {
  try {
    console.log(`📊 Chartmetric: Fetching streaming stats for track ${chartmetricId}`);
    
    // Get Spotify streams
    const spotifyData = await makeChartmetricRequest<any>(`/track/${chartmetricId}/spotify/streams`);
    
    // Calculate velocity from recent data if available
    let velocity: number | undefined;
    if (spotifyData && Array.isArray(spotifyData) && spotifyData.length >= 2) {
      const latest = spotifyData[spotifyData.length - 1];
      const previous = spotifyData[spotifyData.length - 2];
      if (latest?.streams && previous?.streams && previous.streams > 0) {
        velocity = ((latest.streams - previous.streams) / previous.streams) * 100;
      }
    }

    const stats: ChartmetricStreamStats = {
      spotify: {
        current_streams: spotifyData?.[spotifyData.length - 1]?.streams,
        velocity,
      },
    };

    console.log(`✅ Chartmetric: Retrieved stats - ${stats.spotify?.current_streams?.toLocaleString()} streams, ${velocity?.toFixed(1)}% velocity`);
    return stats;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error fetching streaming stats:`, error.message);
    return null;
  }
}

export async function getSongwriterProfile(songwriterId: string): Promise<ChartmetricSongwriterProfile | null> {
  try {
    console.log(`👤 Chartmetric: Fetching songwriter profile ${songwriterId}`);
    const profile = await makeChartmetricRequest<ChartmetricSongwriterProfile>(`/artist/${songwriterId}`);
    console.log(`✅ Chartmetric: Retrieved profile for ${profile.name}`);
    return profile;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error fetching songwriter profile:`, error.message);
    return null;
  }
}

export async function getSongwriterCollaborators(songwriterId: string): Promise<ChartmetricCollaborator[]> {
  try {
    console.log(`🤝 Chartmetric: Fetching collaborators for songwriter ${songwriterId}`);
    const collaborators = await makeChartmetricRequest<ChartmetricCollaborator[]>(`/artist/${songwriterId}/related-artists`);
    console.log(`✅ Chartmetric: Found ${collaborators?.length || 0} collaborators`);
    return collaborators || [];
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error fetching collaborators:`, error.message);
    return [];
  }
}

export async function getSongwriterPublishers(songwriterId: string): Promise<ChartmetricPublisher[]> {
  try {
    console.log(`📝 Chartmetric: Fetching publishers for songwriter ${songwriterId}`);
    // Note: This endpoint may vary - adjust based on actual Chartmetric API docs
    const publishers = await makeChartmetricRequest<ChartmetricPublisher[]>(`/artist/${songwriterId}/publishers`);
    console.log(`✅ Chartmetric: Found ${publishers?.length || 0} publishers`);
    return publishers || [];
  } catch (error: any) {
    // Publishers endpoint may not exist for all songwriters
    console.log(`⚠️  Chartmetric: No publisher data available for songwriter ${songwriterId}`);
    return [];
  }
}

export async function getTrackCredits(chartmetricId: string): Promise<ChartmetricSongwriter[]> {
  try {
    console.log(`✍️  Chartmetric: Fetching credits for track ${chartmetricId}`);
    const credits = await makeChartmetricRequest<{ songwriters?: ChartmetricSongwriter[] }>(`/track/${chartmetricId}/credits`);
    console.log(`✅ Chartmetric: Found ${credits?.songwriters?.length || 0} songwriters`);
    return credits?.songwriters || [];
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error fetching credits:`, error.message);
    return [];
  }
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

    // Step 3: Get track credits (songwriters)
    const songwriters = await getTrackCredits(chartmetricTrack.id);

    // Determine track stage based on streams
    let trackStage: string | undefined;
    const streams = stats?.spotify?.current_streams;
    if (streams) {
      if (streams >= 100000000) trackStage = "Superstar";
      else if (streams >= 10000000) trackStage = "Mainstream";
      else if (streams >= 1000000) trackStage = "Mid-Level";
      else trackStage = "Developing";
    }

    const result: ChartmetricEnrichmentResult = {
      chartmetricId: chartmetricTrack.id,
      spotifyStreams: stats?.spotify?.current_streams,
      streamingVelocity: stats?.spotify?.velocity,
      youtubeViews: stats?.youtube?.views,
      trackStage,
      songwriters: songwriters.map(sw => ({ id: sw.id, name: sw.name })),
    };

    console.log(`✅ Chartmetric: Enriched track with ${Object.keys(result).filter(k => result[k as keyof ChartmetricEnrichmentResult] != null).length} fields`);
    
    return result;
  } catch (error: any) {
    console.error(`❌ Chartmetric: Error enriching track ${track.trackName}:`, error.message);
    return null;
  }
}
