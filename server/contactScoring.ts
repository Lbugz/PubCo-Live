import { db } from "./db";
import { contacts, contactTracks, playlistSnapshots } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export interface ContactScoringData {
  contactId: string;
  mlcSearched: number;
  mlcFound: number;
  musicbrainzSearched: number;
  musicbrainzFound: number;
  totalStreams: number | null;
  totalTracks: number;
  wowGrowthPct: number | null;
  tracks: {
    publisher: string | null;
    writer: string | null;
    label: string | null;
    playlistName: string;
    artistName: string;
    songwriter: string | null;
  }[];
}

const CONTACT_RUBRIC = {
  mlcVerifiedUnsigned: 6,           // Highest priority - MLC confirmed no publisher
  noPublisherOnTracks: 3,           // Missing publisher across tracks
  noWriterMetadata: 2,              // Missing writer metadata across tracks
  selfWritten_FreshFinds: 2,        // Self-written + editorial validation
  selfWritten_Indie: 1,             // Self-written + indie label
  streamVelocity_High: 2,           // >50% WoW growth = hot opportunity
  streamVelocity_Medium: 1,         // >20% WoW growth = rising talent
};

/**
 * Check if the artist is also the songwriter
 */
function isArtistTheSongwriter(artistName: string, songwriter: string | null): boolean {
  if (!artistName || !songwriter) return false;
  
  const normalizedArtist = artistName.toLowerCase().trim();
  const normalizedSongwriter = songwriter.toLowerCase().trim();
  
  return normalizedSongwriter.includes(normalizedArtist) || 
         normalizedArtist.includes(normalizedSongwriter);
}

/**
 * Calculate unsigned score for a contact/songwriter
 * Score range: 0-10
 */
export function calculateContactScore(data: ContactScoringData): number {
  let score = 0;

  // HIGHEST PRIORITY: MLC verified unsigned
  // mlcSearched=1 AND mlcFound=0 means we searched MLC and found NO publisher
  if (data.mlcSearched === 1 && data.mlcFound === 0) {
    score += CONTACT_RUBRIC.mlcVerifiedUnsigned;
  }

  // Analyze tracks for publishing metadata gaps
  const tracksWithoutPublisher = data.tracks.filter(t => !t.publisher).length;
  const tracksWithoutWriter = data.tracks.filter(t => !t.writer).length;
  const totalTracks = data.tracks.length;

  // If >50% of tracks missing publisher = strong unsigned signal
  if (totalTracks > 0 && tracksWithoutPublisher / totalTracks > 0.5) {
    score += CONTACT_RUBRIC.noPublisherOnTracks;
  }

  // If >50% of tracks missing writer metadata = potential DIY/unsigned
  if (totalTracks > 0 && tracksWithoutWriter / totalTracks > 0.5) {
    score += CONTACT_RUBRIC.noWriterMetadata;
  }

  // Check for self-written bonuses across tracks
  const selfWrittenTracks = data.tracks.filter(t => 
    isArtistTheSongwriter(t.artistName, t.songwriter)
  );

  // Fresh Finds bonus if songwriter has self-written Fresh Finds tracks
  const hasFreshFindsSelfWritten = selfWrittenTracks.some(t => 
    t.playlistName.toLowerCase().includes("fresh finds")
  );
  if (hasFreshFindsSelfWritten) {
    score += CONTACT_RUBRIC.selfWritten_FreshFinds;
  }

  // Indie label bonus if songwriter has self-written indie releases
  const hasIndieSelfWritten = selfWrittenTracks.some(t => 
    t.label && /\b(DK|DIY|indie|independent)\b/i.test(t.label)
  );
  if (hasIndieSelfWritten) {
    score += CONTACT_RUBRIC.selfWritten_Indie;
  }

  // Stream velocity bonus (WoW growth indicates trending/hot opportunity)
  if (data.wowGrowthPct !== null && data.wowGrowthPct !== undefined) {
    if (data.wowGrowthPct > 50) {
      score += CONTACT_RUBRIC.streamVelocity_High;
    } else if (data.wowGrowthPct > 20) {
      score += CONTACT_RUBRIC.streamVelocity_Medium;
    }
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * Score a single contact by ID
 */
export async function scoreContact(contactId: string): Promise<number> {
  // Fetch contact data
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: {
      songwriter: true,
    },
  });

  if (!contact) {
    throw new Error(`Contact ${contactId} not found`);
  }

  // Fetch all tracks for this contact
  const trackRelations = await db.query.contactTracks.findMany({
    where: eq(contactTracks.contactId, contactId),
  });

  const trackIds = trackRelations.map((rel: { trackId: string }) => rel.trackId);

  const tracks = await db.query.playlistSnapshots.findMany({
    where: sql`${playlistSnapshots.id} = ANY(${trackIds})`,
  });

  const scoringData: ContactScoringData = {
    contactId: contact.id,
    mlcSearched: contact.mlcSearched,
    mlcFound: contact.mlcFound,
    musicbrainzSearched: contact.musicbrainzSearched,
    musicbrainzFound: contact.musicbrainzFound,
    totalStreams: contact.totalStreams,
    totalTracks: contact.totalTracks,
    wowGrowthPct: contact.wowGrowthPct,
    tracks: tracks.map((t: any) => ({
      publisher: t.publisher,
      writer: t.songwriter,
      label: t.label,
      playlistName: t.playlistName,
      artistName: t.artistName,
      songwriter: t.songwriter,
    })),
  };

  const score = calculateContactScore(scoringData);

  // Update contact with new score
  await db.update(contacts)
    .set({ 
      unsignedScore: score,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  return score;
}

/**
 * Score all contacts (used for batch scoring after enrichment)
 */
export async function scoreAllContacts(): Promise<{ contactId: string; score: number }[]> {
  const allContacts = await db.query.contacts.findMany();

  const results = [];
  for (const contact of allContacts) {
    try {
      const score = await scoreContact(contact.id);
      results.push({ contactId: contact.id, score });
    } catch (error) {
      console.error(`Failed to score contact ${contact.id}:`, error);
    }
  }

  return results;
}
