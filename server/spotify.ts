import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { db } from "./db";
import { spotifyTokens } from "@shared/schema";
import { encrypt, decrypt } from "./encryption";
import { eq } from "drizzle-orm";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REPLIT_DOMAIN = process.env.REPLIT_DOMAINS?.split(',')[0] || "127.0.0.1:5000";
const REDIRECT_URI = `https://${REPLIT_DOMAIN}/api/spotify/callback`;

const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-email",
  "user-read-private",
].join(" ");

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: Buffer.from(Date.now().toString()).toString('base64'),
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function saveTokensToDatabase(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const encryptedAccessToken = encrypt(accessToken);
  const encryptedRefreshToken = encrypt(refreshToken);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  
  await db.insert(spotifyTokens)
    .values({
      id: "singleton",
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: spotifyTokens.id,
      set: {
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt,
        updatedAt: new Date(),
      },
    });
  
  console.log('✅ Spotify OAuth successful - encrypted tokens stored in database');
}

async function getTokensFromDatabase(): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
} | null> {
  const tokens = await db.select()
    .from(spotifyTokens)
    .where(eq(spotifyTokens.id, "singleton"))
    .limit(1);
  
  if (tokens.length === 0) {
    return null;
  }
  
  const token = tokens[0];
  
  try {
    const accessToken = decrypt(token.encryptedAccessToken);
    const refreshToken = decrypt(token.encryptedRefreshToken);
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: token.expiresAt.getTime(),
    };
  } catch (error) {
    console.error('Failed to decrypt tokens:', error);
    return null;
  }
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  const data = await response.json();
  await saveTokensToDatabase(data.access_token, data.refresh_token, data.expires_in);
}

