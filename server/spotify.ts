import { SpotifyApi } from "@spotify/web-api-ts-sdk";

// In-memory token storage (in production, use a database)
let tokenData: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
} | null = null;

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
  console.log('Redirect URI being used:', REDIRECT_URI);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log('Full auth URL:', authUrl);
  return authUrl;
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
  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(): Promise<void> {
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
  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export function isAuthenticated(): boolean {
  return tokenData !== null;
}

export async function getUncachableSpotifyClient(): Promise<SpotifyApi> {
  if (!tokenData) {
    throw new Error("Not authenticated. Please authorize the app first.");
  }

  // Refresh token if expired or about to expire (within 5 minutes)
  if (Date.now() >= tokenData.expires_at - 5 * 60 * 1000) {
    await refreshAccessToken();
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
    const isrc = track.external_ids?.isrc || null;
    const label = track.album?.label || null;
    
    console.log(`Found track: ${track.name} - ISRC: ${isrc || "N/A"}, Label: ${label || "N/A"}`);
    
    return {
      isrc,
      label,
      spotifyId: track.id,
      spotifyUrl: track.external_urls.spotify,
    };
  } catch (error) {
    console.error(`Error searching Spotify for track ${trackName} by ${artistName}:`, error);
    return null;
  }
}
