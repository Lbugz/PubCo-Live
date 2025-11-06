const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
const USER_AGENT = "AIPublFeed/1.0.0 ( https://replit.com )";

interface MusicBrainzRecording {
  id: string;
  title: string;
  "artist-credit"?: Array<{
    name: string;
    artist: {
      name: string;
    };
  }>;
  relations?: Array<{
    type: string;
    artist?: {
      name: string;
    };
    label?: {
      name: string;
    };
  }>;
}

interface MusicBrainzResponse {
  recordings?: MusicBrainzRecording[];
}

export interface EnrichedMetadata {
  publisher?: string;
  songwriter?: string;
}

export async function searchByISRC(isrc: string): Promise<EnrichedMetadata> {
  if (!isrc) {
    return {};
  }

  try {
    // Rate limiting: Wait 1 second before making API calls
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 1: Search by ISRC to get the recording ID
    const searchUrl = `${MUSICBRAINZ_API}/recording?query=isrc:${isrc}&fmt=json`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!searchResponse.ok) {
      console.warn(`MusicBrainz search error for ISRC ${isrc}: ${searchResponse.status}`);
      return {};
    }

    const searchData: MusicBrainzResponse = await searchResponse.json();
    
    if (!searchData.recordings || searchData.recordings.length === 0) {
      console.log(`No MusicBrainz recording found for ISRC ${isrc}`);
      return {};
    }

    const recordingId = searchData.recordings[0].id;
    
    if (!recordingId) {
      console.warn(`No recording ID found for ISRC ${isrc}`);
      return {};
    }

    // Step 2: Fetch full recording details with relations
    // Note: No additional delay needed - we're already rate limiting above
    const detailUrl = `${MUSICBRAINZ_API}/recording/${recordingId}?fmt=json&inc=artist-credits+artist-rels+work-rels`;
    
    const detailResponse = await fetch(detailUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!detailResponse.ok) {
      console.warn(`MusicBrainz detail error for recording ${recordingId}: ${detailResponse.status}`);
      return {};
    }

    const recording: MusicBrainzRecording = await detailResponse.json();
    const metadata: EnrichedMetadata = {};

    // Parse relations to extract publisher and songwriter
    if (recording.relations) {
      // Look for publisher in label relations
      const publisherRelation = recording.relations.find(
        r => r.type === "publisher" || r.type === "publishing"
      );
      if (publisherRelation?.label?.name) {
        metadata.publisher = publisherRelation.label.name;
      }

      // Look for songwriters in artist relations
      const writerRelations = recording.relations.filter(
        r => r.type === "composer" || r.type === "writer" || r.type === "lyricist"
      );
      if (writerRelations.length > 0) {
        const writers = writerRelations
          .map(r => r.artist?.name)
          .filter(Boolean);
        if (writers.length > 0) {
          metadata.songwriter = writers.join(", ");
        }
      }
    }

    if (metadata.publisher || metadata.songwriter) {
      console.log(`Found metadata for ISRC ${isrc}: Publisher=${metadata.publisher || 'none'}, Songwriter=${metadata.songwriter || 'none'}`);
    }

    return metadata;
  } catch (error) {
    console.error(`Error fetching metadata from MusicBrainz for ISRC ${isrc}:`, error);
    return {};
  }
}