async function refreshAccessToken(): Promise<void> {
  const tokenData = await getTokensFromDatabase();
  
  if (!tokenData?.refresh_token) {
    throw new Error("No refresh token available");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenData.refresh_token,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();
  await saveTokensToDatabase(
    data.access_token,
    data.refresh_token || tokenData.refresh_token,
    data.expires_in
  );
  
  console.log('🔄 Spotify token refreshed successfully');
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokensFromDatabase();
  return tokens !== null;
}

export async function getUncachableSpotifyClient(): Promise<SpotifyApi> {
  const tokenData = await getTokensFromDatabase();
  
  if (!tokenData) {
    throw new Error("Not authenticated. Please authorize Spotify first via /api/spotify/auth");
  }

  if (Date.now() >= tokenData.expires_at - 5 * 60 * 1000) {
    await refreshAccessToken();
    const refreshedTokenData = await getTokensFromDatabase();
    if (!refreshedTokenData) {
      throw new Error("Failed to refresh token");
    }
    return SpotifyApi.withAccessToken(CLIENT_ID, {
      access_token: refreshedTokenData.access_token,
      token_type: "Bearer",
      expires_in: Math.floor((refreshedTokenData.expires_at - Date.now()) / 1000),
      refresh_token: refreshedTokenData.refresh_token,
    });
  }

  const spotify = SpotifyApi.withAccessToken(CLIENT_ID, {
    access_token: tokenData.access_token,
    token_type: "Bearer",
    expires_in: Math.floor((tokenData.expires_at - Date.now()) / 1000),
    refresh_token: tokenData.refresh_token,
  });

  return spotify;
}

export async function searchTrackByNameAndArtist(trackName: string, artistName: string): Promise<{
  isrc: string | null;
  label: string | null;
  spotifyId: string;
  spotifyUrl: string;
  popularity?: number;
  releaseDate?: string;
  albumType?: string;
  albumArt?: string;
  durationMs?: number;
  audioFeatures?: {
    energy?: number;
    danceability?: number;
    valence?: number;
    tempo?: number;
    acousticness?: number;
  };
  artists?: Array<{
    id: string;
    name: string;
    popularity?: number;
    genres?: string[];
    followers?: number;
  }>;
} | null> {
  try {
    const spotify = await getUncachableSpotifyClient();
    
    const query = `track:${trackName} artist:${artistName}`;
    console.log(`Searching Spotify for: ${query}`);
    
    const results = await spotify.search(query, ["track"], undefined, 1);
    
    if (!results.tracks?.items?.length) {
      console.log(`No Spotify results found for: ${trackName} by ${artistName}`);
      return null;
    }
    
    const track = results.tracks.items[0];
    let isrc = track.external_ids?.isrc || null;
    const label = track.album?.label || null;
    
    // Fetch full track details for complete metadata
    try {
      const fullTrack = await spotify.tracks.get(track.id);
      isrc = fullTrack.external_ids?.isrc || isrc;
      
      // Fetch audio features (provides mood/energy data)
      let audioFeatures;
      try {
        const features = await spotify.tracks.audioFeatures(track.id);
        audioFeatures = {
          energy: features.energy,
          danceability: features.danceability,
          valence: features.valence,
          tempo: features.tempo,
          acousticness: features.acousticness,
        };
      } catch (error) {
        console.log(`Audio features not available for track ${track.id}`);
      }
      
      // Fetch artist metadata for all artists on the track
      const artistsData = [];
      for (const artist of fullTrack.artists.slice(0, 3)) { // Limit to 3 artists to avoid rate limits
        try {
          const artistDetails = await spotify.artists.get(artist.id);
          artistsData.push({
            id: artist.id,
            name: artist.name,
            popularity: artistDetails.popularity,
            genres: artistDetails.genres,
            followers: artistDetails.followers?.total,
          });
        } catch (error) {
          console.log(`Failed to fetch details for artist ${artist.name}`);
        }
      }
      
      console.log(`Found track: ${track.name} - ISRC: ${isrc || "N/A"}, Label: ${label || "N/A"}, Popularity: ${fullTrack.popularity}`);
      
      return {
        isrc,
        label,
        spotifyId: track.id,
        spotifyUrl: track.external_urls.spotify,
        popularity: fullTrack.popularity,
        releaseDate: fullTrack.album?.release_date,
        albumType: fullTrack.album?.album_type,
        albumArt: fullTrack.album?.images?.[1]?.url || fullTrack.album?.images?.[0]?.url,
        durationMs: fullTrack.duration_ms,
        audioFeatures,
        artists: artistsData.length > 0 ? artistsData : undefined,
      };
    } catch (error) {
      console.error(`Error fetching full track details:`, error);
      
      // Fallback to basic data
      return {
        isrc,
        label,
        spotifyId: track.id,
        spotifyUrl: track.external_urls.spotify,
      };
    }
  } catch (error) {
    console.error(`Error searching Spotify for track ${trackName} by ${artistName}:`, error);
    return null;
  }
}

/**
 * Batch enrichment for editorial playlist tracks
 * Fetches full metadata for multiple track IDs at once
 * Spotify API allows up to 50 tracks per request
 * @param spotify - Existing Spotify client with tracks.getSeveral() method
 * @param trackIds - Array of Spotify track IDs to enrich
 * @returns Map of track IDs to enriched metadata, empty if enrichment fails
 */
export async function batchEnrichTracks(
  spotify: SpotifyApi,
  trackIds: string[]
): Promise<Map<string, {
  isrc: string | null;
  label: string | null;
  popularity: number;
  releaseDate: string | null;
  albumArt: string | null;
  durationMs: number;
  explicit: boolean;
}>> {
  const enrichedMap = new Map();
  
  if (trackIds.length === 0) {
    return enrichedMap;
  }
  
  try {
    console.log(`\n🎵 Batch enriching ${trackIds.length} tracks via Spotify API...`);
    
    // Process in batches of 50 (Spotify API limit)
    for (let i = 0; i < trackIds.length; i += 50) {
      const batch = trackIds.slice(i, i + 50);
      const batchNum = Math.floor(i / 50) + 1;
      const totalBatches = Math.ceil(trackIds.length / 50);
      
      try {
        console.log(`  Batch ${batchNum}/${totalBatches}: fetching ${batch.length} tracks...`);
        
        // SDK v1.2.0: get() overload returns different formats:
        // - Single ID: Track
        // - Multiple IDs: { tracks: Track[] }
        // - Or Track[] (depending on SDK version/behavior)
        const rawResponse = await spotify.tracks.get(batch);
        const tracks = Array.isArray(rawResponse) 
          ? rawResponse 
          : (rawResponse as any).tracks ?? [rawResponse];
        
        // Process each track in the response (may include null for unavailable tracks)
        let enrichedCount = 0;
        for (const track of tracks) {
          if (!track || !track.id) continue; // Skip null/unavailable tracks
          
          enrichedMap.set(track.id, {
            isrc: track.external_ids?.isrc || null,
            label: track.album?.label || null,
            popularity: track.popularity,
            releaseDate: track.album?.release_date || null,
            albumArt: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
            durationMs: track.duration_ms,
            explicit: track.explicit,
          });
          enrichedCount++;
        }
        
        console.log(`  ✅ Batch ${batchNum}/${totalBatches}: enriched ${enrichedCount}/${batch.length} tracks`);
        
        // Small delay between batches to respect rate limits
        if (i + 50 < trackIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (batchError: any) {
        console.error(`  ⚠️  Batch ${batchNum}/${totalBatches} failed:`, batchError.message);
        // Continue with next batch even if this one fails
      }
    }
    
    const successRate = (enrichedMap.size / trackIds.length * 100).toFixed(1);
    console.log(`✅ Batch enrichment complete: ${enrichedMap.size}/${trackIds.length} tracks (${successRate}%)`);
    
    return enrichedMap;
  } catch (error: any) {
    console.error('Batch enrichment failed:', error.message);
    return enrichedMap;
  }
}
