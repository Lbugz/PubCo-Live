// Add this endpoint AFTER the existing /api/enrich-credits endpoint (around line 665)

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

      let enrichedCount = 0;
      let failedCount = 0;
      const failedTrackIds: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`\nProcessing batch ${i + 1}/${batches.length} (${batch.length} tracks)...`);

        try {
          const trackUrls = batch.map(t => t.spotifyUrl);

          const response = await fetch(`${scraperApiUrl}/enrich-tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackUrls })
          });

          if (!response.ok) {
            throw new Error(`Railway API error: ${response.statusText}`);
          }

          const data = await response.json();

          // Update database with results
          for (const result of data.results) {
            const track = batch.find(t => t.spotifyUrl === result.trackUrl);
            if (!track) continue;

            if (result.success && result.credits) {
              const songwriters = result.credits.songwriters?.length > 0 
                ? result.credits.songwriters.join(', ') 
                : null;
              const publishers = result.credits.publishers?.length > 0 
                ? result.credits.publishers.join(', ') 
                : null;

              await storage.updateTrackMetadata(track.id, {
                songwriter: songwriters,
                publisher: publishers,
                enrichedAt: new Date(),
                enrichmentStatus: 'completed'
              });

              enrichedCount++;
              console.log(`✅ Success: ${track.trackName} - Writers: ${songwriters || 'none'}`);
            } else {
              await storage.updateTrackMetadata(track.id, {
                enrichmentStatus: 'failed'
              });
              failedCount++;
              failedTrackIds.push(track.id);
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
