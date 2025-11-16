import { db } from "../db";
import { contacts, songwriterProfiles, playlistSnapshots, trackSongwriters } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { invalidateMetricsCache } from "../metricsService";

export async function syncContactEnrichmentFlags(songwriterName: string): Promise<void> {
  try {
    const profile = await db
      .select()
      .from(songwriterProfiles)
      .where(eq(songwriterProfiles.name, songwriterName))
      .limit(1);

    if (profile.length === 0) {
      return;
    }

    const songwriterId = profile[0].id;

    const contact = await db
      .select()
      .from(contacts)
      .where(eq(contacts.songwriterId, songwriterId))
      .limit(1);

    if (contact.length === 0) {
      return;
    }

    const contactId = contact[0].id;

    const enrichmentStats = await db.execute<{
      musicbrainz_searched: number;
      musicbrainz_found: number;
      mlc_searched: number;
      mlc_found: number;
      collaboration_count: number;
    }>(sql`
      WITH songwriter_tracks AS (
        -- Get all tracks for this songwriter using ID-based track_songwriters table
        SELECT DISTINCT ts.track_id
        FROM track_songwriters ts
        WHERE ts.songwriter_id = ${songwriterId}
      ),
      fallback_tracks AS (
        -- Fallback: include tracks matched via text if no track_songwriters exist yet
        SELECT DISTINCT ps.id as track_id
        FROM playlist_snapshots ps
        WHERE ps.songwriter LIKE '%' || ${songwriterName} || '%'
          AND NOT EXISTS (SELECT 1 FROM track_songwriters WHERE track_id = ps.id)
      ),
      all_tracks AS (
        SELECT track_id FROM songwriter_tracks
        UNION
        SELECT track_id FROM fallback_tracks
      )
      SELECT 
        -- MusicBrainz: checked if artist_songwriters link exists (Phase 3 attempted)
        CASE 
          WHEN COUNT(DISTINCT asw.artist_id) > 0 THEN 1 
          ELSE 0 
        END as musicbrainz_searched,
        
        -- MusicBrainz: found if we have actual artist records with musicbrainz_id
        CASE 
          WHEN COUNT(DISTINCT a.musicbrainz_id) FILTER (WHERE a.musicbrainz_id IS NOT NULL) > 0 THEN 1 
          ELSE 0 
        END as musicbrainz_found,
        
        -- MLC: searched if any track has completed MLC enrichment (status success/error/not_found or has mlc_song_code)
        CASE 
          WHEN COUNT(*) FILTER (WHERE ps.publisher_status IN ('success', 'error', 'not_found') OR ps.mlc_song_code IS NOT NULL) > 0 THEN 1 
          ELSE 0 
        END as mlc_searched,
        
        -- MLC: found if any track has publisher data from MLC
        CASE 
          WHEN COUNT(*) FILTER (WHERE ps.publisher IS NOT NULL AND ps.publisher != '') > 0 THEN 1 
          ELSE 0 
        END as mlc_found,
        
        -- Collaboration count: Count unique co-writers using ID-based track_songwriters
        -- This is the authoritative, accurate count based on resolved songwriter identities
        COALESCE(
          (SELECT COUNT(DISTINCT ts_cowriter.songwriter_id)
           FROM all_tracks at
           JOIN track_songwriters ts_cowriter ON ts_cowriter.track_id = at.track_id
           -- Exclude the songwriter themselves by ID
           WHERE ts_cowriter.songwriter_id != ${songwriterId}
          ), 0
        ) as collaboration_count
        
      FROM all_tracks at
      JOIN playlist_snapshots ps ON ps.id = at.track_id
      LEFT JOIN artist_songwriters asw ON asw.track_id = at.track_id
      LEFT JOIN artists a ON a.id = asw.artist_id
    `);

    if (enrichmentStats.rows.length === 0) {
      return;
    }

    const stats = enrichmentStats.rows[0];

    await db
      .update(contacts)
      .set({
        musicbrainzSearched: stats.musicbrainz_searched,
        musicbrainzFound: stats.musicbrainz_found,
        mlcSearched: stats.mlc_searched,
        mlcFound: stats.mlc_found,
        collaborationCount: stats.collaboration_count,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId));

    // Invalidate metrics cache so dashboard reflects updated data immediately
    invalidateMetricsCache();

    console.log(`[ContactEnrichmentSync] Updated flags for ${songwriterName}: MB(${stats.musicbrainz_searched}/${stats.musicbrainz_found}), MLC(${stats.mlc_searched}/${stats.mlc_found}), Collabs(${stats.collaboration_count})`);
  } catch (error) {
    console.error(`[ContactEnrichmentSync] Error syncing enrichment flags for ${songwriterName}:`, error);
  }
}

export async function syncAllContactEnrichmentFlags(): Promise<void> {
  console.log("[ContactEnrichmentSync] Starting full sync of all contact enrichment flags...");
  
  const allProfiles = await db
    .select()
    .from(songwriterProfiles);

  let updated = 0;
  for (const profile of allProfiles) {
    await syncContactEnrichmentFlags(profile.name);
    updated++;
  }

  console.log(`[ContactEnrichmentSync] ✅ Synced enrichment flags for ${updated} contacts`);
}
