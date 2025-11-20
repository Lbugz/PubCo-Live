#!/usr/bin/env tsx
import { db } from "../db";
import { sql } from "drizzle-orm";

interface DuplicateGroup {
  name: string;
  contacts: Array<{
    contactId: string;
    songwriterId: string;
    chartmetricId: string;
    totalStreams: number;
    totalTracks: number;
    score: number;
    stage: string;
    createdAt: Date;
  }>;
}

async function mergeDuplicateContacts(dryRun: boolean = false) {
  console.log("🔄 MERGE DUPLICATE CONTACTS");
  console.log("=".repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify database)'}\n`);

  try {
    // Find all duplicate contact names
    const duplicatesQuery = await db.execute(sql`
      SELECT 
        sp.name,
        COUNT(*) as contact_count,
        json_agg(
          json_build_object(
            'contactId', c.id,
            'songwriterId', sp.id,
            'chartmetricId', sp.chartmetric_id,
            'totalStreams', COALESCE(c.total_streams, 0),
            'totalTracks', COALESCE(c.total_tracks, 0),
            'score', COALESCE(c.unsigned_score, 0),
            'stage', c.stage,
            'createdAt', c.created_at
          ) ORDER BY COALESCE(c.total_streams, 0) DESC, c.created_at ASC
        ) as contacts
      FROM songwriter_profiles sp
      JOIN contacts c ON c.songwriter_id = sp.id
      GROUP BY sp.name
      HAVING COUNT(*) > 1
      ORDER BY sp.name
    `);

    const duplicateGroups: DuplicateGroup[] = (duplicatesQuery.rows as any[]).map(row => ({
      name: row.name,
      contacts: row.contacts,
    }));

    if (duplicateGroups.length === 0) {
      console.log("✅ No duplicate contacts found!\n");
      return { merged: 0, deleted: 0 };
    }

    console.log(`📊 Found ${duplicateGroups.length} duplicate name groups\n`);

    let totalMerged = 0;
    let totalContactsDeleted = 0;
    let totalProfilesDeleted = 0;
    let totalTracksRelinked = 0;

    for (const group of duplicateGroups) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📝 Processing: ${group.name} (${group.contacts.length} duplicates)`);
      console.log(`${'─'.repeat(80)}`);

      // The first contact is the keeper (highest streams, oldest if tied)
      const keeper = group.contacts[0];
      const duplicates = group.contacts.slice(1);

      console.log(`✅ KEEPER:`);
      console.log(`   Contact ID:      ${keeper.contactId}`);
      console.log(`   Songwriter ID:   ${keeper.songwriterId}`);
      console.log(`   Chartmetric ID:  ${keeper.chartmetricId}`);
      console.log(`   Total Streams:   ${keeper.totalStreams.toLocaleString()}`);
      console.log(`   Total Tracks:    ${keeper.totalTracks}`);
      console.log(`   Score:           ${keeper.score}`);
      console.log(`   Stage:           ${keeper.stage}`);
      console.log(`   Created:         ${new Date(keeper.createdAt).toLocaleDateString()}`);

      console.log(`\n❌ DUPLICATES TO MERGE:`);
      duplicates.forEach((dup, idx) => {
        console.log(`\n   ${idx + 1}. Contact ID: ${dup.contactId}`);
        console.log(`      Songwriter ID:   ${dup.songwriterId}`);
        console.log(`      Chartmetric ID:  ${dup.chartmetricId}`);
        console.log(`      Total Streams:   ${dup.totalStreams.toLocaleString()}`);
        console.log(`      Total Tracks:    ${dup.totalTracks}`);
        console.log(`      Score:           ${dup.score}`);
        console.log(`      Created:         ${new Date(dup.createdAt).toLocaleDateString()}`);
      });

      if (dryRun) {
        console.log(`\n   [DRY RUN] Would merge ${duplicates.length} duplicates into keeper`);
        totalMerged++;
        continue;
      }

      // Merge each duplicate into the keeper
      for (const duplicate of duplicates) {
        try {
          // 1. Get all tracks associated with the duplicate
          const tracksResult = await db.execute(sql`
            SELECT track_id FROM contact_tracks WHERE contact_id = ${duplicate.contactId}
          `);
          const trackIds = tracksResult.rows.map((r: any) => r.track_id);

          console.log(`\n   📦 Migrating ${trackIds.length} tracks from duplicate to keeper...`);

          // 2. Relink tracks to keeper (skip if already linked)
          let relinkedCount = 0;
          for (const trackId of trackIds) {
            const existingLink = await db.execute(sql`
              SELECT id FROM contact_tracks 
              WHERE contact_id = ${keeper.contactId} AND track_id = ${trackId}
            `);

            if (existingLink.rows.length === 0) {
              await db.execute(sql`
                INSERT INTO contact_tracks (contact_id, track_id)
                VALUES (${keeper.contactId}, ${trackId})
              `);
              relinkedCount++;
            }
          }

          console.log(`      ✓ Relinked ${relinkedCount} tracks to keeper`);
          totalTracksRelinked += relinkedCount;

          // 3. Delete duplicate's contact_tracks entries
          await db.execute(sql`
            DELETE FROM contact_tracks WHERE contact_id = ${duplicate.contactId}
          `);
          console.log(`      ✓ Removed duplicate contact_tracks entries`);

          // 4. Delete the duplicate contact
          await db.execute(sql`
            DELETE FROM contacts WHERE id = ${duplicate.contactId}
          `);
          console.log(`      ✓ Deleted duplicate contact (${duplicate.contactId})`);
          totalContactsDeleted++;

          // 5. Delete the duplicate songwriter_profile
          await db.execute(sql`
            DELETE FROM songwriter_profiles WHERE id = ${duplicate.songwriterId}
          `);
          console.log(`      ✓ Deleted duplicate songwriter_profile (${duplicate.songwriterId})`);
          totalProfilesDeleted++;

        } catch (error: any) {
          console.error(`      ❌ Error merging duplicate ${duplicate.contactId}:`, error.message);
        }
      }

      // 6. Update keeper's stats (total_tracks, total_streams)
      const keeperTracksResult = await db.execute(sql`
        SELECT COUNT(*) as track_count
        FROM contact_tracks
        WHERE contact_id = ${keeper.contactId}
      `);
      const totalTracksForKeeper = (keeperTracksResult.rows[0] as any).track_count;

      // Recalculate total streams from all linked tracks
      const keeperStreamsResult = await db.execute(sql`
        SELECT COALESCE(SUM(ps.spotify_streams), 0) as total_streams
        FROM contact_tracks ct
        JOIN playlist_snapshots ps ON ps.id = ct.track_id
        WHERE ct.contact_id = ${keeper.contactId}
      `);
      const totalStreamsForKeeper = (keeperStreamsResult.rows[0] as any).total_streams;

      await db.execute(sql`
        UPDATE contacts
        SET total_tracks = ${totalTracksForKeeper},
            total_streams = ${totalStreamsForKeeper},
            updated_at = NOW()
        WHERE id = ${keeper.contactId}
      `);

      console.log(`\n   ✅ Updated keeper stats:`);
      console.log(`      Total Tracks:  ${totalTracksForKeeper}`);
      console.log(`      Total Streams: ${totalStreamsForKeeper.toLocaleString()}`);

      totalMerged++;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 MERGE SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Duplicate name groups processed: ${totalMerged}`);
    console.log(`Contacts deleted:                ${totalContactsDeleted}`);
    console.log(`Songwriter profiles deleted:     ${totalProfilesDeleted}`);
    console.log(`Tracks relinked:                 ${totalTracksRelinked}`);
    console.log(`\n✅ Merge complete!\n`);

    return {
      merged: totalMerged,
      deleted: totalContactsDeleted,
      profilesDeleted: totalProfilesDeleted,
      tracksRelinked: totalTracksRelinked,
    };

  } catch (error: any) {
    console.error("❌ Fatal error:", error.message);
    throw error;
  }
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (dryRun) {
  console.log("⚠️  DRY RUN MODE - No changes will be made\n");
} else {
  console.log("⚠️  LIVE MODE - Database will be modified\n");
}

mergeDuplicateContacts(dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal:", error);
    process.exit(1);
  });

export { mergeDuplicateContacts };
