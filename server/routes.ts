import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { getUncachableSpotifyClient, searchTrackByNameAndArtist, getAuthUrl, exchangeCodeForToken, isAuthenticated } from "./spotify";
import { calculateUnsignedScore } from "./scoring";
import { searchByISRC, searchRecordingByName, searchArtistByName, getArtistExternalLinks } from "./musicbrainz";
import { generateAIInsights } from "./ai-insights";
import { playlists, playlistSnapshots, type InsertPlaylistSnapshot, type PlaylistSnapshot, insertTagSchema, insertTrackedPlaylistSchema } from "@shared/schema";
import { scrapeSpotifyPlaylist, scrapeTrackCredits, scrapeTrackCreditsWithTimeout } from "./scraper";
import { fetchEditorialTracksViaNetwork } from "./scrapers/spotifyEditorialNetwork";
import { harvestVirtualizedRows } from "./scrapers/spotifyEditorialDom";
import { broadcastEnrichmentUpdate } from "./websocket";
import { getAuthStatus, isAuthHealthy } from "./auth-monitor";
import { enrichTrackWithChartmetric, getSongwriterProfile, getSongwriterCollaborators, getSongwriterPublishers, getPlaylistMetadata, getPlaylistTracks, searchPlaylists } from "./chartmetric";
import { getPlaylistMetrics, getTrackMetrics, invalidateMetricsCache } from "./metricsService";
import { triggerMetricsUpdate, scheduleMetricsUpdate, flushMetricsUpdate } from "./metricsUpdateManager";

// Helper function to fetch all tracks from a playlist with pagination
async function fetchAllPlaylistTracks(spotify: any, playlistId: string): Promise<any[]> {
  const allTracks: any[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const response = await spotify.playlists.getPlaylistItems(playlistId, undefined, undefined, limit, offset);
      
      if (response.items && response.items.length > 0) {
        allTracks.push(...response.items);
        offset += response.items.length;
        hasMore = response.next !== null;
      } else {
        hasMore = false;
      }
    } catch (error: any) {
      console.error(`Error fetching playlist tracks at offset ${offset}:`, error.message);
      throw new Error(`Failed to fetch all tracks: ${error.message}`);
    }
  }
  
  console.log(`Fetched ${allTracks.length} total tracks via API pagination`);
  return allTracks;
}

