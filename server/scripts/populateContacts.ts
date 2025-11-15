/**
 * Populate Contacts from Existing Track Data
 * 
 * This script:
 * 1. Extracts unique artist names from playlist_snapshots
 * 2. Creates artist records in the artists table
 * 3. Creates contact records linked to artists
 * 4. Links tracks to contacts via contact_tracks junction table
 * 5. Calculates initial stats (total tracks, total streams)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { artists, contacts, contactTracks } from "../../shared/schema";

async function populateContacts() {
  console.log("🚀 Starting contact population from existing tracks...\n");

  try {
    // Step 1: Get unique artists from playlist_snapshots
    console.log("📊 Step 1: Extracting unique artists from tracks...");
    
    const uniqueArtistsResult = await db.execute(sql`
      SELECT DISTINCT
        TRIM(artist_name) as artist_name,
        COUNT(*) as track_count,
        SUM(COALESCE(spotify_streams, 0)) as total_streams,
        ARRAY_AGG(DISTINCT id) as track_ids,
        MAX(instagram) as instagram,
        MAX(twitter) as twitter,
        MAX(tiktok) as tiktok,
        MAX(email) as email
      FROM playlist_snapshots
      WHERE artist_name IS NOT NULL
        AND TRIM(artist_name) != ''
      GROUP BY TRIM(artist_name)
      ORDER BY track_count DESC
    `);

    const uniqueArtists = uniqueArtistsResult.rows as Array<{
      artist_name: string;
      track_count: number;
      total_streams: number;
      track_ids: string[];
      instagram: string | null;
      twitter: string | null;
      tiktok: string | null;
      email: string | null;
    }>;

    console.log(`✅ Found ${uniqueArtists.length} unique artists\n`);

    if (uniqueArtists.length === 0) {
      console.log("⚠️  No artists found in playlist_snapshots. Exiting.");
      return;
    }

    // Step 2: Create artist and contact records
    console.log("📝 Step 2: Creating artist and contact records...");
    
    let artistsCreated = 0;
    let contactsCreated = 0;
    let linksCreated = 0;

    for (const artistData of uniqueArtists) {
      try {
        // Check if artist already exists
        const existingArtist = await db.execute(sql`
          SELECT id FROM artists WHERE name = ${artistData.artist_name} LIMIT 1
        `);

        let artistId: string;

        if (existingArtist.rows.length > 0) {
          artistId = (existingArtist.rows[0] as any).id;
          console.log(`  ↻ Artist exists: ${artistData.artist_name}`);
        } else {
          // Create new artist
          const newArtist = await db.insert(artists).values({
            name: artistData.artist_name,
            instagram: artistData.instagram,
            twitter: artistData.twitter,
            // Note: tiktok field doesn't exist on artists table yet
          }).returning();

          artistId = newArtist[0].id;
          artistsCreated++;
          console.log(`  ✓ Created artist: ${artistData.artist_name} (${artistData.track_count} tracks)`);
        }

        // Check if contact already exists for this artist
        const existingContact = await db.execute(sql`
          SELECT id FROM contacts WHERE artist_id = ${artistId} LIMIT 1
        `);

        let contactId: string;

        if (existingContact.rows.length > 0) {
          contactId = (existingContact.rows[0] as any).id;
          
          // Update contact stats
          await db.execute(sql`
            UPDATE contacts
            SET 
              total_tracks = ${artistData.track_count},
              total_streams = ${artistData.total_streams || 0},
              updated_at = NOW()
            WHERE id = ${contactId}
          `);
          
          console.log(`  ↻ Contact exists: ${artistData.artist_name} (updated stats)`);
        } else {
          // Create new contact
          const newContact = await db.insert(contacts).values({
            artistId: artistId,
            stage: 'discovery',
            totalTracks: artistData.track_count,
            totalStreams: artistData.total_streams || 0,
            hotLead: 0,
          }).returning();

          contactId = newContact[0].id;
          contactsCreated++;
          console.log(`  ✓ Created contact: ${artistData.artist_name}`);
        }

        // Link tracks to contact
        for (const trackId of artistData.track_ids) {
          try {
            // Check if link already exists
            const existingLink = await db.execute(sql`
              SELECT id FROM contact_tracks 
              WHERE contact_id = ${contactId} AND track_id = ${trackId}
              LIMIT 1
            `);

            if (existingLink.rows.length === 0) {
              await db.insert(contactTracks).values({
                contactId: contactId,
                trackId: trackId,
              });
              linksCreated++;
            }
          } catch (linkError) {
            // Skip if link already exists (unique constraint)
            console.log(`    ⚠️  Track link already exists or failed`);
          }
        }

      } catch (artistError: any) {
        console.error(`  ❌ Error processing ${artistData.artist_name}:`, artistError.message);
      }
    }

    console.log("\n📊 Population Summary:");
    console.log(`  Artists created: ${artistsCreated}`);
    console.log(`  Contacts created: ${contactsCreated}`);
    console.log(`  Track links created: ${linksCreated}`);
    console.log(`  Total unique artists: ${uniqueArtists.length}`);

    // Step 3: Display stats
    console.log("\n📈 Contact Stats:");
    const stats = await db.execute(sql`
      SELECT 
        stage,
        COUNT(*) as count,
        SUM(total_tracks) as total_tracks,
        SUM(total_streams) as total_streams
      FROM contacts
      GROUP BY stage
      ORDER BY stage
    `);

    for (const row of stats.rows as any[]) {
      console.log(`  ${row.stage}: ${row.count} contacts, ${row.total_tracks || 0} tracks, ${row.total_streams || 0} streams`);
    }

    console.log("\n✅ Contact population complete!\n");

  } catch (error: any) {
    console.error("❌ Error populating contacts:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  populateContacts()
    .then(() => {
      console.log("✨ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { populateContacts };
