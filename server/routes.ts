import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableSpotifyClient, getAuthUrl, exchangeCodeForToken, isAuthenticated } from "./spotify";
import { calculateUnsignedScore } from "./scoring";
import { searchByISRC } from "./musicbrainz";
import { playlists, type InsertPlaylistSnapshot, insertTagSchema, insertTrackedPlaylistSchema } from "@shared/schema";

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
      const spotify = await getUncachableSpotifyClient();
      const playlistData = await spotify.playlists.getPlaylist(req.params.playlistId);
      res.json({ name: playlistData.name, id: playlistData.id });
    } catch (error) {
      console.error("Error fetching playlist:", error);
      res.status(500).json({ error: "Failed to fetch playlist from Spotify" });
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
      
      let tracks;
      if (tagId) {
        tracks = await storage.getTracksByTag(tagId);
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
        const headers = ["Track Name", "Artist", "Playlist", "Label", "ISRC", "Unsigned Score", "Spotify URL"];
        const rows = tracks.map(t => [
          t.trackName,
          t.artistName,
          t.playlistName,
          t.label || "",
          t.isrc || "",
          t.unsignedScore.toString(),
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
      const playlist = await storage.addTrackedPlaylist(validatedPlaylist);
      res.json(playlist);
    } catch (error) {
      console.error("Error adding tracked playlist:", error);
      res.status(500).json({ error: "Failed to add tracked playlist" });
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
      const unenrichedTracks = await storage.getUnenrichedTracks(50);
      
      if (unenrichedTracks.length === 0) {
        return res.json({ 
          success: true, 
          enrichedCount: 0,
          message: "No tracks need enrichment"
        });
      }

      let enrichedCount = 0;
      
      for (const track of unenrichedTracks) {
        if (!track.isrc) continue;
        
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
        } catch (error) {
          console.error(`Error enriching track ${track.id}:`, error);
        }
      }
      
      res.json({ 
        success: true, 
        enrichedCount,
        totalProcessed: unenrichedTracks.length
      });
    } catch (error) {
      console.error("Error enriching metadata:", error);
      res.status(500).json({ error: "Failed to enrich metadata" });
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
          tracks: p.tracks.total 
        })),
        firstPlaylistTest: firstPlaylistTracks
      });
    } catch (error) {
      console.error("Error testing Spotify:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/fetch-playlists", async (req, res) => {
    try {
      const spotify = await getUncachableSpotifyClient();
      const today = new Date().toISOString().split('T')[0];
      
      const trackedPlaylists = await storage.getTrackedPlaylists();
      
      if (trackedPlaylists.length === 0) {
        return res.status(400).json({ 
          error: "No playlists are being tracked. Please add playlists to track first." 
        });
      }
      
      const allTracks: InsertPlaylistSnapshot[] = [];
      
      for (const playlist of trackedPlaylists) {
        try {
          console.log(`Fetching playlist: ${playlist.name}`);
          const playlistData = await spotify.playlists.getPlaylist(playlist.playlistId);
          
          if (!playlistData.tracks?.items) {
            console.warn(`No tracks found for playlist: ${playlist.name}`);
            continue;
          }
          
          for (const item of playlistData.tracks.items) {
            if (!item.track || item.track.type !== "track") continue;
            
            const track = item.track;
            const label = track.album?.label || null;
            
            const score = calculateUnsignedScore({
              playlistName: playlist.name,
              label: label,
              publisher: null,
              writer: null,
            });
            
            allTracks.push({
              week: today,
              playlistName: playlist.name,
              playlistId: playlist.playlistId,
              trackName: track.name,
              artistName: track.artists.map(a => a.name).join(", "),
              spotifyUrl: track.external_urls.spotify,
              isrc: track.external_ids?.isrc || null,
              label: label,
              unsignedScore: score,
              addedAt: new Date(item.added_at),
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching playlist ${playlist.name}:`, error);
        }
      }
      
      if (allTracks.length > 0) {
        await storage.deleteTracksByWeek(today);
        await storage.insertTracks(allTracks);
        console.log(`Successfully saved ${allTracks.length} tracks for ${today}`);
      }
      
      res.json({ 
        success: true, 
        tracksAdded: allTracks.length,
        week: today 
      });
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ error: "Failed to fetch playlists from Spotify" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
