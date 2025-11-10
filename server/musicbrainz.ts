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
    work?: {
      id: string;
    };
  }>;
}

interface MusicBrainzResponse {
  recordings?: MusicBrainzRecording[];
}

export interface EnrichedMetadata {
  publisher?: string;
  songwriter?: string;
  enrichmentTier?: string;
  matchScore?: number;
}

export interface ArtistExternalLinks {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  bandcamp?: string;
  linkedin?: string;
  youtube?: string;
  discogs?: string;
  website?: string;
}

interface MusicBrainzSearchRecording extends MusicBrainzRecording {
  score?: number;
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

    metadata.enrichmentTier = "isrc";
    return metadata;
  } catch (error) {
    console.error(`Error fetching metadata from MusicBrainz for ISRC ${isrc}:`, error);
    return {};
  }
}

export async function searchRecordingByName(
  trackName: string,
  artistName: string,
  scoreThreshold: number = 90
): Promise<EnrichedMetadata & { recordingId?: string }> {
  if (!trackName || !artistName) {
    return {};
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const query = `recording:"${trackName}" AND artist:"${artistName}"`;
    const searchUrl = `${MUSICBRAINZ_API}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    
    console.log(`MusicBrainz name search: ${trackName} by ${artistName}`);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!searchResponse.ok) {
      console.warn(`MusicBrainz name search error: ${searchResponse.status}`);
      return {};
    }

    const searchData: { recordings?: MusicBrainzSearchRecording[] } = await searchResponse.json();
    
    if (!searchData.recordings || searchData.recordings.length === 0) {
      console.log(`No MusicBrainz recording found for "${trackName}" by "${artistName}"`);
      return {};
    }

    const bestMatch = searchData.recordings[0];
    const score = bestMatch.score || 0;

    console.log(`Best match score: ${score} (threshold: ${scoreThreshold})`);

    if (score < scoreThreshold) {
      console.log(`Match score ${score} below threshold ${scoreThreshold}, skipping`);
      return {};
    }

    const recordingId = bestMatch.id;
    
    if (!recordingId) {
      console.warn(`No recording ID in search result`);
      return {};
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

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
    const metadata: EnrichedMetadata & { recordingId?: string } = {
      enrichmentTier: "name-based",
      matchScore: score,
      recordingId: recordingId,
    };

    const workRelation = recording.relations?.find(r => r.type === "performance");
    const workId = workRelation?.work?.id;
    
    if (workId) {
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
      }
    }

    console.log(`✅ Name-based match (score ${score}): ${metadata.songwriter || 'no songwriters'}`);
    return metadata;
  } catch (error) {
    console.error(`Error searching MusicBrainz by name:`, error);
    return {};
  }
}

export async function getArtistExternalLinks(artistId: string): Promise<ArtistExternalLinks> {
  if (!artistId) {
    return {};
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const artistUrl = `${MUSICBRAINZ_API}/artist/${artistId}?fmt=json&inc=url-rels`;
    
    const artistResponse = await fetch(artistUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!artistResponse.ok) {
      console.warn(`MusicBrainz artist error for ${artistId}: ${artistResponse.status}`);
      return {};
    }

    const artistData: any = await artistResponse.json();
    const links: ArtistExternalLinks = {};

    if (artistData.relations) {
      for (const relation of artistData.relations) {
        if (relation.type === "social network" || relation.type === "streaming" || relation.type === "purchase") {
          const url = relation.url?.resource || "";
          
          if (url.includes("instagram.com")) {
            links.instagram = url;
          } else if (url.includes("twitter.com") || url.includes("x.com")) {
            links.twitter = url;
          } else if (url.includes("facebook.com")) {
            links.facebook = url;
          } else if (url.includes("bandcamp.com")) {
            links.bandcamp = url;
          } else if (url.includes("linkedin.com")) {
            links.linkedin = url;
          } else if (url.includes("youtube.com")) {
            links.youtube = url;
          } else if (url.includes("discogs.com")) {
            links.discogs = url;
          }
        } else if (relation.type === "official homepage") {
          links.website = relation.url?.resource;
        }
      }
    }

    console.log(`Found ${Object.keys(links).length} external links for artist ${artistId}`);
    return links;
  } catch (error) {
    console.error(`Error fetching artist links from MusicBrainz:`, error);
    return {};
  }
}

export async function searchArtistByName(artistName: string): Promise<{ id: string; score: number } | null> {
  if (!artistName) {
    return null;
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const searchUrl = `${MUSICBRAINZ_API}/artist?query=artist:"${encodeURIComponent(artistName)}"&fmt=json&limit=1`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!searchResponse.ok) {
      console.warn(`MusicBrainz artist search error: ${searchResponse.status}`);
      return null;
    }

    const searchData: any = await searchResponse.json();
    
    if (!searchData.artists || searchData.artists.length === 0) {
      return null;
    }

    const artist = searchData.artists[0];
    return {
      id: artist.id,
      score: artist.score || 0,
    };
  } catch (error) {
    console.error(`Error searching MusicBrainz artist:`, error);
    return null;
  }
}
