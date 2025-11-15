/**
 * Populate Songwriter Contacts from Existing Track Data
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { songwriterProfiles, contacts, contactTracks } from "../../shared/schema";

function parseSongwriters(songwriterField: string): string[] {
  if (!songwriterField || songwriterField.trim() === '' || songwriterField === '-') {
    return [];
  }
  
  return songwriterField
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0 && name !== '-');
}

async function populateContacts() {
  console.log("🚀 Starting songwriter contact population...\n");

  try {
    const tracksResult = await db.execute(sql`
      SELECT 
        id, track_name, artist_name, songwriter,
        COALESCE(spotify_streams, 0) as spotify_streams,
        instagram, twitter, email, publisher, publisher_status
      FROM playlist_snapshots
      WHERE songwriter IS NOT NULL AND TRIM(songwriter) != '' AND songwriter != '-'
    `);

    const tracks = tracksResult.rows as Array<{
      id: string; track_name: string; artist_name: string; songwriter: string;
      spotify_streams: number; instagram: string | null; twitter: string | null;
      email: string | null; publisher: string | null; publisher_status: string | null;
    }>;

    console.log(`✅ Found ${tracks.length} tracks with songwriter data\n`);

    if (tracks.length === 0) {
      console.log("⚠️  No songwriters found. Exiting.");
      return;
    }

    const songwriterMap = new Map<string, {
      name: string; tracks: string[]; totalStreams: number;
      instagram: string | null; twitter: string | null; email: string | null;
      hasPublisher: boolean;
    }>();

    for (const track of tracks) {
      const names = parseSongwriters(track.songwriter);
      
      for (const name of names) {
        if (!songwriterMap.has(name)) {
          songwriterMap.set(name, {
            name, tracks: [], totalStreams: 0,
            instagram: track.instagram, twitter: track.twitter, email: track.email,
            hasPublisher: !!track.publisher,
          });
        }
        
        const data = songwriterMap.get(name)!;
        data.tracks.push(track.id);
        data.totalStreams += track.spotify_streams;
        if (track.instagram && !data.instagram) data.instagram = track.instagram;
        if (track.twitter && !data.twitter) data.twitter = track.twitter;
        if (track.email && !data.email) data.email = track.email;
        if (track.publisher) data.hasPublisher = true;
      }
    }

    console.log(`✅ Found ${songwriterMap.size} unique songwriters\n`);

    let profilesCreated = 0, contactsCreated = 0, linksCreated = 0;

    for (const [name, data] of Array.from(songwriterMap.entries())) {
      try {
        const existingProfile = await db.execute(sql`
          SELECT id FROM songwriter_profiles WHERE name = ${name} LIMIT 1
        `);

        let profileId: string;

        if (existingProfile.rows.length > 0) {
          profileId = (existingProfile.rows[0] as any).id;
        } else {
          const newProfile = await db.insert(songwriterProfiles).values({
            chartmetricId: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            totalTracks: data.tracks.length,
            topPublisher: data.hasPublisher ? 'Unknown' : null,
          }).returning();

          profileId = newProfile[0].id;
          profilesCreated++;
          console.log(`  ✓ Created: ${name} (${data.tracks.length} tracks)`);
        }

        const existingContact = await db.execute(sql`
          SELECT id FROM contacts WHERE songwriter_id = ${profileId} LIMIT 1
        `);

        let contactId: string;

        if (existingContact.rows.length > 0) {
          contactId = (existingContact.rows[0] as any).id;
          await db.execute(sql`
            UPDATE contacts
            SET total_tracks = ${data.tracks.length}, total_streams = ${data.totalStreams}, updated_at = NOW()
            WHERE id = ${contactId}
          `);
        } else {
          const newContact = await db.insert(contacts).values({
            songwriterId: profileId,
            stage: 'discovery',
            totalTracks: data.tracks.length,
            totalStreams: data.totalStreams,
            hotLead: 0,
          }).returning();

          contactId = newContact[0].id;
          contactsCreated++;
        }

        for (const trackId of data.tracks) {
          try {
            const existingLink = await db.execute(sql`
              SELECT id FROM contact_tracks WHERE contact_id = ${contactId} AND track_id = ${trackId} LIMIT 1
            `);

            if (existingLink.rows.length === 0) {
              await db.insert(contactTracks).values({ contactId, trackId });
              linksCreated++;
            }
          } catch {}
        }

      } catch (error: any) {
        console.error(`  ❌ Error: ${name}:`, error.message);
      }
    }

    console.log("\n📊 Summary:");
    console.log(`  Songwriter profiles created: ${profilesCreated}`);
    console.log(`  Contacts created: ${contactsCreated}`);
    console.log(`  Track links created: ${linksCreated}`);

    const stats = await db.execute(sql`
      SELECT stage, COUNT(*) as count, SUM(total_tracks) as total_tracks
      FROM contacts GROUP BY stage ORDER BY stage
    `);

    console.log("\n📈 Contacts by stage:");
    for (const row of stats.rows as any[]) {
      console.log(`  ${row.stage}: ${row.count} contacts, ${row.total_tracks || 0} tracks`);
    }

    console.log("\n✅ Complete!\n");

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  populateContacts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal:", error);
      process.exit(1);
    });
}

export { populateContacts };