// HTML entity decoder
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  
  // Handle numeric entities like &#123;
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return decoded;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Spotify OAuth endpoints
  app.get("/api/spotify/auth", (req, res) => {
    try {
      const authUrl = getAuthUrl();
      res.redirect(authUrl);
    } catch (error: any) {
      res.status(500).json({ error: "Spotify authentication not configured. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to Replit Secrets." });
    }
  });

  app.get("/api/spotify/callback", async (req, res) => {
    const code = req.query.code as string;
    
    if (!code) {
      res.status(400).send("No authorization code provided");
      return;
    }

    try {
      await exchangeCodeForToken(code);
      res.send(`
        <html>
          <body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #1DB954;">✅ Spotify Connected!</h1>
            <p>Authentication successful. You can now close this window and return to the application.</p>
            <script>
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("OAuth error:", error.message);
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #e22134;">❌ Authentication Failed</h1>
            <p>${error.message}</p>
            <p>Please check your Spotify App credentials in Replit Secrets.</p>
          </body>
        </html>
      `);
    }
  });

  app.get("/api/spotify/status", async (req, res) => {
    try {
      if (await isAuthenticated()) {
        await getUncachableSpotifyClient();
        res.json({ connected: true });
      } else {
        res.json({ connected: false, error: "Not authenticated" });
      }
    } catch (error: any) {
      res.json({ connected: false, error: error.message });
    }
  });

  app.get("/api/spotify/cookie-status", (req, res) => {
    const authStatus = getAuthStatus();
    const isHealthy = isAuthHealthy();
    
    res.json({
      healthy: isHealthy,
      lastSuccessfulAuth: authStatus.lastSuccessfulAuth,
      lastFailedAuth: authStatus.lastFailedAuth,
      consecutiveFailures: authStatus.consecutiveFailures,
      cookieSource: authStatus.cookieSource,
      cookieExpiry: authStatus.cookieExpiry,
      cookieExpired: authStatus.cookieExpiry ? new Date(authStatus.cookieExpiry) < new Date() : null,
    });
  });

  app.get("/api/spotify/search-playlists", async (req, res) => {
    try {
      // Validate query parameter
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: "Query parameter 'q' is required and cannot be empty" });
      }
      
      const trimmedQuery = query.trim();
      if (trimmedQuery.length > 120) {
        return res.status(400).json({ error: "Query parameter 'q' must be 120 characters or less" });
      }
      
      // Parse and validate limit parameter
      const limitParam = req.query.limit as string | undefined;
      const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 25) : 10;
      
      // Get authenticated Spotify client
      let spotify;
      try {
        spotify = await getUncachableSpotifyClient();
      } catch (error: any) {
        return res.status(401).json({ 
          error: "Spotify authentication required",
          message: error.message,
          authRequired: true
        });
      }
      
      // Search for playlists
      try {
        const searchResults = await spotify.search(trimmedQuery, ["playlist"], undefined, limit);
        
        const results = searchResults.playlists.items.map((p: any) => ({
          id: p.id,
          name: decodeHTMLEntities(p.name),
          owner: {
            displayName: decodeHTMLEntities(p.owner?.display_name || p.owner?.id || "Unknown"),
            id: p.owner?.id || "unknown"
          },
          totalTracks: p.tracks?.total || 0,
          images: (p.images || []).map((img: any) => ({
            url: img.url,
            width: img.width ?? null,
            height: img.height ?? null
          })),
          description: p.description ? decodeHTMLEntities(p.description) : undefined
        }));
        
        res.json({ results });
      } catch (searchError: any) {
        // Distinguish rate limit vs other errors
        if (searchError.status === 429 || searchError.message?.includes("rate limit")) {
          return res.status(429).json({ 
            error: "Spotify API rate limit exceeded. Please try again later.",
            rateLimited: true
          });
        }
        
        console.error("Spotify search error:", searchError);
        return res.status(500).json({ 
          error: "Failed to search playlists",
          message: searchError.message || "Unknown error"
        });
      }
    } catch (error: any) {
      console.error("Unexpected search error:", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: error.message || "Unknown error"
      });
    }
  });

  app.get("/api/spotify/playlist/:playlistId", async (req, res) => {
    try {
      let spotify;
      try {
        spotify = await getUncachableSpotifyClient();
      } catch (error: any) {
        return res.status(401).json({ error: error.message });
      }
      
      try {
        // Try with market parameter first
        const playlistData = await spotify.playlists.getPlaylist(req.params.playlistId, "from_token" as any);
        const decodedName = decodeHTMLEntities(playlistData.name);
        console.log("Playlist name from Spotify API (raw):", playlistData.name);
        console.log("Playlist name after decoding:", decodedName);
        res.json({ name: decodedName, id: playlistData.id, status: "accessible" });
      } catch (marketError: any) {
        // If market parameter fails, try without it as a fallback
        console.log("Retrying without market parameter...");
        try {
          const playlistData = await spotify.playlists.getPlaylist(req.params.playlistId);
          const decodedName = decodeHTMLEntities(playlistData.name);
          console.log("Playlist name from Spotify API (raw, no market):", playlistData.name);
          console.log("Playlist name after decoding:", decodedName);
          res.json({ name: decodedName, id: playlistData.id, status: "accessible" });
        } catch (finalError: any) {
          // Handle 404 errors with search fallback
          if (finalError?.message?.includes("404")) {
            console.log(`Playlist ${req.params.playlistId} returned 404. Attempting search fallback...`);
            
            try {
              // Try to search for the playlist by ID
              const searchResults = await spotify.search(req.params.playlistId, ["playlist"], undefined, 5);
              
              if (searchResults.playlists.items.length > 0) {
                // Find exact match by ID or use first result
                const matchedPlaylist = searchResults.playlists.items.find((p: any) => p.id === req.params.playlistId) 
                  || searchResults.playlists.items[0];
                
                console.log(`Found playlist via search: "${matchedPlaylist.name}" (${matchedPlaylist.id})`);
                
                // Verify we can actually access this playlist
                try {
                  const verifiedPlaylist = await spotify.playlists.getPlaylist(matchedPlaylist.id);
                  const decodedName = decodeHTMLEntities(verifiedPlaylist.name);
                  console.log("Verified playlist name via search (raw):", verifiedPlaylist.name);
                  console.log("Verified playlist name after decoding:", decodedName);
                  return res.json({ 
                    name: decodedName, 
                    id: verifiedPlaylist.id,
                    status: "accessible",
                    foundViaSearch: true,
                    originalId: req.params.playlistId
                  });
                } catch (verifyError) {
                  console.log("Search result playlist also inaccessible");
                }
              }
              
              // If search didn't work, return detailed error
              return res.status(404).json({ 
                error: "This playlist is not accessible through the Spotify API. It may be region-restricted, editorial-only, or require special access.",
                status: "restricted",
                playlistId: req.params.playlistId,
                suggestion: "Try using a public playlist from your personal library or a well-known user playlist instead of Spotify editorial playlists."
              });
            } catch (searchError) {
              console.error("Search fallback also failed:", searchError);
              return res.status(404).json({ 
                error: "This playlist is not accessible through the Spotify API. It may be region-restricted, editorial-only, or require special access.",
                status: "restricted",
                playlistId: req.params.playlistId
              });
            }
          } else {
            throw finalError;
          }
        }
      }
    } catch (error: any) {
      console.error("Error fetching playlist:", error);
      const errorMessage = error?.message || "Failed to fetch playlist from Spotify";
      res.status(500).json({ error: errorMessage, status: "error" });
    }
  });

  app.get("/api/weeks", async (req, res) => {
    try {
      const weeks = await storage.getAllWeeks();
      res.json(weeks);
    } catch (error) {
      console.error("Error fetching weeks:", error);
      res.status(500).json({ error: "Failed to fetch weeks" });
    }
  });

  app.get("/api/metrics/playlists", async (req, res) => {
    try {
      const metrics = await getPlaylistMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching playlist metrics:", error);
      res.status(500).json({ error: "Failed to fetch playlist metrics" });
    }
  });

  app.get("/api/metrics/tracks", async (req, res) => {
    try {
      const metrics = await getTrackMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching track metrics:", error);
      res.status(500).json({ error: "Failed to fetch track metrics" });
    }
  });

  app.get("/api/tracks", async (req, res) => {
    try {
      const week = req.query.week as string || "latest";
      const tagId = req.query.tagId as string | undefined;
      const playlistId = req.query.playlist as string | undefined;
      
      let tracks;
      if (tagId) {
        tracks = await storage.getTracksByTag(tagId);
      } else if (playlistId) {
        tracks = await storage.getTracksByPlaylist(playlistId, week !== "latest" ? week : undefined);
      } else {
        tracks = await storage.getTracksByWeek(week);
      }
      
      res.json(tracks);
    } catch (error) {
      console.error("Error fetching tracks:", error);
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  app.get("/api/playlists", async (req, res) => {
    try {
      const playlistNames = await storage.getAllPlaylists();
      res.json(playlistNames);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  app.get("/api/chartmetric/search/playlists", async (req, res) => {
    try {
      const { q: query, platform = 'spotify', limit = '10' } = req.query;
      
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: "Query parameter 'q' is required" });
        return;
      }
      
      const { searchPlaylists } = await import("./chartmetric");
      const results = await searchPlaylists(
        query,
        platform as string,
        parseInt(limit as string, 10)
      );
      
      res.json(results);
    } catch (error: any) {
      console.error("Error searching Chartmetric playlists:", error);
      res.status(500).json({ error: error.message || "Failed to search playlists" });
    }
  });

  app.get("/api/export", async (req, res) => {
    try {
      const week = req.query.week as string || "latest";
      const format = req.query.format as string || "csv";
      
      const tracks = await storage.getTracksByWeek(week);
      
      if (format === "csv") {
        const headers = ["Track Name", "Artist", "Playlist", "Label", "Publisher", "Songwriter", "ISRC", "Unsigned Score", "Instagram", "Twitter", "TikTok", "Email", "Contact Notes", "Spotify URL"];
        const rows = tracks.map(t => [
          t.trackName,
          t.artistName,
          t.playlistName,
          t.label || "",
          t.publisher || "",
          t.songwriter || "",
          t.isrc || "",
          t.unsignedScore.toString(),
          t.instagram || "",
          t.twitter || "",
          t.tiktok || "",
          t.email || "",
          t.contactNotes || "",
          t.spotifyUrl,
        ]);
        
        const csv = [
          headers.join(","),
          ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
        ].join("\n");
        
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="pub-leads-${week}.csv"`);
        res.send(csv);
      } else {
        res.json(tracks);
      }
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  app.get("/api/tags", async (req, res) => {
    try {
      const allTags = await storage.getAllTags();
      res.json(allTags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.post("/api/tags", async (req, res) => {
    try {
      const validatedTag = insertTagSchema.parse(req.body);
      const tag = await storage.createTag(validatedTag);
      res.json(tag);
    } catch (error) {
      console.error("Error creating tag:", error);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });

  app.delete("/api/tags/:id", async (req, res) => {
    try {
      await storage.deleteTag(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  app.get("/api/tracks/:trackId/tags", async (req, res) => {
    try {
      const trackTags = await storage.getTrackTags(req.params.trackId);
      res.json(trackTags);
    } catch (error) {
      console.error("Error fetching track tags:", error);
      res.status(500).json({ error: "Failed to fetch track tags" });
    }
  });

  app.post("/api/tracks/:trackId/tags/:tagId", async (req, res) => {
    try {
      await storage.addTagToTrack(req.params.trackId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to track:", error);
      res.status(500).json({ error: "Failed to add tag to track" });
    }
  });

  app.delete("/api/tracks/:trackId/tags/:tagId", async (req, res) => {
    try {
      await storage.removeTagFromTrack(req.params.trackId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from track:", error);
      res.status(500).json({ error: "Failed to remove tag from track" });
    }
  });

  app.patch("/api/tracks/:trackId/contact", async (req, res) => {
    try {
      const { instagram, twitter, tiktok, email, contactNotes } = req.body;
      await storage.updateTrackContact(req.params.trackId, {
        instagram,
        twitter,
        tiktok,
        email,
        contactNotes,
      });
      
      // Log activity
      await storage.logActivity({
        trackId: req.params.trackId,
        eventType: "contact_updated",
        eventDescription: "Contact information updated",
        metadata: JSON.stringify({ instagram, twitter, tiktok, email, contactNotes }),
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating track contact:", error);
      res.status(500).json({ error: "Failed to update contact information" });
    }
  });

  app.get("/api/tracks/:trackId/activity", async (req, res) => {
    try {
      const activity = await storage.getTrackActivity(req.params.trackId);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching track activity:", error);
      res.status(500).json({ error: "Failed to fetch activity history" });
    }
  });

  app.get("/api/playlists/:playlistId/activity", async (req, res) => {
    try {
      const activity = await storage.getPlaylistActivity(req.params.playlistId);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching playlist activity:", error);
      res.status(500).json({ error: "Failed to fetch playlist activity" });
    }
  });

  app.get("/api/playlists/:playlistId/quality", async (req, res) => {
    try {
      const metrics = await storage.getPlaylistQualityMetrics(req.params.playlistId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching playlist quality metrics:", error);
      res.status(500).json({ error: "Failed to fetch quality metrics" });
    }
  });

  app.get("/api/tracks/:trackId/artists", async (req, res) => {
    try {
      const artists = await storage.getArtistsByTrackId(req.params.trackId);
      res.json(artists);
    } catch (error) {
      console.error("Error fetching track artists:", error);
      res.status(500).json({ error: "Failed to fetch artist information" });
    }
  });

  app.get("/api/tracks/:trackId/full", async (req, res) => {
    try {
      const trackId = req.params.trackId;
      
      // Fetch all track data in parallel
      const [track, tags, activity, artists] = await Promise.all([
        storage.getTrackById(trackId),
        storage.getTrackTags(trackId),
        storage.getTrackActivity(trackId),
        storage.getArtistsByTrackId(trackId),
      ]);

      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Return comprehensive track object
      res.json({
        ...track,
        tags,
        activity,
        artists,
      });
    } catch (error) {
      console.error("Error fetching full track details:", error);
      res.status(500).json({ error: "Failed to fetch track details" });
    }
  });

  app.get("/api/tracked-playlists", async (req, res) => {
    try {
      const playlists = await storage.getTrackedPlaylists();
      
      // Normalize snake_case DB fields to camelCase for frontend compatibility
      const normalized = playlists.map(p => ({
        id: p.id,
        name: p.name,
        playlistId: (p as any).playlist_id || p.playlistId,
        spotifyUrl: (p as any).spotify_url || p.spotifyUrl,
        totalTracks: (p as any).total_tracks || p.totalTracks,
        lastFetchCount: (p as any).last_fetch_count || p.lastFetchCount,
        isComplete: (p as any).is_complete || p.isComplete,
        fetchMethod: (p as any).fetch_method || p.fetchMethod,
        lastChecked: (p as any).last_checked || p.lastChecked,
        isEditorial: (p as any).is_editorial || p.isEditorial,
        createdAt: (p as any).created_at || p.createdAt,
        curator: p.curator,
        source: p.source,
        genre: p.genre,
        region: p.region,
        followers: p.followers,
        imageUrl: (p as any).image_url || p.imageUrl, // Critical: Map snake_case to camelCase
      }));
      
      res.json(normalized);
    } catch (error) {
      console.error("Error fetching tracked playlists:", error);
      res.status(500).json({ error: "Failed to fetch tracked playlists" });
    }
  });

  app.get("/api/tracked-playlists/:id/chartmetric-analytics", async (req, res) => {
    try {
      const enterpriseEnabled = process.env.CHARTMETRIC_ENTERPRISE_ENABLED === 'true';
      
      if (!enterpriseEnabled) {
        return res.status(501).json({
          error: "Enterprise Access Required",
          message: "Playlist analytics require Chartmetric Enterprise tier access. Track-level analytics (streams, velocity, metadata) remain available with your current Basic tier.",
          upgradeInfo: {
            feature: "Playlist Analytics",
            currentTier: "Basic",
            requiredTier: "Enterprise",
            availableFeatures: [
              "Track ISRC lookup",
              "Track streaming metrics",
              "Songwriter metadata",
              "Track stage classification"
            ],
            enterpriseFeatures: [
              "Playlist follower analytics",
              "Playlist growth metrics",
              "Historical playlist stats"
            ]
          }
        });
      }

      const playlists = await storage.getTrackedPlaylists();
      const playlist = playlists.find(p => p.id === req.params.id);
      
      if (!playlist) {
        return res.status(404).json({ error: "Playlist not found" });
      }

      if (!playlist.chartmetricUrl) {
        return res.status(400).json({ error: "No Chartmetric URL configured for this playlist" });
      }

      const { parseChartmetricPlaylistUrl, getPlaylistMetadata, getPlaylistStats } = await import("./chartmetric");
      
      const parsed = parseChartmetricPlaylistUrl(playlist.chartmetricUrl);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid Chartmetric URL format" });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const [metadata, stats] = await Promise.all([
        getPlaylistMetadata(parsed.id, parsed.platform),
        getPlaylistStats(parsed.id, parsed.platform, startDate, endDate),
      ]);

      res.json({
        metadata,
        stats,
        chartmetricId: parsed.id,
        platform: parsed.platform,
      });
    } catch (error: any) {
      console.error("Error fetching Chartmetric playlist analytics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch Chartmetric analytics" });
    }
  });

  app.post("/api/tracked-playlists", async (req, res) => {
    try {
      // Check if frontend requested scraping mode (bypasses Spotify API)
      const useScraping = req.body.useScraping === true;
      
      // Extract optional metadata fields provided by frontend (e.g., from search results)
      const providedMetadata = {
        totalTracks: req.body.totalTracks ?? null,
        curator: req.body.curator ?? null,
        followers: req.body.followers ?? null,
        imageUrl: req.body.imageUrl ?? null,
      };
      
      // Check if frontend provided complete metadata (skip API calls)
      const hasProvidedMetadata = providedMetadata.totalTracks !== null;
      
      if (hasProvidedMetadata) {
        console.log(`✅ Received metadata from frontend (search result): totalTracks=${providedMetadata.totalTracks}, curator="${providedMetadata.curator}", skip API fetch`);
      }
      
      // Remove useScraping, isEditorial, and metadata fields from body before validation
      const { useScraping: _unused1, isEditorial: _unused2, totalTracks: _t, curator: _c, followers: _f, imageUrl: _i, ...requestBody } = req.body;
      
      const validatedPlaylist = insertTrackedPlaylistSchema.parse(requestBody);
      
      // Determine if editorial (either explicit flag or scraping mode requested)
      let isEditorial = useScraping ? 1 : 0;
      let totalTracks = providedMetadata.totalTracks;
      let fetchMethod = useScraping ? 'scraping' : 'api';
      let curator = providedMetadata.curator;
      let followers = providedMetadata.followers;
      let source = 'spotify';
      let imageUrl = providedMetadata.imageUrl;
      
      // For non-editorial playlists without provided metadata, try to fetch metadata
      if (!useScraping && !hasProvidedMetadata) {
        let metadataFetched = false;
        
        // PRIORITY 1: Try Chartmetric metadata first (works for all playlists including editorial)
        try {
          const chartmetricMetadata = await getPlaylistMetadata(validatedPlaylist.playlistId);
          
          // Validate that Chartmetric actually returned meaningful data
          if (chartmetricMetadata && chartmetricMetadata.name && chartmetricMetadata.trackCount !== undefined) {
            totalTracks = chartmetricMetadata.trackCount || null;
            curator = chartmetricMetadata.curator || null;
            followers = chartmetricMetadata.followerCount || null;
            imageUrl = chartmetricMetadata.imageUrl || null;
            
            // Detect editorial based on curator
            if (curator?.toLowerCase() === 'spotify') {
              isEditorial = 1;
              fetchMethod = 'scraping';
              console.log(`✅ Chartmetric: Detected editorial playlist (curator=Spotify): ${validatedPlaylist.playlistId}`);
            }
            
            console.log(`✅ Chartmetric metadata success: ${totalTracks} tracks, curator="${curator}", followers=${followers}`);
            metadataFetched = true;
          } else {
            console.log(`⚠️  Chartmetric returned incomplete metadata for ${validatedPlaylist.playlistId}, will try Spotify API`);
          }
        } catch (chartmetricError: any) {
          console.log(`❌ Chartmetric metadata error for ${validatedPlaylist.playlistId}: ${chartmetricError.message}`);
        }
        
        // FALLBACK: Use Spotify API if Chartmetric failed
        if (!metadataFetched) {
          try {
            const spotify = await getUncachableSpotifyClient();
            const playlistData = await spotify.playlists.getPlaylist(validatedPlaylist.playlistId, "from_token" as any);
            
            totalTracks = playlistData.tracks?.total || null;
            curator = playlistData.owner?.display_name || null;
            followers = playlistData.followers?.total || null;
            imageUrl = playlistData.images?.[0]?.url || null;
            
            // Detect if actually editorial based on owner
            if (playlistData.owner?.id === 'spotify') {
              isEditorial = 1;
              fetchMethod = 'scraping';
              console.log(`Detected editorial playlist (owner=spotify): ${validatedPlaylist.playlistId}`);
            }
            
            console.log(`✅ Spotify API metadata: ${totalTracks} tracks, curator="${curator}"`);
          } catch (apiError: any) {
            // Both Chartmetric and Spotify failed - likely editorial playlist
            console.log(`⚠️  Both Chartmetric and Spotify API failed for ${validatedPlaylist.playlistId}, will use scraping: ${apiError.message}`);
            isEditorial = 1;
            fetchMethod = 'scraping';
          }
        }
      } else {
        console.log(`Playlist ${validatedPlaylist.playlistId} added with scraping mode - metadata will be fetched during track fetch`);
      }
      
      const playlist = await storage.addTrackedPlaylist({
        ...validatedPlaylist,
        totalTracks,
        isEditorial,
        fetchMethod,
        curator,
        source,
        followers,
        imageUrl,
        isComplete: 0,
        lastFetchCount: 0,
      });
      
      // Log activity history for playlist addition
      try {
        await storage.logActivity({
          playlistId: playlist.playlistId,
          entityType: 'playlist',
          eventType: 'playlist_added',
          eventDescription: `Playlist "${playlist.name}" added to tracking`,
          metadata: JSON.stringify({
            playlistId: playlist.playlistId,
            playlistName: playlist.name,
            totalTracks,
            curator,
            followers,
            isEditorial,
            fetchMethod,
          }),
        });
      } catch (activityError: any) {
        console.error('Failed to log playlist addition activity:', activityError);
        // Don't block response if activity logging fails
      }
      
      // Trigger automatic fetch in background (fire-and-forget, non-blocking)
      setImmediate(() => {
        (async () => {
          try {
            console.log(`🚀 Auto-triggering fetch for newly added playlist: ${playlist.name}`);
            
            // Fire-and-forget: Don't await the response to avoid blocking
            fetch(`http://127.0.0.1:5000/api/fetch-playlists`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                mode: 'specific',
                playlistId: playlist.playlistId
              })
            })
            .then(response => {
              if (response.ok) {
                console.log(`✅ Auto-fetch completed for: ${playlist.name}`);
              } else {
                console.warn(`⚠️ Auto-fetch failed for ${playlist.name}: ${response.status}`);
              }
            })
            .catch(error => {
              console.error(`Auto-fetch error for ${playlist.name}:`, error.message);
            });
          } catch (error: any) {
            console.error(`Auto-fetch trigger error for ${playlist.name}:`, error.message);
          }
        })();
      });
      
      res.json(playlist);
    } catch (error: any) {
      console.error("Error adding tracked playlist:", error);
      // Return detailed error message for debugging
      const errorMessage = error?.message || error?.toString() || "Failed to add tracked playlist";
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/tracked-playlists/:id/refresh-metadata", async (req, res) => {
    try {
      const playlist = await storage.getTrackedPlaylists();
      const targetPlaylist = playlist.find(p => p.id === req.params.id);
      
      if (!targetPlaylist) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      
      let curator = null;
      let followers = null;
      let totalTracks = null;
      let imageUrl = null;
      let spotifySucceeded = false;
      let chartmetricSucceeded = false;
      
      // Try to fetch from Spotify API first (works for most playlists)
      try {
        const spotify = await getUncachableSpotifyClient();
        const playlistData = await spotify.playlists.getPlaylist(targetPlaylist.playlistId, "from_token" as any);
        
        curator = playlistData.owner?.display_name || null;
        followers = playlistData.followers?.total || null;
        totalTracks = playlistData.tracks?.total || null;
        imageUrl = playlistData.images?.[0]?.url || null;
        spotifySucceeded = true;
      } catch (error: any) {
        console.log(`Spotify API failed for "${targetPlaylist.name}": ${error.message}`);
      }
      
      // For editorial playlists with Chartmetric URL, use it as fallback for missing data
      if (targetPlaylist.isEditorial && targetPlaylist.chartmetricUrl) {
        const { parseChartmetricPlaylistUrl, getPlaylistMetadata } = await import("./chartmetric");
        const parsed = parseChartmetricPlaylistUrl(targetPlaylist.chartmetricUrl);
        
        if (parsed) {
          try {
            const chartmetricData = await getPlaylistMetadata(parsed.id, parsed.platform);
            
            if (chartmetricData) {
              chartmetricSucceeded = true;
              // Use Chartmetric data as fallback only for missing fields
              if (!imageUrl && chartmetricData.imageUrl) {
                imageUrl = chartmetricData.imageUrl;
                console.log(`Using Chartmetric artwork for "${targetPlaylist.name}"`);
              }
              if (!curator && chartmetricData.curator) {
                curator = chartmetricData.curator;
              }
              if (!followers && chartmetricData.followerCount) {
                followers = chartmetricData.followerCount;
              }
              if (!totalTracks && chartmetricData.trackCount) {
                totalTracks = chartmetricData.trackCount;
              }
            }
          } catch (error: any) {
            console.log(`Chartmetric fallback failed: ${error.message}`);
          }
        }
      }
      
      // If both APIs failed and this is an editorial playlist, try scraping
      if (!spotifySucceeded && !chartmetricSucceeded && targetPlaylist.isEditorial) {
        console.log(`APIs failed for editorial playlist "${targetPlaylist.name}", attempting scraping fallback...`);
        try {
          const { fetchEditorialTracksViaNetwork } = await import("./scrapers/spotifyEditorialNetwork");
          const scrapeResult = await fetchEditorialTracksViaNetwork(targetPlaylist.spotifyUrl);
          
          if (scrapeResult.success && scrapeResult.playlistName) {
            // Use scraped metadata
            const name = scrapeResult.playlistName;
            curator = scrapeResult.curator || null;
            followers = scrapeResult.followers || null;
            imageUrl = scrapeResult.imageUrl || null;
            totalTracks = scrapeResult.totalCaptured || null;
            
            // Update with name too since scraping provides it
            await storage.updateTrackedPlaylistMetadata(req.params.id, {
              name,
              curator,
              followers,
              totalTracks,
              imageUrl,
            });
            
            console.log(`Scraping successful for "${name}": curator="${curator}", followers=${followers}, totalTracks=${totalTracks}`);
            
            return res.json({ 
              success: true, 
              name,
              curator,
              followers,
              totalTracks,
              imageUrl,
              method: 'scraping'
            });
          } else {
            console.error(`Scraping failed: ${scrapeResult.error || 'No metadata extracted'}`);
          }
        } catch (scrapeError: any) {
          console.error(`Scraping fallback error: ${scrapeError.message}`);
        }
      }
      
      // Only update storage if we got data from at least one source
      if (!spotifySucceeded && !chartmetricSucceeded) {
        return res.status(500).json({ 
          error: "All metadata sources failed (Spotify API, Chartmetric API, and scraping). Please try again later." 
        });
      }
      
      // Build update object with only non-null values to avoid overwriting existing data
      const updateData: { curator?: string | null; followers?: number | null; totalTracks?: number | null; imageUrl?: string | null } = {};
      if (curator !== null) updateData.curator = curator;
      if (followers !== null) updateData.followers = followers;
      if (totalTracks !== null) updateData.totalTracks = totalTracks;
      if (imageUrl !== null) updateData.imageUrl = imageUrl;
      
      await storage.updateTrackedPlaylistMetadata(req.params.id, updateData);
      
      console.log(`Refreshed metadata for "${targetPlaylist.name}": curator="${curator}", followers=${followers}, totalTracks=${totalTracks}, imageUrl=${imageUrl ? 'yes' : 'no'}`);
      
      res.json({ 
        success: true, 
        curator,
        followers,
        totalTracks,
        imageUrl,
      });
    } catch (error: any) {
      console.error("Error refreshing playlist metadata:", error);
      res.status(500).json({ error: error.message || "Failed to refresh metadata" });
    }
  });

  app.delete("/api/tracked-playlists/:id", async (req, res) => {
    try {
      await storage.deleteTrackedPlaylist(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tracked playlist:", error);
      res.status(500).json({ error: "Failed to delete tracked playlist" });
    }
  });

  app.post("/api/enrich-metadata", async (req, res) => {
    try {
      const { mode = 'all', trackId, playlistName, limit = 50 } = req.body;
      
      let unenrichedTracks = await storage.getUnenrichedTracks(limit);
      
      // Filter based on mode
      if (mode === 'track' && trackId) {
        unenrichedTracks = unenrichedTracks.filter(t => t.id === trackId);
      } else if (mode === 'playlist' && playlistName) {
        unenrichedTracks = unenrichedTracks.filter(t => t.playlistName === playlistName);
      }
      
      if (unenrichedTracks.length === 0) {
        return res.json({ 
          success: true, 
          enrichedCount: 0,
          totalProcessed: 0,
          skippedNoIsrc: 0,
          message: "No tracks need MusicBrainz enrichment"
        });
      }

      let enrichedCount = 0;
      let spotifyEnrichedCount = 0;
      let skippedNoIsrc = 0;
      let nameBasedCount = 0;
      let artistLinksCount = 0;
      
      for (const track of unenrichedTracks) {
        let enrichmentTier = "none";
        let trackMetadata: any = {};

        // TIER 1: Direct ISRC → MusicBrainz
        if (track.isrc) {
          try {
            console.log(`[Tier 1] Using existing ISRC: ${track.isrc}`);
            const metadata = await searchByISRC(track.isrc);
            
            if (metadata.publisher || metadata.songwriter) {
              trackMetadata = {
                publisher: metadata.publisher,
                songwriter: metadata.songwriter,
                enrichedAt: new Date(),
                enrichmentTier: "isrc",
              };
              enrichedCount++;
              enrichmentTier = "isrc";
            } else {
              trackMetadata.enrichedAt = new Date();
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Error enriching track ${track.id}:`, error);
          }
        }
        // TIER 2: Spotify Search → ISRC → MusicBrainz
        else {
          try {
            const spotify = await getUncachableSpotifyClient();
            console.log(`[Tier 2] No ISRC, searching Spotify: ${track.trackName} by ${track.artistName}`);
            const spotifyData = await searchTrackByNameAndArtist(track.trackName, track.artistName);
            
            if (spotifyData && spotifyData.isrc) {
              trackMetadata.isrc = spotifyData.isrc;
              trackMetadata.label = spotifyData.label || track.label || undefined;
              trackMetadata.spotifyUrl = spotifyData.spotifyUrl || track.spotifyUrl;
              
              console.log(`✅ Found ISRC via Spotify: ${spotifyData.isrc}`);
              spotifyEnrichedCount++;
              
              await new Promise(resolve => setTimeout(resolve, 500));
              
              const metadata = await searchByISRC(spotifyData.isrc);
              
              if (metadata.publisher || metadata.songwriter) {
                trackMetadata.publisher = metadata.publisher;
                trackMetadata.songwriter = metadata.songwriter;
                trackMetadata.enrichedAt = new Date();
                trackMetadata.enrichmentTier = "spotify-isrc";
                enrichedCount++;
                enrichmentTier = "spotify-isrc";
              }
              
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.log('Spotify not available for enrichment, skipping...');
          }
        }
        
        // TIER 3: Name-Based MusicBrainz Fallback (score ≥ 90)
        if (enrichmentTier === "none") {
          try {
            console.log(`[Tier 3] Trying name-based search: ${track.trackName} by ${track.artistName}`);
            const metadata = await searchRecordingByName(track.trackName, track.artistName, 90);
            
            if (metadata.songwriter) {
              trackMetadata.songwriter = metadata.songwriter;
              trackMetadata.enrichedAt = new Date();
              trackMetadata.enrichmentTier = "name-based";
              enrichedCount++;
              nameBasedCount++;
              enrichmentTier = "name-based";
              console.log(`✅ Name-based match (score ${metadata.matchScore})`);
            } else if (metadata.matchScore && metadata.matchScore < 90) {
              console.log(`❌ Match score ${metadata.matchScore} below threshold 90`);
              skippedNoIsrc++;
            } else {
              skippedNoIsrc++;
            }
          } catch (error) {
            console.error(`Error in name-based search for track ${track.id}:`, error);
            skippedNoIsrc++;
          }
        }
        
        if (!trackMetadata.enrichedAt && enrichmentTier === "none") {
          skippedNoIsrc++;
        }
        
        if (Object.keys(trackMetadata).length > 0) {
          await storage.updateTrackMetadata(track.id, trackMetadata);
          // Schedule debounced metrics update
          scheduleMetricsUpdate({ source: "metadata_enrichment" });
        }
        
        // Artist Link Extraction (if we got songwriters)
        if (trackMetadata.songwriter) {
          try {
            const songwriters = trackMetadata.songwriter.split(',').map((s: string) => s.trim());
            
            for (const songwriterName of songwriters) {
              if (!songwriterName) continue;
              
              const artistResult = await searchArtistByName(songwriterName);
              
              if (artistResult && artistResult.score >= 90) {
                const links = await getArtistExternalLinks(artistResult.id);
                
                const artist = await storage.createOrUpdateArtist({
                  name: songwriterName,
                  musicbrainzId: artistResult.id,
                  ...links,
                });
                
                await storage.linkArtistToTrack(artist.id, track.id);
                
                if (Object.keys(links).length > 0) {
                  artistLinksCount++;
                  console.log(`✅ Found ${Object.keys(links).length} social links for ${songwriterName}`);
                }
              }
            }
          } catch (error) {
            console.error(`Error extracting artist links:`, error);
          }
        }
      }
      
      let message = `Enriched ${enrichedCount} tracks`;
      if (nameBasedCount > 0) {
        message += ` (${nameBasedCount} via name-based fallback)`;
      }
      if (spotifyEnrichedCount > 0) {
        message += `, found ${spotifyEnrichedCount} ISRCs via Spotify`;
      }
      if (artistLinksCount > 0) {
        message += `, extracted ${artistLinksCount} artist social profiles`;
      }

      // Flush any pending metrics update
      flushMetricsUpdate();

      res.json({ 
        success: true, 
        enrichedCount,
        spotifyEnrichedCount,
        nameBasedCount,
        artistLinksCount,
        skippedNoIsrc,
        totalProcessed: unenrichedTracks.length,
        message
      });
    } catch (error) {
      console.error("Error enriching metadata:", error);
      res.status(500).json({ error: "Failed to enrich metadata" });
    }
  });

  app.post("/api/enrich-artists", async (req, res) => {
    try {
      const { limit = 50 } = req.body;
      
      const tracksNeedingArtists = await storage.getTracksNeedingArtistEnrichment(limit);
      
      if (tracksNeedingArtists.length === 0) {
        return res.json({
          success: true,
          artistsCreated: 0,
          linksFound: 0,
          totalProcessed: 0,
          message: "No tracks need artist enrichment"
        });
      }

      console.log(`Starting artist enrichment for ${tracksNeedingArtists.length} tracks...`);
      
      let artistsCreated = 0;
      let linksFound = 0;
      
      for (const track of tracksNeedingArtists) {
        if (!track.songwriter) continue;
        
        try {
          const songwriters = track.songwriter.split(',').map(s => s.trim());
          
          for (const songwriterName of songwriters) {
            if (!songwriterName) continue;
            
            const artistResult = await searchArtistByName(songwriterName);
            
            if (artistResult && artistResult.score >= 90) {
              const links = await getArtistExternalLinks(artistResult.id);
              
              const artist = await storage.createOrUpdateArtist({
                name: songwriterName,
                musicbrainzId: artistResult.id,
                ...links,
              });
              
              await storage.linkArtistToTrack(artist.id, track.id);
              artistsCreated++;
              
              if (Object.keys(links).length > 0) {
                linksFound++;
                console.log(`✅ Found ${Object.keys(links).length} social links for ${songwriterName}`);
              }
            }
          }
        } catch (error) {
          console.error(`Error enriching artists for track ${track.id}:`, error);
        }
      }
      
      res.json({
        success: true,
        artistsCreated,
        linksFound,
        totalProcessed: tracksNeedingArtists.length,
        message: `Created ${artistsCreated} artist records, found ${linksFound} with social links`
      });
    } catch (error) {
      console.error("Error enriching artists:", error);
      res.status(500).json({ error: "Failed to enrich artists" });
    }
  });

  app.post("/api/enrich-chartmetric", async (req, res) => {
    try {
      const { limit = 50 } = req.body;
      
      const tracksNeedingEnrichment = await storage.getTracksNeedingChartmetricEnrichment(limit);
      
      if (tracksNeedingEnrichment.length === 0) {
        return res.json({
          success: true,
          enrichedCount: 0,
          failedNoIsrc: 0,
          failedApi: 0,
          totalProcessed: 0,
          message: "No tracks need Chartmetric enrichment"
        });
      }

      console.log(`\n🎵 Starting Chartmetric enrichment for ${tracksNeedingEnrichment.length} tracks...`);
      
      let enrichedCount = 0;
      let failedNoIsrc = 0;
      let failedApi = 0;
      let processedCount = 0;
      
      // Process tracks sequentially to respect rate limiting
      for (const track of tracksNeedingEnrichment) {
        try {
          // Skip tracks without ISRC
          if (!track.isrc) {
            await storage.updateTrackChartmetric(track.id, {
              chartmetricStatus: "failed_missing_isrc"
            });
            failedNoIsrc++;
            processedCount++;
            continue;
          }

          console.log(`\n📊 [${processedCount + 1}/${tracksNeedingEnrichment.length}] Enriching: ${track.trackName} by ${track.artistName}`);
          
          // Attempt enrichment with retry logic
          let retries = 0;
          let success = false;
          let lastError: Error | null = null;
          
          while (retries < 3 && !success) {
            try {
              const chartmetricData = await enrichTrackWithChartmetric(track);
              
              if (chartmetricData) {
                // Update track with Chartmetric data
                await storage.updateTrackChartmetric(track.id, {
                  chartmetricId: chartmetricData.chartmetricId,
                  chartmetricStatus: "success",
                  spotifyStreams: chartmetricData.spotifyStreams,
                  streamingVelocity: chartmetricData.streamingVelocity?.toString(),
                  trackStage: chartmetricData.trackStage,
                  playlistFollowers: chartmetricData.playlistFollowers,
                  youtubeViews: chartmetricData.youtubeViews,
                  chartmetricEnrichedAt: new Date(),
                  songwriterIds: chartmetricData.songwriterIds,
                  composerName: chartmetricData.composerName,
                  moods: chartmetricData.moods,
                  activities: chartmetricData.activities
                });
                
                // Log main enrichment activity
                const streamsText = chartmetricData.spotifyStreams !== null && chartmetricData.spotifyStreams !== undefined
                  ? `${chartmetricData.spotifyStreams.toLocaleString()} streams` 
                  : 'unknown streams';
                const stageText = chartmetricData.trackStage || 'unknown stage';
                const velocityText = chartmetricData.streamingVelocity !== null && chartmetricData.streamingVelocity !== undefined
                  ? `, ${chartmetricData.streamingVelocity} velocity` 
                  : '';
                
                await storage.logActivity({
                  trackId: track.id,
                  eventType: "chartmetric_enriched",
                  eventDescription: `Chartmetric analytics: ${streamsText}, ${stageText}${velocityText}`
                });
                
                // Log songwriter IDs if found
                if (chartmetricData.songwriterIds && chartmetricData.songwriterIds.length > 0) {
                  await storage.logActivity({
                    trackId: track.id,
                    eventType: "chartmetric_songwriters",
                    eventDescription: `Found ${chartmetricData.songwriterIds.length} songwriter Chartmetric ID${chartmetricData.songwriterIds.length > 1 ? 's' : ''}`
                  });
                }
                
                // Log moods if found
                if (chartmetricData.moods && chartmetricData.moods.length > 0) {
                  await storage.logActivity({
                    trackId: track.id,
                    eventType: "chartmetric_metadata",
                    eventDescription: `Moods: ${chartmetricData.moods.slice(0, 3).join(', ')}${chartmetricData.moods.length > 3 ? `, +${chartmetricData.moods.length - 3} more` : ''}`
                  });
                }
                
                // Log activities if found
                if (chartmetricData.activities && chartmetricData.activities.length > 0) {
                  await storage.logActivity({
                    trackId: track.id,
                    eventType: "chartmetric_metadata",
                    eventDescription: `Activities: ${chartmetricData.activities.slice(0, 3).join(', ')}${chartmetricData.activities.length > 3 ? `, +${chartmetricData.activities.length - 3} more` : ''}`
                  });
                }
                
                enrichedCount++;
                success = true;
                
                const songwriterInfo = chartmetricData.songwriterIds?.length ? `, ${chartmetricData.songwriterIds.length} songwriter IDs` : '';
                console.log(`✅ Enriched with Chartmetric: ${chartmetricData.spotifyStreams?.toLocaleString()} streams, stage: ${chartmetricData.trackStage}${songwriterInfo}`);
              } else {
                // No data found but no error
                await storage.updateTrackChartmetric(track.id, {
                  chartmetricStatus: "failed_api",
                  chartmetricEnrichedAt: new Date()
                });
                
                // Log failed enrichment
                await storage.logActivity({
                  trackId: track.id,
                  eventType: "chartmetric_failed",
                  eventDescription: "No Chartmetric data found for this track"
                });
                
                failedApi++;
                success = true;
                console.log(`⚠️  No Chartmetric data found for track`);
              }
            } catch (error: any) {
              lastError = error;
              retries++;
              
              if (retries < 3) {
                // Exponential backoff: 2s, 4s, 8s
                const backoffMs = Math.pow(2, retries) * 1000;
                console.log(`⚠️  Retry ${retries}/3 after ${backoffMs}ms: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
              }
            }
          }
          
          // If all retries failed, mark as failed
          if (!success && lastError) {
            await storage.updateTrackChartmetric(track.id, {
              chartmetricStatus: "failed_api",
              chartmetricEnrichedAt: new Date()
            });
            failedApi++;
            console.error(`❌ Failed after 3 retries: ${lastError.message}`);
          }
          
        } catch (error: any) {
          console.error(`❌ Error processing track ${track.id}:`, error.message);
          await storage.updateTrackChartmetric(track.id, {
            chartmetricStatus: "failed_api",
            chartmetricEnrichedAt: new Date()
          });
          failedApi++;
        }
        
        processedCount++;
        
        // Send WebSocket progress update every 5 tracks
        if (processedCount % 5 === 0 || processedCount === tracksNeedingEnrichment.length) {
          broadcastEnrichmentUpdate({
            type: "chartmetric_progress",
            processed: processedCount,
            total: tracksNeedingEnrichment.length,
            enriched: enrichedCount,
            failed: failedNoIsrc + failedApi
          });
        }
      }
      
      const message = `Enriched ${enrichedCount} tracks with Chartmetric analytics`;
      const details: string[] = [];
      if (failedNoIsrc > 0) details.push(`${failedNoIsrc} skipped (no ISRC)`);
      if (failedApi > 0) details.push(`${failedApi} failed (API errors)`);
      
      res.json({
        success: true,
        enrichedCount,
        failedNoIsrc,
        failedApi,
        totalProcessed: processedCount,
        message: details.length > 0 ? `${message}. ${details.join(", ")}` : message
      });
    } catch (error: any) {
      console.error("Error in Chartmetric enrichment:", error);
      res.status(500).json({ error: "Failed to enrich with Chartmetric" });
    }
  });

  app.post("/api/enrich-credits", async (req, res) => {
    try {
      const { mode = 'all', trackId, playlistName, limit = 10 } = req.body;
      
      let tracks: PlaylistSnapshot[] = [];
      
      // Handle different modes
      if (mode === 'track' && trackId) {
        // For single track, fetch it directly
        const track = await storage.getTrackById(trackId);
        if (track) {
          tracks = [track];
        }
      } else {
        // For 'all' or 'playlist', get unenriched tracks first
        tracks = await storage.getUnenrichedTracks(limit);
        
        // Filter by playlist if needed
        if (mode === 'playlist' && playlistName) {
          tracks = tracks.filter(t => t.playlistName === playlistName);
        }
      }
      
      if (tracks.length === 0) {
        return res.json({ 
          success: true, 
          enrichedCount: 0,
          failedCount: 0,
          totalProcessed: 0,
          message: mode === 'track' ? "Track not found" : "No tracks need Spotify Credits enrichment"
        });
      }

      console.log(`Starting credits enrichment for ${tracks.length} tracks...`);
      
      let enrichedCount = 0;
      let failedCount = 0;
      
      for (const track of tracks) {
        try {
          console.log(`Scraping credits for: ${track.trackName} by ${track.artistName}`);
          
          const creditsResult = await scrapeTrackCreditsWithTimeout(track.spotifyUrl, 45000);
          
          if (creditsResult.success && creditsResult.credits) {
            const { writers, composers, labels, publishers } = creditsResult.credits;
            
            // Combine writers and composers into songwriter field
            const songwriters = [...writers, ...composers].filter(Boolean);
            const songwriterString = songwriters.length > 0 ? songwriters.join(", ") : undefined;
            const publisherString = publishers.length > 0 ? publishers.join(", ") : undefined;
            const labelString = labels.length > 0 ? labels.join(", ") : undefined;
            
            const updateData: any = {
              songwriter: songwriterString,
              publisher: publisherString,
              label: labelString,
              enrichedAt: new Date(),
            };
            
            // Also capture Spotify stream count if available
            if (creditsResult.spotifyStreams) {
              updateData.spotifyStreams = creditsResult.spotifyStreams;
              console.log(`✅ Captured Spotify streams: ${creditsResult.spotifyStreams.toLocaleString()}`);
            }
            
            await storage.updateTrackMetadata(track.id, updateData);
            
            console.log(`✅ Enriched: ${track.trackName} - ${songwriters.length} songwriters, ${labels.length} labels, ${publishers.length} publishers`);
            enrichedCount++;
            
            // Broadcast real-time update
            broadcastEnrichmentUpdate({
              type: 'track_enriched',
              trackId: track.id,
              trackName: track.trackName,
              artistName: track.artistName,
            });
          } else {
            console.warn(`⚠️ Failed to scrape credits for ${track.trackName}: ${creditsResult.error}`);
            failedCount++;
          }
          
          // Rate limiting: 2.5 seconds between requests
          await new Promise(resolve => setTimeout(resolve, 2500));
        } catch (error: any) {
          console.error(`Error scraping credits for track ${track.id}:`, error);
          failedCount++;
        }
      }
      
      res.json({ 
        success: true, 
        enrichedCount,
        failedCount,
        totalProcessed: tracks.length,
        message: `Enriched ${enrichedCount} tracks with Spotify Credits (${failedCount} failed)`
      });
    } catch (error) {
      console.error("Error enriching credits:", error);
      res.status(500).json({ error: "Failed to enrich credits" });
    }
  });

  // Unified enrichment endpoint: Spotify Credits → MLC → MusicBrainz
  app.post("/api/enrich-track/:id", async (req, res) => {
    try {
      const { id: trackId } = req.params;
      
      // Fetch track
      const track = await storage.getTrackById(trackId);
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      console.log(`[Unified Enrichment] Starting for: ${track.trackName} by ${track.artistName}`);

      const tierResults: any[] = [];
      let enrichmentTier = track.enrichmentTier || "none";
      const updates: any = {};

      // TIER 0: ISRC Recovery & Spotify Metadata (if missing, try to fetch from Spotify)
      if (!track.isrc || !track.label || !track.albumArt) {
        try {
          const spotify = await getUncachableSpotifyClient();
          console.log(`[Tier 0: Spotify API] Fetching comprehensive metadata...`);
          const spotifyData = await searchTrackByNameAndArtist(track.trackName, track.artistName);
          
          if (spotifyData) {
            if (spotifyData.isrc) {
              updates.isrc = spotifyData.isrc;
              console.log(`✅ [Tier 0] Recovered ISRC: ${spotifyData.isrc}`);
            }
            
            // Update label if missing
            if (spotifyData.label && !track.label) {
              updates.label = spotifyData.label;
            }
            
            // Update album art if missing
            if (spotifyData.albumArt && !track.albumArt) {
              updates.albumArt = spotifyData.albumArt;
            }
            
            // Store additional Spotify metadata
            if (spotifyData.popularity !== undefined) {
              console.log(`📊 Spotify popularity: ${spotifyData.popularity}/100`);
            }
            
            // Log audio features if available (can be used as mood indicators)
            if (spotifyData.audioFeatures) {
              console.log(`🎵 Audio features: energy=${spotifyData.audioFeatures.energy?.toFixed(2)}, valence=${spotifyData.audioFeatures.valence?.toFixed(2)}`);
            }
            
            // Log artist metadata
            if (spotifyData.artists && spotifyData.artists.length > 0) {
              const primaryArtist = spotifyData.artists[0];
              console.log(`👤 Artist: ${primaryArtist.name} - Popularity: ${primaryArtist.popularity}, Genres: ${primaryArtist.genres?.join(', ') || 'N/A'}`);
            }
            
            await storage.logActivity({
              trackId: track.id,
              eventType: "spotify_metadata_enriched",
              eventDescription: `Spotify API: ${spotifyData.isrc ? 'ISRC recovered' : ''}${spotifyData.popularity ? `, popularity ${spotifyData.popularity}` : ''}`,
            });
          } else {
            console.log(`⚠️ [Tier 0] No Spotify data found`);
          }
        } catch (error: any) {
          console.log('Spotify not available for enrichment, skipping...');
        }
      }

      // Use recovered ISRC for subsequent tiers
      const effectiveIsrc = updates.isrc || track.isrc;

      // TIER 1: Spotify Credits Scraping
      try {
        console.log(`[Tier 1: Spotify Credits] Scraping...`);
        const creditsResult = await scrapeTrackCreditsWithTimeout(track.spotifyUrl, 45000);
        
        if (creditsResult.success && creditsResult.credits) {
          const { writers, composers, labels, publishers } = creditsResult.credits;
          const songwriters = [...writers, ...composers].filter(Boolean);
          const songwriterString = songwriters.length > 0 ? songwriters.join(", ") : undefined;
          const publisherString = publishers.length > 0 ? publishers.join(", ") : undefined;
          const labelString = labels.length > 0 ? labels.join(", ") : undefined;
          
          updates.songwriter = songwriterString;
          updates.publisher = publisherString;
          updates.label = labelString;
          
          // Store Spotify stream count if available (fallback for tracks without Chartmetric data)
          if (creditsResult.spotifyStreams && !updates.spotifyStreams) {
            updates.spotifyStreams = creditsResult.spotifyStreams;
            console.log(`✅ Captured Spotify streams from page: ${creditsResult.spotifyStreams.toLocaleString()}`);
          }
          
          enrichmentTier = "spotify-credits";
          
          tierResults.push({
            tier: "spotify-credits",
            success: true,
            message: `Found ${songwriters.length} songwriters, ${publishers.length} publishers`,
            data: { songwriters, publishers, labels, spotifyStreams: creditsResult.spotifyStreams }
          });
          console.log(`✅ [Tier 1] Success: ${songwriters.length} songwriters found`);
        } else {
          tierResults.push({
            tier: "spotify-credits",
            success: false,
            message: creditsResult.error || "Failed to scrape credits",
            data: null
          });
          console.warn(`⚠️ [Tier 1] Failed: ${creditsResult.error}`);
        }
      } catch (error: any) {
        console.error(`[Tier 1] Error:`, error);
        tierResults.push({
          tier: "spotify-credits",
          success: false,
          message: error.message || "Unexpected error during credits scraping",
          data: null
        });
      }

      // TIER 2: MLC API Lookup (only if we have ISRC)
      if (effectiveIsrc) {
        try {
          console.log(`[Tier 2: MLC] Looking up publisher status...`);
          const { enrichTrackWithMLC } = await import('./mlc.js');
          
          const mlcEnrichment = await enrichTrackWithMLC(effectiveIsrc);
          
          if (mlcEnrichment) {
            updates.publisherStatus = mlcEnrichment.publisherStatus;
            updates.collectionShare = mlcEnrichment.collectionShare;
            updates.ipiNumber = mlcEnrichment.ipiNumber;
            updates.iswc = mlcEnrichment.iswc;
            updates.mlcSongCode = mlcEnrichment.mlcSongCode;
            
            tierResults.push({
              tier: "mlc",
              success: true,
              message: `Publisher status: ${mlcEnrichment.publisherStatus}`,
              data: { 
                publisherStatus: mlcEnrichment.publisherStatus, 
                publisherName: mlcEnrichment.publisherName,
                writers: mlcEnrichment.writers 
              }
            });
            console.log(`✅ [Tier 2] Success: ${mlcEnrichment.publisherStatus}`);
          } else {
            tierResults.push({
              tier: "mlc",
              success: false,
              message: "No MLC matches found",
              data: null
            });
            console.log(`⚠️ [Tier 2] No matches found`);
          }
        } catch (error: any) {
          console.error(`[Tier 2] Error:`, error);
          tierResults.push({
            tier: "mlc",
            success: false,
            message: error.message || "MLC lookup failed",
            data: null
          });
        }
      } else {
        tierResults.push({
          tier: "mlc",
          success: false,
          message: "Skipped - no ISRC available",
          data: null
        });
      }

      // TIER 3: MusicBrainz (social links fallback)
      const musicbrainzResults: { name: string; found: boolean; hasLinks: boolean }[] = [];
      
      if (updates.songwriter) {
        try {
          console.log(`[Tier 3: MusicBrainz] Enriching social links...`);
          const { searchArtistByName, getArtistExternalLinks } = await import('./musicbrainz.js');
          
          const songwriterNames = updates.songwriter.split(',').map((s: string) => s.trim());
          let linksFound = 0;
          
          for (const songwriterName of songwriterNames.slice(0, 3)) {
            try {
              const artistResult = await searchArtistByName(songwriterName);
              if (artistResult && artistResult.id) {
                const links = await getArtistExternalLinks(artistResult.id);
                const artist = await storage.createOrUpdateArtist({
                  name: songwriterName,
                  musicbrainzId: artistResult.id,
                  instagram: links.instagram,
                  twitter: links.twitter,
                  facebook: links.facebook,
                  bandcamp: links.bandcamp,
                  linkedin: links.linkedin,
                  youtube: links.youtube,
                  discogs: links.discogs,
                  website: links.website,
                });
                await storage.linkArtistToTrack(artist.id, track.id);
                
                const hasLinks = Object.keys(links).some(k => links[k as keyof typeof links]);
                if (hasLinks) {
                  linksFound++;
                }
                
                musicbrainzResults.push({
                  name: songwriterName,
                  found: true,
                  hasLinks
                });
              } else {
                musicbrainzResults.push({
                  name: songwriterName,
                  found: false,
                  hasLinks: false
                });
              }
            } catch (error) {
              console.error(`Error getting links for ${songwriterName}:`, error);
              musicbrainzResults.push({
                name: songwriterName,
                found: false,
                hasLinks: false
              });
            }
          }
          
          tierResults.push({
            tier: "musicbrainz",
            success: linksFound > 0,
            message: `Found social links for ${linksFound}/${songwriterNames.length} songwriters`,
            data: { linksFound, totalSongwriters: songwriterNames.length }
          });
          console.log(`✅ [Tier 3] Success: ${linksFound} songwriters with social links`);
        } catch (error: any) {
          console.error(`[Tier 3] Error:`, error);
          tierResults.push({
            tier: "musicbrainz",
            success: false,
            message: error.message || "MusicBrainz enrichment failed",
            data: null
          });
        }
      } else {
        tierResults.push({
          tier: "musicbrainz",
          success: false,
          message: "Skipped - no songwriters available",
          data: null
        });
      }

      // TIER 4: Chartmetric Analytics (only if we have ISRC)
      if (effectiveIsrc) {
        // Skip if already enriched (status is "success" or "not_found")
        if (track.chartmetricStatus === "success" || track.chartmetricStatus === "not_found") {
          console.log(`⏭️  [Tier 4] Skipping - already enriched (status: ${track.chartmetricStatus})`);
          tierResults.push({
            tier: "chartmetric",
            success: track.chartmetricStatus === "success",
            message: `Already enriched (${track.chartmetricStatus})`,
            data: track.chartmetricStatus === "success" ? {
              chartmetricId: track.chartmetricId,
              streams: track.spotifyStreams,
              stage: track.trackStage,
            } : null
          });
        } else {
          try {
            console.log(`[Tier 4: Chartmetric] Fetching analytics...`);
            // Create a temporary track object with the recovered ISRC for Chartmetric
            const trackWithIsrc = { ...track, isrc: effectiveIsrc };
            const chartmetricData = await enrichTrackWithChartmetric(trackWithIsrc);
          
          if (chartmetricData) {
            updates.chartmetricId = chartmetricData.chartmetricId;
            updates.chartmetricStatus = "success";
            updates.spotifyStreams = chartmetricData.spotifyStreams;
            updates.streamingVelocity = chartmetricData.streamingVelocity?.toString();
            updates.trackStage = chartmetricData.trackStage;
            updates.playlistFollowers = chartmetricData.playlistFollowers;
            updates.youtubeViews = chartmetricData.youtubeViews;
            updates.chartmetricEnrichedAt = new Date();
            updates.songwriterIds = chartmetricData.songwriterIds;
            updates.composerName = chartmetricData.composerName;
            updates.moods = chartmetricData.moods;
            updates.activities = chartmetricData.activities;
            
            const streamsText = chartmetricData.spotifyStreams !== null && chartmetricData.spotifyStreams !== undefined
              ? `${chartmetricData.spotifyStreams.toLocaleString()} streams` 
              : 'unknown streams';
            const stageText = chartmetricData.trackStage || 'unknown stage';
            
            tierResults.push({
              tier: "chartmetric",
              success: true,
              message: `Analytics: ${streamsText}, ${stageText}`,
              data: { 
                streams: chartmetricData.spotifyStreams,
                velocity: chartmetricData.streamingVelocity,
                stage: chartmetricData.trackStage,
                moods: chartmetricData.moods,
                activities: chartmetricData.activities
              }
            });
            
            // Log Chartmetric activity
            await storage.logActivity({
              trackId: track.id,
              eventType: "chartmetric_enriched",
              eventDescription: `Chartmetric analytics: ${streamsText}, ${stageText}`,
            });
            
            console.log(`✅ [Tier 4] Success: ${streamsText}`);
          } else {
            // Log activity when Chartmetric has no data
            await storage.logActivity({
              trackId: track.id,
              eventType: "chartmetric_enriched",
              eventDescription: `No Chartmetric data found for ISRC ${effectiveIsrc}`,
            });
            
            tierResults.push({
              tier: "chartmetric",
              success: false,
              message: "No Chartmetric data found",
              data: null
            });
            console.log(`⚠️ [Tier 4] No data found`);
          }
          } catch (error: any) {
            console.error(`[Tier 4] Error:`, error);
            tierResults.push({
              tier: "chartmetric",
              success: false,
              message: error.message || "Chartmetric lookup failed",
              data: null
            });
          }
        }
      } else {
        tierResults.push({
          tier: "chartmetric",
          success: false,
          message: "Skipped - no ISRC available",
          data: null
        });
      }

      // Update track with all collected data
      const successfulTiers = tierResults.filter(t => t.success).length;
      
      // Only set enrichedAt if we actually got some data
      if (successfulTiers > 0 || Object.keys(updates).length > 0) {
        updates.enrichedAt = new Date();
        updates.enrichmentTier = enrichmentTier;
        await storage.updateTrackMetadata(track.id, updates);

        // Log enrichment activity
        const enrichmentSummary = tierResults
          .filter(t => t.success)
          .map(t => t.tier)
          .join(', ');
        
        await storage.logActivity({
          trackId: track.id,
          eventType: "track_enriched",
          eventDescription: `Track enriched via ${enrichmentSummary}`,
          metadata: JSON.stringify({
            tiers: tierResults.map(t => ({ tier: t.tier, success: t.success, message: t.message })),
            songwritersFound: updates.songwriter ? updates.songwriter.split(',').length : 0,
            publishersFound: updates.publisher ? updates.publisher.split(',').length : 0,
            labelsFound: updates.label ? 1 : 0
          }),
        });

        // Log MusicBrainz results for each songwriter
        if (musicbrainzResults.length > 0) {
          for (const result of musicbrainzResults) {
            if (result.found && result.hasLinks) {
              await storage.logActivity({
                trackId: track.id,
                eventType: "musicbrainz_lookup",
                eventDescription: `Found MusicBrainz record for ${result.name} with social links`,
                metadata: JSON.stringify({ songwriter: result.name, hasLinks: true }),
              });
            } else if (result.found && !result.hasLinks) {
              await storage.logActivity({
                trackId: track.id,
                eventType: "musicbrainz_lookup",
                eventDescription: `Found MusicBrainz record for ${result.name} (no social links)`,
                metadata: JSON.stringify({ songwriter: result.name, hasLinks: false }),
              });
            } else {
              await storage.logActivity({
                trackId: track.id,
                eventType: "musicbrainz_lookup",
                eventDescription: `No MusicBrainz record found for ${result.name}`,
                metadata: JSON.stringify({ songwriter: result.name, found: false }),
              });
            }
          }
        }

        // Broadcast real-time update
        broadcastEnrichmentUpdate({
          type: 'track_enriched',
          trackId: track.id,
          trackName: track.trackName,
          artistName: track.artistName,
        });
      }

      // If all tiers failed, return error
      if (successfulTiers === 0) {
        const failureMessages = tierResults
          .filter(t => !t.success)
          .map(t => `${t.tier}: ${t.message}`)
          .join('; ');
        
        return res.status(500).json({
          error: `Enrichment failed for all tiers. ${failureMessages}`,
          errorType: "EnrichmentError",
          tierResults
        });
      }

      const enrichmentStatus = successfulTiers === tierResults.length ? "success" : "partial";

      // Trigger metrics update after successful enrichment
      triggerMetricsUpdate({ source: "track_enrichment" });

      res.json({
        success: true,
        trackId: track.id,
        enrichmentStatus,
        enrichmentTier,
        tierResults,
        summary: `Completed ${successfulTiers}/${tierResults.length} tiers successfully`
      });
      
      console.log(`[Unified Enrichment] Complete: ${successfulTiers}/${tierResults.length} tiers successful`);
    } catch (error: any) {
      console.error("[Unified Enrichment] Error:", {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        trackId: req.params.id
      });
      
      // Provide detailed error message to frontend
      const errorMessage = error.name === 'TimeoutError' 
        ? "Enrichment timed out - the track page took too long to load"
        : error.message || "Failed to enrich track";
      
      res.status(500).json({ 
        error: errorMessage,
        errorType: error.name || "UnknownError"
      });
    }
  });

  // Railway-backed track enrichment endpoint
  app.post("/api/playlists/:playlistId/enrich-tracks", async (req, res) => {
    const enrichingTrackIds: string[] = [];
    
    try {
      const { playlistId } = req.params;
      const scraperApiUrl = process.env.SCRAPER_API_URL;

      if (!scraperApiUrl) {
        return res.status(500).json({
          success: false,
          error: 'SCRAPER_API_URL not configured'
        });
      }

      // Get unenriched tracks for this playlist
      const unenrichedTracks = await storage.getUnenrichedTracksByPlaylist(playlistId, 100);

      if (unenrichedTracks.length === 0) {
        return res.json({
          success: true,
          enrichedCount: 0,
          failedCount: 0,
          totalProcessed: 0,
          message: 'No tracks need enrichment'
        });
      }

      console.log(`Starting Railway enrichment for ${unenrichedTracks.length} tracks...`);

      // Mark tracks as enriching and track IDs for cleanup
      enrichingTrackIds.push(...unenrichedTracks.map(t => t.id));
      await storage.updateEnrichmentStatus(enrichingTrackIds, 'enriching');

      // Split into batches of 12 tracks (Railway limit)
      const BATCH_SIZE = 12;
      const batches = [];
      for (let i = 0; i < unenrichedTracks.length; i += BATCH_SIZE) {
        batches.push(unenrichedTracks.slice(i, i + BATCH_SIZE));
      }

      console.log(`Processing ${batches.length} batches...`);

      let enrichedCount = 0;
      let failedCount = 0;
      const failedTrackIds: string[] = [];

      // Process batches sequentially
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} tracks)...`);

        try {
          // Load cookies
          const fs = await import('fs');
          const path = await import('path');
          const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
          let spotifyCookies = null;

          if (fs.existsSync(cookiesPath)) {
            const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
            spotifyCookies = JSON.parse(cookiesData);
          }

          // Call Railway scraper
          const response = await fetch(`${scraperApiUrl}/enrich-tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tracks: batch.map(t => ({
                trackId: t.id,
                spotifyUrl: t.spotifyUrl
              })),
              cookies: spotifyCookies
            })
          });

          if (!response.ok) {
            throw new Error(`Railway API returned ${response.status}`);
          }

          const data = await response.json();

          // Update database with results
          for (const result of data.results) {
            const track = batch.find(t => t.id === result.trackId);
            if (!track) continue;

            if (result.success && result.credits) {
              // Combine songwriters and composers
              const songwriters = [
                ...(result.credits.songwriters || []),
                ...(result.credits.composers || [])
              ].filter(Boolean);

              const publishers = result.credits.publishers || [];
              const labels = result.credits.labels || [];

              await storage.updateTrackMetadata(result.trackId, {
                songwriter: songwriters.length > 0 ? songwriters.join(', ') : undefined,
                publisher: publishers.length > 0 ? publishers.join(', ') : undefined,
                label: labels.length > 0 ? labels.join(', ') : undefined,
                enrichedAt: new Date(),
                enrichmentStatus: 'completed'
              });

              enrichedCount++;
              console.log(`✅ Enriched: ${track.trackName}`);
            } else {
              // Mark as failed
              await storage.updateTrackMetadata(result.trackId, {
                enrichmentStatus: 'failed'
              });
              failedCount++;
              failedTrackIds.push(result.trackId);
              console.warn(`❌ Failed: ${track.trackName} - ${result.error}`);
            }
          }

          console.log(`Batch ${i + 1} complete: ${data.summary.succeeded} succeeded, ${data.summary.failed} failed`);

        } catch (error: any) {
          console.error(`Batch ${i + 1} error:`, error.message);
          
          // Mark all tracks in batch as failed
          for (const track of batch) {
            await storage.updateTrackMetadata(track.id, {
              enrichmentStatus: 'failed'
            });
            failedCount++;
            failedTrackIds.push(track.id);
          }
        }

        // Brief pause between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      res.json({
        success: true,
        enrichedCount,
        failedCount,
        totalProcessed: unenrichedTracks.length,
        failedTrackIds,
        message: `Railway enrichment complete: ${enrichedCount} succeeded, ${failedCount} failed`
      });

    } catch (error: any) {
      console.error('Error in Railway enrichment:', error);
      
      // Reset any tracks still in enriching state back to pending
      if (enrichingTrackIds.length > 0) {
        try {
          await storage.updateEnrichmentStatus(enrichingTrackIds, 'pending');
          console.log(`Reset ${enrichingTrackIds.length} tracks from 'enriching' to 'pending' after error`);
        } catch (resetError) {
          console.error('Failed to reset enriching tracks:', resetError);
        }
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to enrich tracks'
      });
    }
  });

  app.post("/api/tracks/:trackId/ai-insights", async (req, res) => {
    try {
      const track = await storage.getTrackById(req.params.trackId);
      
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      const insights = await generateAIInsights(track);
      res.json(insights);
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.status(500).json({ error: "Failed to generate AI insights" });
    }
  });

  app.get("/api/test-spotify", async (req, res) => {
    try {
      const spotify = await getUncachableSpotifyClient();
      
      // Get user's playlists
      const userPlaylists = await spotify.currentUser.playlists.playlists(10);
      
      // Try to fetch tracks from the first user playlist
      let firstPlaylistTracks = null;
      if (userPlaylists.items.length > 0) {
        try {
          const playlistId = userPlaylists.items[0].id;
          const playlistData = await spotify.playlists.getPlaylist(playlistId);
          firstPlaylistTracks = {
            name: playlistData.name,
            id: playlistId,
            trackCount: playlistData.tracks.total,
            firstTrack: playlistData.tracks.items[0]?.track?.name || "No tracks"
          };
        } catch (e: any) {
          firstPlaylistTracks = { error: e.message };
        }
      }
      
      res.json({ 
        success: true,
        userPlaylists: userPlaylists.items.map(p => ({ 
          id: p.id, 
          name: p.name,
          tracks: p.tracks?.total || 0
        })),
        firstPlaylistTest: firstPlaylistTracks
      });
    } catch (error) {
      console.error("Error testing Spotify:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/playlists/bulk-import", async (req, res) => {
    try {
      const { csvData } = req.body;
      
      if (!csvData || typeof csvData !== 'string') {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const lines = csvData.trim().split('\n');
      const results = {
        total: 0,
        successful: 0,
        failed: 0,
        playlists: [] as any[],
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(/^([^,]+),([^,]*),([^,]*),([^,]+)/);
        if (!match) continue;

        const title = match[1].trim();
        const isEditorial = match[2].toLowerCase() === 'yes';
        const link = match[4].trim();
        
        const playlistIdMatch = link.match(/playlist\/([a-zA-Z0-9]+)/);
        if (!playlistIdMatch) {
          results.failed++;
          results.playlists.push({ title, status: 'failed', reason: 'Invalid URL' });
          continue;
        }

        const playlistId = playlistIdMatch[1];
        results.total++;

        try {
          const existingPlaylist = await storage.getTrackedPlaylistBySpotifyId(playlistId);
          if (!existingPlaylist) {
            // Try to fetch totalTracks for non-editorial playlists
            let totalTracks = null;
            if (!isEditorial) {
              try {
                const spotify = await getUncachableSpotifyClient();
                const playlistData = await spotify.playlists.getPlaylist(playlistId, "from_token" as any);
                totalTracks = playlistData.tracks?.total || null;
                console.log(`Bulk import: Fetched totalTracks=${totalTracks} for playlist ${title}`);
              } catch (error) {
                console.log('Spotify not available for enrichment, skipping...');
              }
            }
            
            await storage.addTrackedPlaylist({
              name: title,
              playlistId: playlistId,
              spotifyUrl: link,
              isEditorial: isEditorial ? 1 : 0,
              totalTracks,
              fetchMethod: isEditorial ? 'scraping' : 'api',
              isComplete: 0,
              lastFetchCount: 0,
            });
          }
          results.successful++;
          results.playlists.push({ 
            title, 
            playlistId, 
            status: existingPlaylist ? 'already_exists' : 'added_to_tracked', 
            type: isEditorial ? 'editorial' : 'non-editorial'
          });
        } catch (error: any) {
          results.failed++;
          results.playlists.push({ 
            title, 
            status: 'failed', 
            reason: error.message 
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error in bulk import:", error);
      res.status(500).json({ error: "Failed to process bulk import" });
    }
  });

  app.post("/api/fetch-playlists", async (req, res) => {
    try {
      const { mode = 'all', playlistId } = req.body;
      const today = new Date().toISOString().split('T')[0];
      
      const allTrackedPlaylists = await storage.getTrackedPlaylists();
      
      if (allTrackedPlaylists.length === 0) {
        return res.status(400).json({ 
          error: "No playlists are being tracked. Please add playlists to track first." 
        });
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
        return res.status(400).json({ 
          error: `No playlists found for mode: ${mode}` 
        });
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
      
      for (const playlist of trackedPlaylists) {
        try {
          console.log(`Fetching playlist: ${playlist.name} (isEditorial=${playlist.isEditorial}, method=${playlist.fetchMethod})`);
          
          let playlistTracks: any[] = [];
          let playlistTotalTracks = playlist.totalTracks;
          let skippedCount = 0;
          
          // Use API for non-editorial, scraping for editorial
          let fetchMethod = playlist.fetchMethod || (playlist.isEditorial === 1 ? 'scraping' : 'api');
          let chartmetricAttempted = false;
          
          // PHASE 1: Try Chartmetric FIRST for ALL playlists (editorial AND non-editorial)
          try {
            console.log(`[Tracks] Starting fetch for ${playlist.name} (isEditorial=${playlist.isEditorial})`);
            console.log(`[Tracks] Trying Chartmetric track lookup for ${playlist.playlistId}...`);
            chartmetricAttempted = true;
            
            const cmTracks = await getPlaylistTracks(playlist.playlistId, 'spotify');
            
            if (cmTracks && cmTracks.length > 0) {
              console.log(`[Tracks] ✅ Chartmetric success: ${cmTracks.length} tracks`);
              
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
                  chartmetricId: parseInt(cmTrack.chartmetricId),
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
              
              await storage.updatePlaylistAfterFetch(playlist.id, {
                totalTracks: playlistTotalTracks,
                lastFetchCount: cmTracks.length - skippedCount,
                isComplete: 1,
                fetchMethod: 'chartmetric',
                lastChecked: new Date(),
              });
              
              continue; // Move to next playlist
            } else {
              console.log(`[Tracks] Chartmetric returned no tracks`);
            }
          } catch (cmError: any) {
            console.log(`[Tracks] Chartmetric failed: ${cmError.message}`);
            if (cmError.message?.includes('401')) {
              console.log(`[Tracks] Chartmetric requires Enterprise tier for playlist endpoints`);
            }
          }
          
          // PHASE 2: Chartmetric failed - use fallback based on playlist type
          try {
            if (playlist.isEditorial === 1) {
              // Editorial fallback → Puppeteer scraping
              console.log(`[Tracks] Editorial fallback → Puppeteer scraping`);
              throw new Error('Editorial playlist - using Puppeteer scraper');
            }
            
            // Non-editorial fallback → Spotify API
            if (!spotify) {
              console.log(`[Tracks] Spotify OAuth not configured, fallback to scraping for: ${playlist.name}`);
              throw new Error('Spotify client not available (not authenticated)');
            }
            
            console.log(`[Tracks] Non-editorial fallback → Spotify API for: ${playlist.name}`);
            const allPlaylistItems = await fetchAllPlaylistTracks(spotify, playlist.playlistId);
            
            // Get playlist metadata for total track count
            const playlistData = await spotify.playlists.getPlaylist(playlist.playlistId, "from_token" as any);
            if (!playlistTotalTracks && playlistData.tracks?.total) {
              playlistTotalTracks = playlistData.tracks.total;
            }
            
            if (!allPlaylistItems || allPlaylistItems.length === 0) {
              throw new Error('No tracks returned from API');
            }
            
            console.log(`[Tracks] ✅ Spotify API success: ${allPlaylistItems.length} tracks`);
            
            for (const item of allPlaylistItems) {
              if (!item.track || item.track.type !== "track") continue;
              
              const track = item.track;
              const trackKey = `${playlist.playlistId}_${track.external_urls.spotify}`;
              
              if (existingTrackKeys.has(trackKey)) {
                skippedCount++;
                continue;
              }
              
              const label = track.album?.label || null;
              const albumArt = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null;
              
              const score = calculateUnsignedScore({
                playlistName: playlist.name,
                label: label,
                publisher: null,
                writer: null,
              });
              
              const newTrack: InsertPlaylistSnapshot = {
                week: today,
                playlistName: playlist.name,
                playlistId: playlist.playlistId,
                trackName: track.name,
                artistName: track.artists.map((a: any) => a.name).join(", "),
                spotifyUrl: track.external_urls.spotify,
                albumArt: albumArt,
                isrc: track.external_ids?.isrc || null,
                label: label,
                unsignedScore: score,
                addedAt: new Date(item.added_at),
                dataSource: "api",
                chartmetricId: null,
                chartmetricStatus: "pending",
              };
              
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            playlistTracks = allPlaylistItems;
            fetchMethod = 'spotify_api';
            console.log(`[Tracks] Fetch Method = spotify_api (${allPlaylistItems.length} tracks, ${skippedCount} skipped)`);
          } catch (apiError: any) {
            // API/editorial fallback - use Puppeteer scraping
            if (playlist.isEditorial === 1) {
              console.log(`[Tracks] Editorial playlist - using Puppeteer scraping`);
            } else {
              console.log(`[Tracks] Spotify API failed: ${apiError.message}`);
              console.log(`[Tracks] Last resort fallback → Puppeteer scraping`);
            }
            
            const scraperApiUrl = process.env.SCRAPER_API_URL;
            let capturedTracks: any[] = [];
            
            if (scraperApiUrl) {
              try {
                console.log(`Calling scraper API at: ${scraperApiUrl}`);
                
                // Load saved Spotify cookies if available
                let spotifyCookies: any[] = [];
                try {
                  const fs = await import('fs');
                  const path = await import('path');
                  const cookiesPath = path.join(process.cwd(), 'spotify_cookies.json');

                  if (fs.existsSync(cookiesPath)) {
                    const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
                    spotifyCookies = JSON.parse(cookiesData);
                    console.log(`Loaded ${spotifyCookies.length} saved Spotify cookies`);
                  } else {
                    console.log('No saved cookies found - microservice will attempt unauthenticated access');
                  }
                } catch (cookieError) {
                  console.warn('Failed to load cookies, continuing without:', cookieError);
                }
                
                const scraperResponse = await fetch(`${scraperApiUrl}/scrape-playlist`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    playlistUrl: playlist.spotifyUrl,
                    cookies: spotifyCookies
                  })
                });
                
                if (!scraperResponse.ok) {
                  throw new Error(`Scraper API returned ${scraperResponse.status}`);
                }
                
                const scraperData = await scraperResponse.json();
                
                if (scraperData.success && scraperData.tracks.length > 0) {
                  console.log(`[Tracks] ✅ Puppeteer (microservice) success: ${scraperData.tracks.length} tracks`);
                  fetchMethod = 'network-capture';
                  capturedTracks = scraperData.tracks;
                  
                  // Update playlist metadata (totalTracks, curator, followers)
                  const hasMetadata = 
                    scraperData.totalTracks !== undefined || 
                    scraperData.curator !== undefined || 
                    scraperData.followers !== undefined;
                  
                  if (hasMetadata) {
                    await storage.updateTrackedPlaylistMetadata(playlist.id, {
                      totalTracks: scraperData.totalTracks !== undefined ? scraperData.totalTracks : undefined,
                      curator: scraperData.curator !== undefined ? scraperData.curator : undefined,
                      followers: scraperData.followers !== undefined ? scraperData.followers : undefined,
                    });
                    console.log(`Updated playlist metadata: totalTracks=${scraperData.totalTracks}, curator="${scraperData.curator}", followers=${scraperData.followers}`);
                  }
                } else {
                  console.warn(`Scraper API returned 0 tracks for ${playlist.name}`);
                }
              } catch (scraperError: any) {
                console.error(`Scraper API error for ${playlist.name}:`, scraperError.message);
                // Fall through to local scraping if microservice fails
              }
            }
            
            // If microservice not configured or failed, try local scraping
            if (capturedTracks.length === 0) {
              console.log(`Falling back to local network capture...`);
              const networkResult = await fetchEditorialTracksViaNetwork(playlist.spotifyUrl);
              const networkTrackCount = networkResult.tracks?.length ?? 0;

              if (networkResult.success && networkTrackCount >= 50) {
                console.log(`[Tracks] ✅ Puppeteer (local) success: ${networkTrackCount} tracks`);
                console.log(`[Tracks] Scraper metadata: name="${networkResult.playlistName}", curator="${networkResult.curator}", followers=${networkResult.followers}`);
                fetchMethod = 'network-capture';
                capturedTracks = networkResult.tracks ?? [];
                
                // Update playlist metadata (name, curator, followers, artwork) BEFORE processing tracks
                // Build updates object with only non-empty values
                const updates: any = {
                  totalTracks: networkTrackCount
                };
                
                if (networkResult.playlistName?.trim()) {
                  updates.name = networkResult.playlistName.trim();
                }
                if (networkResult.curator?.trim()) {
                  updates.curator = networkResult.curator.trim();
                }
                if (networkResult.followers !== undefined && networkResult.followers !== null) {
                  updates.followers = networkResult.followers;
                }
                if (networkResult.imageUrl?.trim()) {
                  updates.imageUrl = networkResult.imageUrl.trim();
                }
                
                // Always update totalTracks, and update other fields if present
                await storage.updateTrackedPlaylistMetadata(playlist.id, updates);
                console.log(`Updated playlist metadata: name="${updates.name || 'not set'}", curator="${updates.curator || 'not set'}", followers=${updates.followers ?? 'not set'}, artwork=${updates.imageUrl ? 'yes' : 'no'}`);
                
                // Verify the name was actually updated
                const verifyPlaylist = await storage.getPlaylistById(playlist.id);
                if (verifyPlaylist && verifyPlaylist.name === 'Loading...') {
                  console.error(`⚠️ WARNING: Playlist name still "Loading..." after update attempt. Scraper returned: "${networkResult.playlistName}"`);
                }
              } else {
                const networkErrorDetails = networkResult.error ? ` Error: ${networkResult.error}.` : '';
                console.log(`Local network capture insufficient (${networkTrackCount} tracks).${networkErrorDetails} Trying DOM fallback...`);
                const domResult = await harvestVirtualizedRows(playlist.spotifyUrl);
                const domTrackCount = domResult.tracks?.length ?? 0;

                if (domResult.success && domTrackCount > networkTrackCount) {
                  console.log(`[Tracks] ✅ Puppeteer (DOM fallback) success: ${domTrackCount} tracks`);
                  fetchMethod = 'network-capture';
                  capturedTracks = domResult.tracks ?? [];
                } else if (networkResult.success && networkTrackCount > 0) {
                  console.log(`[Tracks] ✅ Using Puppeteer (local) results: ${networkTrackCount} tracks`);
                  fetchMethod = 'network-capture';
                  capturedTracks = networkResult.tracks ?? [];
                } else {
                  if (!domResult.success && domResult.error) {
                    console.error(`DOM capture failed for ${playlist.name}: ${domResult.error}`);
                  }
                  console.error(`All capture methods failed for ${playlist.name}`);
                  continue;
                }
              }
            }
            
            // Process captured tracks
            // Get updated playlist name (in case scraper updated it)
            const currentPlaylist = await storage.getTrackedPlaylistBySpotifyId(playlist.playlistId);
            const playlistNameForTracks = currentPlaylist?.name || playlist.name;
            
            // PHASE 2: Batch-enrich scraped tracks with Spotify API metadata
            // This dramatically improves ISRC recovery rate (60% → 95%+)
            let enrichmentMap = new Map();
            if (capturedTracks.length > 0) {
              // Check if Spotify OAuth is configured (reuse or get new client)
              let spotifyClient = spotify;
              if (!spotifyClient) {
                try {
                  const { getUncachableSpotifyClient } = await import("./spotify");
                  spotifyClient = await getUncachableSpotifyClient();
                } catch (authError: any) {
                  console.log(`  ⏭️  Skipping batch enrichment - Spotify OAuth not configured: ${authError.message}`);
                }
              }
              
              if (spotifyClient) {
                try {
                  // Extract Spotify track IDs from scraped tracks
                  const trackIds: string[] = [];
                  for (const track of capturedTracks) {
                    // Try to extract track ID from URL or use direct trackId field
                    let trackId = track.trackId;
                    if (!trackId && track.spotifyUrl) {
                      const match = track.spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
                      if (match) {
                        trackId = match[1];
                      }
                    }
                    if (trackId) {
                      trackIds.push(trackId);
                    }
                  }
                  
                  if (trackIds.length > 0) {
                    const { batchEnrichTracks } = await import("./spotify");
                    enrichmentMap = await batchEnrichTracks(spotifyClient, trackIds);
                    
                    // Log enrichment results
                    const isrcCount = Array.from(enrichmentMap.values()).filter(d => d.isrc).length;
                    const labelCount = Array.from(enrichmentMap.values()).filter(d => d.label).length;
                    console.log(`  📊 Enrichment stats: ${enrichmentMap.size}/${trackIds.length} enriched, ${isrcCount} ISRCs, ${labelCount} labels recovered`);
                  }
                } catch (enrichError: any) {
                  console.warn(`  ⚠️  Batch enrichment failed (non-blocking): ${enrichError.message}`);
                  // Continue with scraped data only
                }
              }
            }
            
            for (const capturedTrack of capturedTracks) {
              const trackUrl = capturedTrack.spotifyUrl || `https://open.spotify.com/track/${capturedTrack.trackId}`;
              const trackKey = `${playlist.playlistId}_${trackUrl}`;
              
              if (existingTrackKeys.has(trackKey)) {
                skippedCount++;
                continue;
              }
              
              // Merge enriched data from Spotify API if available
              let trackId = capturedTrack.trackId;
              if (!trackId && trackUrl) {
                const match = trackUrl.match(/track\/([a-zA-Z0-9]+)/);
                if (match) {
                  trackId = match[1];
                }
              }
              
              // Merge enriched data from Spotify API (only if actually enriched)
              const enrichedData = trackId ? enrichmentMap.get(trackId) : null;
              const mergedIsrc = enrichedData?.isrc || capturedTrack.isrc || null;
              const mergedLabel = enrichedData?.label || null;
              const mergedAlbumArt = enrichedData?.albumArt || capturedTrack.albumArt || null;
              
              const score = calculateUnsignedScore({
                playlistName: playlistNameForTracks,
                label: mergedLabel,
                publisher: null,
                writer: null,
              });
              
              const artistName = Array.isArray(capturedTrack.artists) 
                ? capturedTrack.artists.join(", ") 
                : capturedTrack.artists || "Unknown";
              
              const newTrack: InsertPlaylistSnapshot = {
                week: today,
                playlistName: playlistNameForTracks,
                playlistId: playlist.playlistId,
                trackName: capturedTrack.name,
                artistName: artistName,
                spotifyUrl: trackUrl,
                albumArt: mergedAlbumArt,
                isrc: mergedIsrc,
                label: mergedLabel,
                unsignedScore: score,
                addedAt: capturedTrack.addedAt ? new Date(capturedTrack.addedAt) : new Date(),
                dataSource: enrichedData ? `${fetchMethod}+api` : fetchMethod,
                chartmetricId: null,
                chartmetricStatus: "pending",
              };
              
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            playlistTracks = capturedTracks;
            console.log(`[Tracks] Fetch Method = network_capture (${capturedTracks.length} tracks, ${skippedCount} skipped)`);
          }
          
          // Update completeness status
          const fetchCount = playlistTracks.length;
          const isComplete = playlistTotalTracks !== null && fetchCount >= playlistTotalTracks;
          
          await storage.updatePlaylistCompleteness(
            playlist.playlistId, 
            fetchCount, 
            playlistTotalTracks, 
            new Date()
          );
          
          // Update fetch method - keep activity logging separate to ensure it runs even if this fails
          try {
            await storage.updatePlaylistMetadata(playlist.id, { fetchMethod });
          } catch (metadataError) {
            console.warn(`Failed to update playlist metadata for ${playlist.name}:`, metadataError);
          }
          
          // Refetch playlist to get updated name for activity logging
          const updatedPlaylist = await storage.getPlaylistById(playlist.id);
          const playlistNameForLog = updatedPlaylist?.name || playlist.name;
          
          // Log playlist activity - runs regardless of metadata update success
          try {
            await storage.logActivity({
              entityType: 'playlist',
              playlistId: playlist.id,
              trackId: null,
              eventType: 'fetch_completed',
              eventDescription: `Fetched ${fetchCount}${playlistTotalTracks ? `/${playlistTotalTracks}` : ''} tracks via ${fetchMethod}`,
              metadata: JSON.stringify({
                playlistName: playlistNameForLog,
                playlistId: playlist.playlistId,
                fetchCount,
                totalTracks: playlistTotalTracks,
                fetchMethod,
                isComplete,
                skippedCount
              })
            });
          } catch (logError) {
            console.warn(`Failed to log activity for ${playlistNameForLog}:`, logError);
          }
          
          completenessResults.push({
            name: playlist.name,
            fetchCount,
            totalTracks: playlistTotalTracks,
            isComplete,
            skipped: skippedCount,
          });
          
          console.log(`${playlist.name}: ${fetchCount}${playlistTotalTracks ? `/${playlistTotalTracks}` : ''} tracks (${isComplete ? 'complete' : 'partial'}, ${skippedCount} skipped)`);
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          console.error(`Error fetching playlist ${playlist.name}:`, error);
        }
      }
      
      if (allTracks.length > 0) {
        // Force all tracks to chartmetricStatus="pending" and clear any stale Chartmetric IDs
        // This ensures background enrichment processes them correctly
        for (const track of allTracks) {
          track.chartmetricStatus = "pending";
          track.chartmetricId = null;
        }
        
        // Insert tracks immediately without blocking on Chartmetric
        await storage.insertTracks(allTracks);
        console.log(`Successfully saved ${allTracks.length} new tracks for ${today}`);
        
        // OPTIMIZATION: Trigger async Chartmetric enrichment (non-blocking)
        // Consolidates playlist-level ISRC matching + per-track lookups in background
        if (process.env.CHARTMETRIC_API_KEY) {
          const playlistsWithNewTracks = new Set(allTracks.map(t => t.playlistId));
          const playlistsToMatch = trackedPlaylists.filter(p => playlistsWithNewTracks.has(p.playlistId));
          
          console.log(`🚀 Triggering async Chartmetric enrichment for ${allTracks.length} tracks (non-blocking)`);
          
          // Run in background without blocking response
          // Capture fresh track data for immediate enrichment
          const freshTracks = allTracks.map(t => ({ ...t }));
          
          (async () => {
            try {
              let totalMatched = 0;
              
              // Step 1: Playlist-level ISRC matching (batch fetching from Chartmetric playlists)
              if (playlistsToMatch.length > 0) {
                console.log(`  📋 Matching Chartmetric IDs from ${playlistsToMatch.length} playlists...`);
                
                for (const playlist of playlistsToMatch) {
                  try {
                    const chartmetricTracks = await getPlaylistTracks(playlist.playlistId);
                    
                    if (chartmetricTracks && chartmetricTracks.length > 0) {
                      const updates = chartmetricTracks
                        .filter(t => t.isrc && t.chartmetricId)
                        .map(t => ({
                          isrc: t.isrc!,
                          chartmetricId: t.chartmetricId
                        }));
                      
                      if (updates.length > 0) {
                        const result = await storage.updateTrackChartmetricIdByIsrc(updates);
                        totalMatched += result.updated;
                        
                        if (result.updated > 0) {
                          console.log(`  ✅ ${playlist.name}: Matched ${result.updated} tracks by ISRC`);
                        }
                      }
                    }
                  } catch (playlistError: any) {
                    console.log(`  ⚠️  Skipping ${playlist.name}: ${playlistError.message}`);
                  }
                }
                
                if (totalMatched > 0) {
                  console.log(`  ✅ Playlist ISRC matching: ${totalMatched} tracks enriched`);
                }
              }
              
              // Step 2: Per-track Chartmetric ID lookup for newly inserted tracks with ISRCs
              try {
                const tracksWithIsrc = freshTracks
                  .filter(t => t.isrc && !t.chartmetricId)
                  .slice(0, 200); // Limit batch size for API rate limits
                
                if (tracksWithIsrc.length > 0) {
                  console.log(`  🎵 Looking up Chartmetric IDs for ${tracksWithIsrc.length} tracks via ISRC batch...`);
                  
                  const batchInput = tracksWithIsrc.map((t, idx) => ({
                    isrc: t.isrc!,
                    trackId: `temp_${idx}`,
                    trackName: t.trackName,
                  }));
                  
                  const { lookupIsrcBatch } = await import("./chartmetric");
                  const batchResult = await lookupIsrcBatch(batchInput);
                  
                  // Build updates array from successful lookups
                  const updates: Array<{ isrc: string; chartmetricId: string }> = [];
                  let resultIndex = 0;
                  for (const track of tracksWithIsrc) {
                    const tempId = `temp_${resultIndex++}`;
                    const result = batchResult.results[tempId];
                    
                    if (result?.status === "success" && result.track && track.isrc) {
                      updates.push({
                        isrc: track.isrc,
                        chartmetricId: result.track.id
                      });
                    }
                  }
                  
                  if (updates.length > 0) {
                    const result = await storage.updateTrackChartmetricIdByIsrc(updates);
                    console.log(`  ✅ Per-track lookup: ${result.updated}/${tracksWithIsrc.length} tracks enriched`);
                    totalMatched += result.updated;
                  }
                }
              } catch (lookupError: any) {
                console.warn(`  ⚠️  Per-track Chartmetric lookup failed (non-blocking): ${lookupError.message}`);
              }
              
              console.log(`✅ Background Chartmetric enrichment complete: ${totalMatched} total tracks enriched`);
            } catch (error: any) {
              console.warn(`⚠️  Background Chartmetric enrichment failed: ${error.message}`);
            }
          })().catch(err => console.error('Background Chartmetric error:', err));
        }
        
        // Trigger enrichment and metrics update for newly added tracks
        scheduleMetricsUpdate({ source: "fetch_playlists" });
        console.log(`✅ Scheduled background enrichment for ${allTracks.length} new tracks`);
      }
      
      res.json({ 
        success: true, 
        tracksAdded: allTracks.length,
        week: today,
        completenessResults 
      });
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists from Spotify" });
    }
  });

  app.post("/api/backfill-playlist-metadata", async (req, res) => {
    try {
      const spotify = await getUncachableSpotifyClient();
      const trackedPlaylists = await storage.getTrackedPlaylists();
      
      // Find playlists missing totalTracks
      const playlistsToBackfill = trackedPlaylists.filter(p => !p.totalTracks);
      
      if (playlistsToBackfill.length === 0) {
        return res.json({ 
          success: true, 
          message: "All playlists already have metadata",
          backfilled: 0 
        });
      }
      
      console.log(`Backfilling metadata for ${playlistsToBackfill.length} playlists...`);
      
      let backfilledCount = 0;
      const results: Array<{ name: string; totalTracks: number | null; isEditorial: boolean }> = [];
      
      for (const playlist of playlistsToBackfill) {
        try {
          // Try to fetch playlist metadata from Spotify API
          const playlistData = await spotify.playlists.getPlaylist(playlist.playlistId, "from_token" as any);
          
          const totalTracks = playlistData.tracks?.total || null;
          const isEditorial = playlistData.owner?.id === 'spotify' ? 1 : 0;
          const fetchMethod = isEditorial === 1 ? 'scraping' : 'api';
          
          // Update the playlist with metadata
          await storage.updatePlaylistMetadata(playlist.id, {
            totalTracks,
            isEditorial,
            fetchMethod,
          });
          
          backfilledCount++;
          results.push({
            name: playlist.name,
            totalTracks,
            isEditorial: isEditorial === 1,
          });
          
          console.log(`✓ ${playlist.name}: ${totalTracks} tracks (${isEditorial === 1 ? 'editorial' : 'non-editorial'})`);
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          console.error(`Failed to backfill ${playlist.name}:`, error.message);
          results.push({
            name: playlist.name,
            totalTracks: null,
            isEditorial: false,
          });
        }
      }
      
      res.json({ 
        success: true, 
        backfilled: backfilledCount,
        total: playlistsToBackfill.length,
        results 
      });
    } catch (error) {
      console.error("Error backfilling metadata:", error);
      res.status(500).json({ error: "Failed to backfill playlist metadata" });
    }
  });

  app.post("/api/backfill-album-art", async (req, res) => {
    try {
      const spotify = await getUncachableSpotifyClient();
      
      // Get all tracks missing album art
      const tracks = await db.select()
        .from(playlistSnapshots)
        .where(sql`${playlistSnapshots.albumArt} IS NULL`)
        .limit(500); // Process in batches to avoid timeout
      
      if (tracks.length === 0) {
        return res.json({ 
          success: true, 
          message: "All tracks already have album art",
          updated: 0 
        });
      }
      
      console.log(`Backfilling album art for ${tracks.length} tracks...`);
      
      let updatedCount = 0;
      let failedCount = 0;
      
      for (const track of tracks) {
        try {
          // Extract track ID from Spotify URL
          const trackIdMatch = track.spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
          if (!trackIdMatch) {
            failedCount++;
            continue;
          }
          
          const trackId = trackIdMatch[1];
          
          // Fetch track details from Spotify
          const trackData = await spotify.tracks.get(trackId);
          const albumArt = trackData.album?.images?.[1]?.url || trackData.album?.images?.[0]?.url || null;
          
          if (albumArt) {
            // Update track with album art
            await db.update(playlistSnapshots)
              .set({ albumArt })
              .where(eq(playlistSnapshots.id, track.id));
            
            updatedCount++;
            
            if (updatedCount % 50 === 0) {
              console.log(`Progress: ${updatedCount}/${tracks.length} tracks updated...`);
            }
          } else {
            failedCount++;
          }
          
          // Rate limiting - small delay between requests
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error: any) {
          console.error(`Failed to fetch album art for track ${track.trackName}:`, error.message);
          failedCount++;
        }
      }
      
      console.log(`Backfill complete: ${updatedCount} updated, ${failedCount} failed`);
      
      res.json({ 
        success: true, 
        updated: updatedCount,
        failed: failedCount,
        total: tracks.length,
        hasMore: tracks.length === 500 // Indicate if there are more tracks to process
      });
    } catch (error) {
      console.error("Error backfilling album art:", error);
      res.status(500).json({ error: "Failed to backfill album art" });
    }
  });

  app.post("/api/backfill-track-playlist-names", async (req, res) => {
    try {
      // Get all tracked playlists
      const trackedPlaylists = await storage.getTrackedPlaylists();
      
      if (trackedPlaylists.length === 0) {
        return res.json({ 
          success: true, 
          message: "No tracked playlists found",
          updated: 0 
        });
      }
      
      console.log(`Backfilling playlist names for tracks from ${trackedPlaylists.length} playlists...`);
      
      let updatedCount = 0;
      const results: Array<{ playlistId: string; oldName: string; newName: string; tracksUpdated: number }> = [];
      
      for (const playlist of trackedPlaylists) {
        try {
          // Update all tracks with this playlist ID to have the correct playlist name
          const result = await db.update(playlistSnapshots)
            .set({ playlistName: playlist.name })
            .where(eq(playlistSnapshots.playlistId, playlist.playlistId))
            .returning({ id: playlistSnapshots.id });
          
          const tracksUpdated = result.length;
          updatedCount += tracksUpdated;
          
          if (tracksUpdated > 0) {
            results.push({
              playlistId: playlist.playlistId,
              oldName: playlist.playlistId, // They were using ID as name
              newName: playlist.name,
              tracksUpdated,
            });
            console.log(`✓ ${playlist.name}: Updated ${tracksUpdated} tracks`);
          }
        } catch (error: any) {
          console.error(`Failed to backfill ${playlist.name}:`, error.message);
        }
      }
      
      console.log(`Backfill complete: ${updatedCount} tracks updated across ${results.length} playlists`);
      
      res.json({ 
        success: true, 
        updated: updatedCount,
        playlistsProcessed: trackedPlaylists.length,
        playlistsWithUpdates: results.length,
        results 
      });
    } catch (error) {
      console.error("Error backfilling track playlist names:", error);
      res.status(500).json({ error: "Failed to backfill track playlist names" });
    }
  });

  app.post("/api/scrape-playlist", async (req, res) => {
    try {
      const { playlistUrl, playlistName } = req.body;
      
      if (!playlistUrl) {
        return res.status(400).json({ error: "Playlist URL is required" });
      }
      
      console.log(`Starting scrape for playlist: ${playlistUrl}`);
      
      const extractPlaylistId = (url: string): string | null => {
        const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
      };
      
      const playlistId = extractPlaylistId(playlistUrl);
      if (!playlistId) {
        return res.status(400).json({ error: "Invalid Spotify playlist URL" });
      }
      
      const result = await scrapeSpotifyPlaylist(playlistUrl);
      
      if (!result.success || !result.tracks) {
        return res.status(500).json({ 
          error: result.error || "Failed to scrape playlist" 
        });
      }
      
      const today = new Date().toISOString().split('T')[0];
      const finalPlaylistName = playlistName || result.playlistName || "Unknown Playlist";
      
      const scrapedTracks: InsertPlaylistSnapshot[] = result.tracks.map(track => {
        const score = calculateUnsignedScore({
          playlistName: finalPlaylistName,
          label: null,
          publisher: null,
          writer: null,
        });
        
        return {
          week: today,
          playlistName: finalPlaylistName,
          playlistId: playlistId,
          trackName: track.trackName,
          artistName: track.artistName,
          spotifyUrl: track.spotifyUrl,
          isrc: null,
          label: null,
          unsignedScore: score,
          addedAt: new Date(),
          dataSource: "scraped",
        };
      });
      
      if (scrapedTracks.length > 0) {
        await storage.insertTracks(scrapedTracks);
        console.log(`Successfully saved ${scrapedTracks.length} scraped tracks`);
      }
      
      // Update playlist metadata if curator/followers available
      if (result.curator || result.followers !== null) {
        const existingPlaylist = await storage.getTrackedPlaylistBySpotifyId(playlistId);
        if (existingPlaylist) {
          await storage.updateTrackedPlaylistMetadata(existingPlaylist.id, {
            curator: result.curator || null,
            followers: result.followers !== undefined ? result.followers : null,
            totalTracks: scrapedTracks.length
          });
          console.log(`Updated playlist metadata: curator="${result.curator}", followers=${result.followers}`);
        }
      }
      
      res.json({
        success: true,
        playlistName: finalPlaylistName,
        tracksAdded: scrapedTracks.length,
        week: today,
      });
      
    } catch (error: any) {
      console.error("Error in scrape endpoint:", error);
      res.status(500).json({ 
        error: error.message || "Failed to scrape playlist" 
      });
    }
  });

  app.get("/api/data/counts", async (req, res) => {
    try {
      const counts = await storage.getDataCounts();
      res.json(counts);
    } catch (error) {
      console.error("Error getting data counts:", error);
      res.status(500).json({ error: "Failed to get data counts" });
    }
  });

  app.delete("/api/data/all", async (req, res) => {
    try {
      await storage.deleteAllData();
      
      invalidateMetricsCache();
      await flushMetricsUpdate();
      
      res.json({ success: true, message: "All data deleted successfully" });
    } catch (error) {
      console.error("Error deleting all data:", error);
      res.status(500).json({ error: "Failed to delete all data" });
    }
  });

  app.delete("/api/playlists/:playlistId/cascade", async (req, res) => {
    try {
      const { playlistId } = req.params;
      const { deleteSongwriters } = req.body;
      
      const result = await storage.deletePlaylistCascade(playlistId, { 
        deleteSongwriters: deleteSongwriters === true 
      });
      
      invalidateMetricsCache();
      await flushMetricsUpdate();
      
      res.json({
        success: true,
        tracksDeleted: result.tracksDeleted,
        songwritersDeleted: result.songwritersDeleted,
        message: `Deleted ${result.tracksDeleted} tracks${result.songwritersDeleted > 0 ? ` and ${result.songwritersDeleted} songwriters` : ''}`
      });
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
