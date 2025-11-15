import { db } from "../db";
import { playlistSnapshots } from "@shared/schema";
import { eq, or, sql } from "drizzle-orm";
import { getUncachableSpotifyClient } from "../spotify";

async function backfillMissingArtists() {
  console.log("🔍 Starting artist backfill process...");

  // Find all tracks with missing artist names
  const tracksWithMissingArtists = await db
    .select({
      id: playlistSnapshots.id,
      trackName: playlistSnapshots.trackName,
      spotifyTrackId: playlistSnapshots.spotifyTrackId,
    })
    .from(playlistSnapshots)
    .where(
      or(
        eq(playlistSnapshots.artistName, ""),
        sql`${playlistSnapshots.artistName} IS NULL`
      )
    );

  console.log(`📊 Found ${tracksWithMissingArtists.length} tracks with missing artist names`);

  if (tracksWithMissingArtists.length === 0) {
    console.log("✅ No tracks need backfilling!");
    return;
  }

  // Get Spotify client
  const spotify = await getUncachableSpotifyClient();

  // Process in batches of 50 (Spotify API limit)
  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < tracksWithMissingArtists.length; i += batchSize) {
    const batch = tracksWithMissingArtists.slice(i, i + batchSize);
    const trackIds = batch.map(t => t.spotifyTrackId).filter(Boolean);

    if (trackIds.length === 0) {
      console.log(`⚠️  Skipping batch ${i / batchSize + 1} - no valid track IDs`);
      continue;
    }

    console.log(`\n📦 Processing batch ${i / batchSize + 1}/${Math.ceil(tracksWithMissingArtists.length / batchSize)} (${trackIds.length} tracks)...`);

    try {
      // Fetch track data from Spotify
      const rawResponse = await spotify.tracks.get(trackIds);
      
      // Handle different response formats from Spotify API
      const tracks = Array.isArray(rawResponse) 
        ? rawResponse 
        : (rawResponse as any).tracks ?? [rawResponse];

      // Update each track with artist information
      for (const track of tracks) {
        if (!track) continue;

        const artistName = track.artists.map((a: any) => a.name).join(", ");
        const dbTrack = batch.find(t => t.spotifyTrackId === track.id);

        if (!dbTrack) continue;

        try {
          await db
            .update(playlistSnapshots)
            .set({ artistName })
            .where(eq(playlistSnapshots.id, dbTrack.id));

          console.log(`  ✅ Updated: "${dbTrack.trackName}" → "${artistName}"`);
          successCount++;
        } catch (updateError) {
          console.error(`  ❌ Failed to update ${dbTrack.trackName}:`, updateError);
          errorCount++;
        }
      }

      // Rate limiting - wait between batches
      if (i + batchSize < tracksWithMissingArtists.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (apiError: any) {
      console.error(`❌ API error for batch:`, apiError.message);
      errorCount += batch.length;
      
      // If rate limited, wait longer
      if (apiError.status === 429) {
        console.log("⏳ Rate limited - waiting 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Backfill Complete!");
  console.log("=".repeat(60));
  console.log(`✅ Successfully updated: ${successCount} tracks`);
  console.log(`❌ Errors: ${errorCount} tracks`);
  console.log(`📈 Success rate: ${((successCount / tracksWithMissingArtists.length) * 100).toFixed(1)}%`);
  console.log("=".repeat(60));
}

// Run the backfill
backfillMissingArtists()
  .then(() => {
    console.log("\n✨ Backfill process finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Backfill process failed:", error);
    process.exit(1);
  });
