import { SpotifyApi } from "@spotify/web-api-ts-sdk";

let connectionSettings: any;

async function getAccessToken() {
  // Check if cached credentials are still valid
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    const refreshToken = connectionSettings.settings.oauth?.credentials?.refresh_token;
    const accessToken = connectionSettings.settings.access_token || connectionSettings.settings.oauth?.credentials?.access_token;
    const clientId = connectionSettings.settings.oauth?.credentials?.client_id;
    const expiresIn = connectionSettings.settings.oauth?.credentials?.expires_in;
    
    return {accessToken, clientId, refreshToken, expiresIn};
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  // Try fetching all connections first
  const allResponse = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const allData = await allResponse.json();
  console.log('[DEBUG] All connections:', JSON.stringify(allData, null, 2));
  
  // Now try with the spotify filter
  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const responseData = await response.json();
  console.log('[DEBUG] Spotify-filtered response:', JSON.stringify(responseData, null, 2));
  
  // Try to find Spotify in any of the connections
  connectionSettings = responseData.items?.[0] || allData.items?.find((item: any) => 
    item.connector?.name?.toLowerCase().includes('spotify') ||
    item.name?.toLowerCase().includes('spotify')
  );
  
  if (!connectionSettings) {
    throw new Error('Spotify not connected. Please connect Spotify integration via Replit Secrets. Visit the Secrets panel in your Replit environment to authorize Spotify.');
  }
  
  const refreshToken = connectionSettings.settings?.oauth?.credentials?.refresh_token;
  const accessToken = connectionSettings.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  const clientId = connectionSettings.settings?.oauth?.credentials?.client_id;
  const expiresIn = connectionSettings.settings?.oauth?.credentials?.expires_in;
  
  if (!accessToken || !clientId || !refreshToken) {
    console.log('[DEBUG] Missing credentials. connectionSettings:', JSON.stringify(connectionSettings, null, 2));
    throw new Error('Spotify not connected. Please connect Spotify integration via Replit Secrets. Visit the Secrets panel in your Replit environment to authorize Spotify.');
  }
  
  return {accessToken, clientId, refreshToken, expiresIn};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSpotifyClient() {
  const {accessToken, clientId, refreshToken, expiresIn} = await getAccessToken();

  console.log('[DEBUG] Spotify credentials retrieved:');
  console.log('  - Client ID exists:', !!clientId);
  console.log('  - Access Token exists:', !!accessToken);
  console.log('  - Refresh Token exists:', !!refreshToken);
  console.log('  - Expires In:', expiresIn);
  console.log('  - Access Token (first 20 chars):', accessToken?.substring(0, 20));

  const spotify = SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn || 3600,
    refresh_token: refreshToken,
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
    let isrc = track.external_ids?.isrc || null;
    const label = track.album?.label || null;
    
    // If search result doesn't include ISRC, fetch full track details
    if (!isrc) {
      console.log(`Search result missing ISRC, fetching full track details for ID: ${track.id}`);
      try {
        const fullTrack = await spotify.tracks.get(track.id);
        isrc = fullTrack.external_ids?.isrc || null;
        console.log(`Retrieved ISRC from full track: ${isrc || "N/A"}`);
      } catch (error) {
        console.error(`Error fetching full track details:`, error);
      }
    }
    
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
