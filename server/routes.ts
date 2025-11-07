import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableSpotifyClient, getAuthUrl, exchangeCodeForToken, isAuthenticated, searchTrackByNameAndArtist } from "./spotify";
import { calculateUnsignedScore } from "./scoring";
import { searchByISRC } from "./musicbrainz";
import { generateAIInsights } from "./ai-insights";
import { playlists, type InsertPlaylistSnapshot, insertTagSchema, insertTrackedPlaylistSchema } from "@shared/schema";
import { scrapeSpotifyPlaylist, scrapeTrackCredits } from "./scraper";

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
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating track contact:", error);
      res.status(500).json({ error: "Failed to update contact information" });
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
      
      if (isAuthenticated()) {
        try {
          const spotify = await getUncachableSpotifyClient();
          const playlistData = await spotify.playlists.getPlaylist(validatedPlaylist.playlistId, "from_token" as any);
          
          totalTracks = playlistData.tracks?.total || null;
          
          // Determine if it's editorial based on owner
          // Editorial playlists are typically owned by Spotify (owner.id === "spotify")
          if (playlistData.owner?.id === 'spotify' || playlistData.owner?.display_name === 'Spotify') {
            isEditorial = 1;
            fetchMethod = 'scraping'; // Editorial playlists are better scraped
          }
          
          console.log(`Playlist "${playlistData.name}": totalTracks=${totalTracks}, isEditorial=${isEditorial}, owner=${playlistData.owner?.display_name}`);
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
        isComplete: 0,
        lastFetchCount: 0,
      });
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
          message: "No tracks need MusicBrainz enrichment"
        });
      }

      let enrichedCount = 0;
      let spotifyEnrichedCount = 0;
      
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
        }
      }
      
      res.json({ 
        success: true, 
        enrichedCount,
        spotifyEnrichedCount,
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
      
      // Get tracks that don't have songwriter/publisher data yet
      let tracks = await storage.getUnenrichedTracks(limit);
      
      // Filter based on mode
      if (mode === 'track' && trackId) {
        tracks = tracks.filter(t => t.id === trackId);
      } else if (mode === 'playlist' && playlistName) {
        tracks = tracks.filter(t => t.playlistName === playlistName);
      }
      
      if (tracks.length === 0) {
        return res.json({ 
          success: true, 
          enrichedCount: 0,
          failedCount: 0,
          totalProcessed: 0,
          message: "No tracks need Spotify Credits enrichment"
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
            const { writers, composers, publishers } = creditsResult.credits;
            
            // Combine writers and composers into songwriter field
            const songwriters = [...writers, ...composers].filter(Boolean);
            const songwriterString = songwriters.length > 0 ? songwriters.join(", ") : undefined;
            const publisherString = publishers.length > 0 ? publishers.join(", ") : undefined;
            
            await storage.updateTrackMetadata(track.id, {
              songwriter: songwriterString,
              publisher: publisherString,
              enrichedAt: new Date(),
            });
            
            console.log(`✅ Enriched: ${track.trackName} - ${songwriters.length} songwriters, ${publishers.length} publishers`);
            enrichedCount++;
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
      const spotify = await getUncachableSpotifyClient();
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
        trackedPlaylists = allTrackedPlaylists.filter(p => p.id === playlistId);
      }
      
      if (trackedPlaylists.length === 0) {
        return res.status(400).json({ 
          error: `No playlists found for mode: ${mode}` 
        });
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
          
          // Route by fetch method
          if (playlist.isEditorial === 1 || playlist.fetchMethod === 'scraping') {
            // Use web scraping for editorial playlists
            console.log(`Using web scraping method for ${playlist.name}`);
            const scrapeResult = await scrapeSpotifyPlaylist(playlist.spotifyUrl);
            
            if (!scrapeResult.success || !scrapeResult.tracks) {
              console.error(`Failed to scrape ${playlist.name}: ${scrapeResult.error}`);
              continue;
            }
            
            // Convert scraped tracks to playlist snapshot format
            for (const scrapedTrack of scrapeResult.tracks) {
              const trackKey = `${playlist.playlistId}_${scrapedTrack.spotifyUrl}`;
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
              
              const newTrack = {
                week: today,
                playlistName: playlist.name,
                playlistId: playlist.playlistId,
                trackName: scrapedTrack.trackName,
                artistName: scrapedTrack.artistName,
                spotifyUrl: scrapedTrack.spotifyUrl,
                isrc: null,
                label: null,
                unsignedScore: score,
                addedAt: new Date(),
                dataSource: "scraping",
              };
              
              allTracks.push(newTrack);
              existingTrackKeys.add(trackKey);
            }
            
            playlistTracks = scrapeResult.tracks;
          } else {
            // Use Spotify API for non-editorial playlists
            console.log(`Using Spotify API method for ${playlist.name}`);
            const playlistData = await spotify.playlists.getPlaylist(playlist.playlistId, "from_token" as any);
            
            if (!playlistTotalTracks && playlistData.tracks?.total) {
              playlistTotalTracks = playlistData.tracks.total;
            }
            
            if (!playlistData.tracks?.items) {
              console.warn(`No tracks found for playlist: ${playlist.name}`);
              continue;
            }
            
            for (const item of playlistData.tracks.items) {
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
                artistName: track.artists.map(a => a.name).join(", "),
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
            
            playlistTracks = playlistData.tracks.items;
          }
          
          // Update completeness status
          const fetchCount = playlistTracks.length;
          await storage.updatePlaylistCompleteness(
            playlist.playlistId, 
            fetchCount, 
            playlistTotalTracks, 
            new Date()
          );
          
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
