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

    // Step 2: Fetch recording with work relations to find the Work ID
    const detailUrl = `${MUSICBRAINZ_API}/recording/${recordingId}?fmt=json&inc=work-rels`;
    
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

    // Find the Work (composition) from the recording
    const workRelation = recording.relations?.find(r => r.type === "performance");
    const workId = workRelation?.work?.id;
    
    if (workId) {
      // Step 3: Fetch Work details to get composers/writers
      // Rate limit: Wait 1 second before fetching work
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const workUrl = `${MUSICBRAINZ_API}/work/${workId}?fmt=json&inc=artist-rels`;
      
      const workResponse = await fetch(workUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json",
        },
      });

      if (workResponse.ok) {
        const work: any = await workResponse.json();
        
        // Extract songwriters from Work artist relations
        if (work.relations) {
          const writerRelations = work.relations.filter(
            (r: any) => r.type === "composer" || r.type === "writer" || r.type === "lyricist"
          );
          if (writerRelations.length > 0) {
            const writers = writerRelations
              .map((r: any) => r.artist?.name)
              .filter(Boolean);
            if (writers.length > 0) {
              metadata.songwriter = writers.join(", ");
            }
          }
        }
      } else {
        console.warn(`MusicBrainz work error for work ${workId}: ${workResponse.status}`);
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
