/**
 * Test Script: Identity Enrichment
 * 
 * Runs identity enrichment on a small batch of tracks to verify accuracy
 */

import { db } from "./db";
import { playlistSnapshots, trackSongwriters, songwriterProfiles } from "@shared/schema";
import { sql } from "drizzle-orm";
import { enrichAllTrackSongwriters } from "./services/songwriterIdentityEnrichment";
import { syncContactEnrichmentFlags } from "./services/contactEnrichmentSync";

async function testIdentityEnrichment() {
  console.log("\n=======================================================");
  console.log("IDENTITY ENRICHMENT TEST - 20 TRACK SAMPLE");
  console.log("=======================================================\n");

  console.log("📊 BEFORE ENRICHMENT:");
  const beforeStats = await db.execute<{
    total_tracks: number;
    tracks_with_songwriter_links: number;
    tracks_without_links: number;
  }>(sql`
    SELECT 
      COUNT(*) as total_tracks,
      COUNT(DISTINCT ts.track_id) as tracks_with_songwriter_links,
      COUNT(*) - COUNT(DISTINCT ts.track_id) as tracks_without_links
    FROM playlist_snapshots ps
    LEFT JOIN track_songwriters ts ON ts.track_id = ps.id
    WHERE ps.songwriter IS NOT NULL AND ps.songwriter != '-'
  `);
  
  const before = beforeStats.rows[0];
  console.log(`  Total tracks with credits: ${before.total_tracks}`);
  console.log(`  Tracks with ID links: ${before.tracks_with_songwriter_links}`);
  console.log(`  Tracks needing enrichment: ${before.tracks_without_links}\n`);

  console.log("🔍 SAMPLE TRACKS TO ENRICH:");
  const sampleTracks = await db.execute<{
    id: string;
    track_name: string;
    songwriter: string;
  }>(sql`
    SELECT ps.id, ps.track_name, ps.songwriter
    FROM playlist_snapshots ps
    LEFT JOIN track_songwriters ts ON ts.track_id = ps.id
    WHERE ps.songwriter IS NOT NULL 
      AND ps.songwriter != '-'
      AND ts.id IS NULL
    LIMIT 5
  `);

  for (const track of sampleTracks.rows) {
    console.log(`  📝 "${track.track_name}"`);
    console.log(`     Credits: ${track.songwriter}\n`);
  }

  console.log("🚀 RUNNING ENRICHMENT (Batch size: 20)...\n");
  
  const result = await enrichAllTrackSongwriters(20);
  
  console.log("📈 ENRICHMENT RESULTS:");
  console.log(`  Tracks processed: ${result.totalTracks}`);
  console.log(`  Tracks enriched: ${result.enrichedTracks}`);
  console.log(`  Total credits: ${result.totalCredits}`);
  console.log(`  Credits matched: ${result.totalMatched}`);
  console.log(`  Match rate: ${result.totalCredits > 0 ? ((result.totalMatched / result.totalCredits) * 100).toFixed(1) : 0}%\n`);

  console.log("📊 AFTER ENRICHMENT:");
  const afterStats = await db.execute<{
    total_tracks: number;
    tracks_with_songwriter_links: number;
    tracks_without_links: number;
  }>(sql`
    SELECT 
      COUNT(*) as total_tracks,
      COUNT(DISTINCT ts.track_id) as tracks_with_songwriter_links,
      COUNT(*) - COUNT(DISTINCT ts.track_id) as tracks_without_links
    FROM playlist_snapshots ps
    LEFT JOIN track_songwriters ts ON ts.track_id = ps.id
    WHERE ps.songwriter IS NOT NULL AND ps.songwriter != '-'
  `);
  
  const after = afterStats.rows[0];
  console.log(`  Total tracks with credits: ${after.total_tracks}`);
  console.log(`  Tracks with ID links: ${after.tracks_with_songwriter_links}`);
  console.log(`  Tracks needing enrichment: ${after.tracks_without_links}\n`);

  console.log("🔗 SAMPLE ENRICHED LINKS:");
  const enrichedLinks = await db.execute<{
    track_name: string;
    songwriter_name: string;
    confidence_source: string;
    source_text: string;
  }>(sql`
    SELECT 
      ps.track_name,
      sp.name as songwriter_name,
      ts.confidence_source,
      ts.source_text
    FROM track_songwriters ts
    JOIN playlist_snapshots ps ON ps.id = ts.track_id
    JOIN songwriter_profiles sp ON sp.id = ts.songwriter_id
    ORDER BY ts.created_at DESC
    LIMIT 10
  `);

  for (const link of enrichedLinks.rows) {
    console.log(`  ✓ Track: "${link.track_name}"`);
    console.log(`    Songwriter: ${link.songwriter_name}`);
    console.log(`    Source: ${link.source_text} → ${link.confidence_source}\n`);
  }

  console.log("🧪 TESTING COLLABORATION COUNTS:");
  console.log("  Syncing enrichment flags for top 3 songwriters...\n");
  
  const topSongwriters = await db.execute<{
    name: string;
  }>(sql`
    SELECT DISTINCT sp.name
    FROM songwriter_profiles sp
    JOIN track_songwriters ts ON ts.songwriter_id = sp.id
    LIMIT 3
  `);

  for (const songwriter of topSongwriters.rows) {
    await syncContactEnrichmentFlags(songwriter.name);
  }

  const collabStats = await db.execute<{
    name: string;
    collaboration_count: number;
  }>(sql`
    SELECT sp.name, c.collaboration_count
    FROM contacts c
    JOIN songwriter_profiles sp ON sp.id = c.songwriter_id
    WHERE c.collaboration_count > 0
    ORDER BY c.collaboration_count DESC
    LIMIT 5
  `);

  console.log("  Top collaborators:");
  for (const stat of collabStats.rows) {
    console.log(`    ${stat.name}: ${stat.collaboration_count} co-writers`);
  }

  console.log("\n=======================================================");
  console.log("✅ TEST COMPLETE");
  console.log("=======================================================\n");

  process.exit(0);
}

testIdentityEnrichment().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
