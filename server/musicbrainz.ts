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
    await new Promise(resolve => setTimeout(resolve, 1000));

    const url = `${MUSICBRAINZ_API}/recording?query=isrc:${isrc}&fmt=json&inc=artist-credits+labels+artist-rels+work-rels`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`MusicBrainz API error for ISRC ${isrc}: ${response.status}`);
      return {};
    }

    const data: MusicBrainzResponse = await response.json();
    
    if (!data.recordings || data.recordings.length === 0) {
      return {};
    }

    const recording = data.recordings[0];
    const metadata: EnrichedMetadata = {};

    if (recording.relations) {
      const publisherRelation = recording.relations.find(
        r => r.type === "publisher" || r.type === "publishing"
      );
      if (publisherRelation?.label?.name) {
        metadata.publisher = publisherRelation.label.name;
      }

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

    return metadata;
  } catch (error) {
    console.error(`Error fetching metadata from MusicBrainz for ISRC ${isrc}:`, error);
    return {};
  }
}
