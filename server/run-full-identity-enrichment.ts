/**
 * Full Identity Enrichment Runner
 * 
 * Runs identity enrichment on ALL tracks to populate track_songwriters table
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { enrichAllTrackSongwriters } from "./services/songwriterIdentityEnrichment";
import { syncContactEnrichmentFlags } from "./services/contactEnrichmentSync";

async function runFullEnrichment() {
  console.log("\n=======================================================");
  console.log("FULL IDENTITY ENRICHMENT - ALL TRACKS");
  console.log("=======================================================\n");

  console.log("📊 INITIAL STATE:");
  const initialStats = await db.execute<{
    total_tracks: number;
    tracks_with_credits: number;
    tracks_needing_enrichment: number;
  }>(sql`
    SELECT 
      COUNT(*) as total_tracks,
      COUNT(CASE WHEN songwriter IS NOT NULL AND songwriter != '-' THEN 1 END) as tracks_with_credits,
      COUNT(CASE WHEN songwriter IS NOT NULL AND songwriter != '-' THEN 1 END) 
        - COUNT(DISTINCT ts.track_id) as tracks_needing_enrichment
    FROM playlist_snapshots ps
    LEFT JOIN track_songwriters ts ON ts.track_id = ps.id
  `);
  
  const initial = initialStats.rows[0];
  console.log(`  Total tracks: ${initial.total_tracks}`);
  console.log(`  Tracks with credits: ${initial.tracks_with_credits}`);
  console.log(`  Tracks needing enrichment: ${initial.tracks_needing_enrichment}\n`);

  console.log("🚀 RUNNING FULL ENRICHMENT...\n");
  console.log("  This will process all tracks in batches of 100.");
  console.log("  Estimated time: 2-5 minutes\n");
  
  const startTime = Date.now();
  
  // Run enrichment with no limit (processes all tracks)
  const result = await enrichAllTrackSongwriters();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log("\n📈 ENRICHMENT COMPLETE!");
  console.log(`  Duration: ${duration}s`);
  console.log(`  Tracks processed: ${result.totalTracks}`);
  console.log(`  Tracks enriched: ${result.enrichedTracks}`);
  console.log(`  Total credits: ${result.totalCredits}`);
  console.log(`  Credits matched: ${result.totalMatched}`);
  console.log(`  Match rate: ${result.totalCredits > 0 ? ((result.totalMatched / result.totalCredits) * 100).toFixed(1) : 0}%\n`);

  console.log("📊 FINAL STATE:");
  const finalStats = await db.execute<{
    total_tracks: number;
    tracks_with_credits: number;
    tracks_with_links: number;
    tracks_without_links: number;
    total_links: number;
  }>(sql`
    SELECT 
      COUNT(DISTINCT ps.id) as total_tracks,
      COUNT(DISTINCT CASE WHEN ps.songwriter IS NOT NULL AND ps.songwriter != '-' THEN ps.id END) as tracks_with_credits,
      COUNT(DISTINCT ts.track_id) as tracks_with_links,
      COUNT(DISTINCT CASE WHEN ps.songwriter IS NOT NULL AND ps.songwriter != '-' THEN ps.id END) 
        - COUNT(DISTINCT ts.track_id) as tracks_without_links,
      COUNT(ts.id) as total_links
    FROM playlist_snapshots ps
    LEFT JOIN track_songwriters ts ON ts.track_id = ps.id
  `);
  
  const final = finalStats.rows[0];
  console.log(`  Total tracks: ${final.total_tracks}`);
  console.log(`  Tracks with credits: ${final.tracks_with_credits}`);
  console.log(`  Tracks with ID links: ${final.tracks_with_links}`);
  console.log(`  Tracks without links: ${final.tracks_without_links}`);
  console.log(`  Total songwriter links created: ${final.total_links}\n`);

  console.log("🔍 CONFIDENCE SOURCE BREAKDOWN:");
  const sourceStats = await db.execute<{
    confidence_source: string;
    link_count: number;
  }>(sql`
    SELECT 
      confidence_source,
      COUNT(*) as link_count
    FROM track_songwriters
    GROUP BY confidence_source
    ORDER BY link_count DESC
  `);

  for (const stat of sourceStats.rows) {
    console.log(`  ${stat.confidence_source}: ${stat.link_count} links`);
  }

  console.log("\n🔗 SYNCING COLLABORATION COUNTS FOR ALL CONTACTS...\n");
  
  // Get all contacts with songwriter_id
  const contacts = await db.execute<{
    name: string;
  }>(sql`
    SELECT DISTINCT sp.name
    FROM contacts c
    JOIN songwriter_profiles sp ON sp.id = c.songwriter_id
  `);

  console.log(`  Found ${contacts.rows.length} contacts to sync...\n`);
  
  let syncedCount = 0;
  for (const contact of contacts.rows) {
    await syncContactEnrichmentFlags(contact.name);
    syncedCount++;
    if (syncedCount % 50 === 0) {
      console.log(`  Synced ${syncedCount}/${contacts.rows.length} contacts...`);
    }
  }

  console.log(`\n  ✓ Synced all ${syncedCount} contacts\n`);

  console.log("📊 COLLABORATION COUNT DISTRIBUTION:");
  const collabDistribution = await db.execute<{
    collab_range: string;
    count: number;
  }>(sql`
    SELECT 
      CASE 
        WHEN collaboration_count = 0 THEN 'Solo Writers (0 collabs)'
        WHEN collaboration_count BETWEEN 1 AND 3 THEN 'Light Collaborators (1-3)'
        WHEN collaboration_count BETWEEN 4 AND 10 THEN 'Active Collaborators (4-10)'
        ELSE 'Heavy Collaborators (10+)'
      END as collab_range,
      COUNT(*) as count
    FROM contacts
    WHERE songwriter_id IS NOT NULL
    GROUP BY collab_range
    ORDER BY MIN(collaboration_count)
  `);

  for (const dist of collabDistribution.rows) {
    console.log(`  ${dist.collab_range}: ${dist.count} songwriters`);
  }

  console.log("\n📈 TOP COLLABORATORS:");
  const topCollaborators = await db.execute<{
    name: string;
    collaboration_count: number;
  }>(sql`
    SELECT sp.name, c.collaboration_count
    FROM contacts c
    JOIN songwriter_profiles sp ON sp.id = c.songwriter_id
    ORDER BY c.collaboration_count DESC
    LIMIT 10
  `);

  for (const collab of topCollaborators.rows) {
    console.log(`  ${collab.name}: ${collab.collaboration_count} co-writers`);
  }

  console.log("\n=======================================================");
  console.log("✅ FULL ENRICHMENT COMPLETE");
  console.log("=======================================================\n");

  process.exit(0);
}

runFullEnrichment().catch((error) => {
  console.error("❌ Enrichment failed:", error);
  process.exit(1);
});
