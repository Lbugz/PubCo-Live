import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableSpotifyClient, getAuthUrl, exchangeCodeForToken, isAuthenticated, searchTrackByNameAndArtist } from "./spotify";
import { calculateUnsignedScore } from "./scoring";
import { searchByISRC } from "./musicbrainz";
import { generateAIInsights } from "./ai-insights";
import { playlists, type InsertPlaylistSnapshot, type PlaylistSnapshot, insertTagSchema, insertTrackedPlaylistSchema } from "@shared/schema";
import { scrapeSpotifyPlaylist, scrapeTrackCredits } from "./scraper";
import { fetchEditorialTracksViaNetwork } from "./scrapers/spotifyEditorialNetwork";
import { harvestVirtualizedRows } from "./scrapers/spotifyEditorialDom";
import { broadcastEnrichmentUpdate } from "./websocket";

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
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
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
          <body>
            <h1>✅ Spotify Authorization Successful!</h1>
            <p>You can now close this window and return to the application.</p>
            <script>
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for token:", error);
      res.status(500).send("Failed to authorize with Spotify");
    }
  });

  app.get("/api/spotify/status", (req, res) => {
    res.json({ authenticated: isAuthenticated() });
  });

  app.get("/api/spotify/playlist/:playlistId", async (req, res) => {
    try {
      if (!isAuthenticated()) {
        return res.status(401).json({ error: "Not authenticated. Please authorize Spotify first." });
      }
      
      const spotify = await getUncachableSpotifyClient();
      
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

  app.get("/api/tracked-playlists", async (req, res) => {
    try {
      const playlists = await storage.getTrackedPlaylists();
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching tracked playlists:", error);
      res.status(500).json({ error: "Failed to fetch tracked playlists" });
    }
  });

  app.post("/api/tracked-playlists", async (req, res) => {
    try {
      const validatedPlaylist = insertTrackedPlaylistSchema.parse(req.body);
      
      // Fetch playlist metadata from Spotify if authenticated
      let totalTracks = null;
      let isEditorial = 0;
      let fetchMethod = 'api';
      let curator = null;
      let followers = null;
      let source = 'spotify';
      
      if (isAuthenticated()) {
        try {
          const spotify = await getUncachableSpotifyClient();
          const playlistData = await spotify.playlists.getPlaylist(validatedPlaylist.playlistId, "from_token" as any);
          
          totalTracks = playlistData.tracks?.total || null;
          curator = playlistData.owner?.display_name || null;
          followers = playlistData.followers?.total || null;
          
          // Determine if it's editorial based on owner
          // Editorial playlists are typically owned by Spotify (owner.id === "spotify")
          if (playlistData.owner?.id === 'spotify' || playlistData.owner?.display_name === 'Spotify') {
            isEditorial = 1;
            fetchMethod = 'scraping'; // Editorial playlists are better scraped
          }
          
          console.log(`Playlist "${playlistData.name}": totalTracks=${totalTracks}, isEditorial=${isEditorial}, owner=${playlistData.owner?.display_name}, followers=${followers}`);
        } catch (error: any) {
          // If API call fails (404), likely editorial playlist
          if (error?.message?.includes('404')) {
            console.log(`Playlist ${validatedPlaylist.playlistId} returned 404, marking as editorial`);
            isEditorial = 1;
            fetchMethod = 'scraping';
          }
        }
      }
      
      const playlist = await storage.addTrackedPlaylist({
        ...validatedPlaylist,
        totalTracks,
        isEditorial,
        fetchMethod,
        curator,
        source,
        followers,
        isComplete: 0,
        lastFetchCount: 0,
      });
      res.json(playlist);
    } catch (error) {
      console.error("Error adding tracked playlist:", error);
      res.status(500).json({ error: "Failed to add tracked playlist" });
    }
  });

  app.post("/api/tracked-playlists/:id/refresh-metadata", async (req, res) => {
    try {
      const playlist = await storage.getTrackedPlaylists();
      const targetPlaylist = playlist.find(p => p.id === req.params.id);
      
      if (!targetPlaylist) {
        return res.status(404).json({ error: "Playlist not found" });
      }
      
      if (!isAuthenticated()) {
        return res.status(401).json({ error: "Spotify authentication required" });
      }
      
      const spotify = await getUncachableSpotifyClient();
      const playlistData = await spotify.playlists.getPlaylist(targetPlaylist.playlistId, "from_token" as any);
      
      const curator = playlistData.owner?.display_name || null;
      const followers = playlistData.followers?.total || null;
      const totalTracks = playlistData.tracks?.total || null;
      
      await storage.updateTrackedPlaylistMetadata(req.params.id, {
        curator,
        followers,
        totalTracks,
      });
      
      console.log(`Refreshed metadata for "${targetPlaylist.name}": curator="${curator}", followers=${followers}, totalTracks=${totalTracks}`);
      
      res.json({ 
        success: true, 
        curator,
        followers,
        totalTracks,
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
      
      for (const track of unenrichedTracks) {
        // Step 1: If track has no ISRC (scraped), try Spotify search first
        if (!track.isrc && isAuthenticated()) {
          try {
            console.log(`Track ${track.id} has no ISRC, searching Spotify...`);
            const spotifyData = await searchTrackByNameAndArtist(track.trackName, track.artistName);
            
            if (spotifyData && spotifyData.isrc) {
              await storage.updateTrackMetadata(track.id, {
                isrc: spotifyData.isrc,
                label: spotifyData.label || track.label || undefined,
                spotifyUrl: spotifyData.spotifyUrl || track.spotifyUrl,
              });
              console.log(`✅ Found ISRC via Spotify: ${spotifyData.isrc}`);
              spotifyEnrichedCount++;
              
              // Now use that ISRC to get publisher/songwriter from MusicBrainz
              track.isrc = spotifyData.isrc;
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Error searching Spotify for track ${track.id}:`, error);
          }
        }
        
        // Step 2: If we now have an ISRC, get publisher/songwriter from MusicBrainz
        if (track.isrc) {
          try {
            const metadata = await searchByISRC(track.isrc);
            
            if (metadata.publisher || metadata.songwriter) {
              await storage.updateTrackMetadata(track.id, {
                publisher: metadata.publisher,
                songwriter: metadata.songwriter,
                enrichedAt: new Date(),
              });
              enrichedCount++;
            } else {
              await storage.updateTrackMetadata(track.id, {
                enrichedAt: new Date(),
              });
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Error enriching track ${track.id}:`, error);
          }
        } else {
          // Track has no ISRC after trying Spotify search
          skippedNoIsrc++;
        }
      }
      
      res.json({ 
        success: true, 
        enrichedCount,
        spotifyEnrichedCount,
        skippedNoIsrc,
        totalProcessed: unenrichedTracks.length,
        message: spotifyEnrichedCount > 0 
          ? `Found ${spotifyEnrichedCount} ISRC codes via Spotify, enriched ${enrichedCount} tracks with MusicBrainz`
          : `Enriched ${enrichedCount} tracks with MusicBrainz`
      });
    } catch (error) {
      console.error("Error enriching metadata:", error);
      res.status(500).json({ error: "Failed to enrich metadata" });
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
          
          const creditsResult = await scrapeTrackCredits(track.spotifyUrl);
          
          if (creditsResult.success && creditsResult.credits) {
            const { writers, composers, labels, publishers } = creditsResult.credits;
            
            // Combine writers and composers into songwriter field
            const songwriters = [...writers, ...composers].filter(Boolean);
            const songwriterString = songwriters.length > 0 ? songwriters.join(", ") : undefined;
            const publisherString = publishers.length > 0 ? publishers.join(", ") : undefined;
            const labelString = labels.length > 0 ? labels.join(", ") : undefined;
            
            await storage.updateTrackMetadata(track.id, {
              songwriter: songwriterString,
              publisher: publisherString,
              label: labelString,
              enrichedAt: new Date(),
            });
            
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
            if (!isEditorial && isAuthenticated()) {
              try {
                const spotify = await getUncachableSpotifyClient();
                const playlistData = await spotify.playlists.getPlaylist(playlistId, "from_token" as any);
                totalTracks = playlistData.tracks?.total || null;
                console.log(`Bulk import: Fetched totalTracks=${totalTracks} for playlist ${title}`);
              } catch (error) {
                console.log(`Could not fetch totalTracks for ${title}, will set later`);
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
          
          // For editorial playlists, skip API and go straight to scraping
          // For non-editorial playlists, try API first
          let fetchMethod = 'api';
          
          try {
            if (playlist.isEditorial === 1) {
              // Editorial playlist - skip OAuth/API, use scraping directly
              console.log(`Editorial playlist detected: ${playlist.name}. Skipping API, using scraper microservice...`);
              throw new Error('Editorial playlist - using scraper');
            }
            
            if (!spotify) {
              throw new Error('Spotify client not available (not authenticated)');
            }
            console.log(`Attempting API fetch for: ${playlist.name} (isEditorial=${playlist.isEditorial})`);
            const allPlaylistItems = await fetchAllPlaylistTracks(spotify, playlist.playlistId);
            
            // Get playlist metadata for total track count
            const playlistData = await spotify.playlists.getPlaylist(playlist.playlistId, "from_token" as any);
            if (!playlistTotalTracks && playlistData.tracks?.total) {
              playlistTotalTracks = playlistData.tracks.total;
            }
            
            if (!allPlaylistItems || allPlaylistItems.length === 0) {
              throw new Error('No tracks returned from API');
            }
            
            console.log(`API fetch successful: ${allPlaylistItems.length} tracks`);
            
            for (const item of allPlaylistItems) {
              if (!item.track || item.track.type !== "track") continue;
              
              const track = item.track;
              const trackKey = `${playlist.playlistId}_${track.external_urls.spotify}`;
              
              if (existingTrackKeys.has(trackKey)) {
                skippedCount++;
                continue;
              }
              
              const label = track.album?.label || null;
              
              const score = calculateUnsignedScore({
                playlistName: playlist.name,
                label: label,
                publisher: null,
                writer: null,
              });
              
              const newTrack = {
                week: today,
                playlistName: playlist.name,
                playlistId: playlist.playlistId,
                trackName: track.name,
                artistName: track.artists.map((a: any) => a.name).join(", "),
                spotifyUrl: track.external_urls.spotify,
                isrc: track.external_ids?.isrc || null,
                label: label,
                unsignedScore: score,
                addedAt: new Date(item.added_at),
                dataSource: "api",
              };
              
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            playlistTracks = allPlaylistItems;
          } catch (apiError: any) {
            // API failed (likely 404 for editorial playlist), call scraper microservice
            console.log(`API fetch failed for ${playlist.name}: ${apiError.message}. Calling scraper microservice...`);
            
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
                  console.log(`✅ Scraper API success: ${scraperData.tracks.length} tracks`);
                  fetchMethod = scraperData.method || 'microservice-scraper';
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
                console.log(`Local network capture successful: ${networkTrackCount} tracks`);
                fetchMethod = 'network-capture';
                capturedTracks = networkResult.tracks ?? [];
                
                // Update playlist metadata (curator, followers) if available
                if (networkResult.curator || networkResult.followers !== null) {
                  await storage.updateTrackedPlaylistMetadata(playlist.id, {
                    curator: networkResult.curator || null,
                    followers: networkResult.followers !== undefined ? networkResult.followers : null,
                    totalTracks: networkTrackCount
                  });
                  console.log(`Updated playlist metadata: curator="${networkResult.curator}", followers=${networkResult.followers}`);
                }
              } else {
                const networkErrorDetails = networkResult.error ? ` Error: ${networkResult.error}.` : '';
                console.log(`Local network capture insufficient (${networkTrackCount} tracks).${networkErrorDetails} Trying DOM fallback...`);
                const domResult = await harvestVirtualizedRows(playlist.spotifyUrl);
                const domTrackCount = domResult.tracks?.length ?? 0;

                if (domResult.success && domTrackCount > networkTrackCount) {
                  console.log(`DOM fallback successful: ${domTrackCount} tracks`);
                  fetchMethod = 'dom-capture';
                  capturedTracks = domResult.tracks ?? [];
                } else if (networkResult.success && networkTrackCount > 0) {
                  console.log(`Using local network capture results: ${networkTrackCount} tracks`);
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
            for (const capturedTrack of capturedTracks) {
              const trackUrl = capturedTrack.spotifyUrl || `https://open.spotify.com/track/${capturedTrack.trackId}`;
              const trackKey = `${playlist.playlistId}_${trackUrl}`;
              
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
              
              const artistName = Array.isArray(capturedTrack.artists) 
                ? capturedTrack.artists.join(", ") 
                : capturedTrack.artists || "Unknown";
              
              const newTrack = {
                week: today,
                playlistName: playlist.name,
                playlistId: playlist.playlistId,
                trackName: capturedTrack.name,
                artistName: artistName,
                spotifyUrl: trackUrl,
                isrc: capturedTrack.isrc || null,
                label: null,
                unsignedScore: score,
                addedAt: capturedTrack.addedAt ? new Date(capturedTrack.addedAt) : new Date(),
                dataSource: fetchMethod,
              };
              
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            playlistTracks = capturedTracks;
          }
          
          // Update completeness status
          const fetchCount = playlistTracks.length;
          await storage.updatePlaylistCompleteness(
            playlist.playlistId, 
            fetchCount, 
            playlistTotalTracks, 
            new Date()
          );
          
          // Update fetch method used for this playlist
          await storage.updatePlaylistMetadata(playlist.id, { fetchMethod });
          
          const isComplete = playlistTotalTracks !== null && fetchCount >= playlistTotalTracks;
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
        await storage.insertTracks(allTracks);
        console.log(`Successfully saved ${allTracks.length} new tracks for ${today}`);
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

  const httpServer = createServer(app);

  return httpServer;
}
