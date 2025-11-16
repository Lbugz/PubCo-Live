import { db } from "../db";
import { contacts, songwriterProfiles, playlistSnapshots } from "@shared/schema";
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
      SELECT 
        -- MusicBrainz: checked if artist_songwriters link exists (Phase 3 attempted)
        CASE 
          WHEN COUNT(DISTINCT as2.artist_id) > 0 THEN 1 
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
        
        -- Collaboration count: unique co-writers from artist_songwriters table
        COALESCE(COUNT(DISTINCT as2.artist_id) FILTER (WHERE as2.artist_id IS NOT NULL), 0) as collaboration_count
        
      FROM playlist_snapshots ps
      LEFT JOIN artist_songwriters as2 ON as2.track_id = ps.id
      LEFT JOIN artists a ON a.id = as2.artist_id
      WHERE ps.songwriter LIKE '%' || ${songwriterName} || '%'
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
