const MLC_USERNAME = process.env.MLC_USERNAME;
const MLC_PASSWORD = process.env.MLC_PASSWORD;
const MLC_API_BASE_URL = "https://public-api.themlc.com";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

interface MLCAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: string;
  idToken: string;
  error?: string;
  errorDescription?: string;
}

interface MLCWriter {
  writerId: string;
  writerFirstName: string;
  writerLastName: string;
  writerIPI: string;
  writerRoleCode: string;
  chainId?: string;
  chainParentId?: string;
}

interface MLCPublisher {
  publisherId: string;
  publisherName: string;
  publisherIpiNumber: string;
  publisherRoleCode: string;
  collectionShare: number;
  mlcPublisherNumber: string;
  chainId?: string;
  chainParentId?: string;
  administrators?: MLCPublisher[];
  parentPublishers?: MLCPublisher[];
}

interface MLCWork {
  mlcSongCode: string;
  primaryTitle: string;
  iswc: string;
  artists: string;
  writers: MLCWriter[];
  publishers: MLCPublisher[];
  akas?: {
    akaId: string;
    akaTitle: string;
    akaTitleTypeCode: string;
  }[];
  membersSongId?: string;
}

interface MLCRecording {
  id: string;
  isrc: string;
  title: string;
  artist: string;
  labels: string;
  mlcsongCode: string;
}

export type PublisherStatus = "unsigned" | "self-published" | "indie" | "major";

const MAJOR_PUBLISHERS = [
  "sony music publishing",
  "universal music publishing",
  "warner chappell",
  "kobalt music",
  "bmg rights management",
  "peermusic",
];

async function getAccessToken(): Promise<string | null> {
  if (!MLC_USERNAME || !MLC_PASSWORD) {
    console.warn("[MLC] MLC_USERNAME and MLC_PASSWORD not configured. Skipping MLC API calls.");
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  try {
    const response = await fetch(`${MLC_API_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: MLC_USERNAME,
        password: MLC_PASSWORD,
      }),
    });

    if (!response.ok) {
      throw new Error(`MLC auth failed: ${response.status} ${response.statusText}`);
    }

    const data: MLCAuthResponse = await response.json();

    if (data.error) {
      throw new Error(`MLC auth error: ${data.error} - ${data.errorDescription}`);
    }

    const expiresIn = parseInt(data.expiresIn) || 3600;
    cachedToken = {
      accessToken: data.accessToken,
      expiresAt: Date.now() + (expiresIn - 300) * 1000,
    };

    console.log("[MLC] Successfully authenticated");
    return cachedToken.accessToken;
  } catch (error) {
    console.error("[MLC] Authentication error:", error);
    return null;
  }
}

export function determinePublisherStatus(publishers: MLCPublisher[] | undefined): PublisherStatus {
  if (!publishers || publishers.length === 0) {
    return "unsigned";
  }

  const publisherNames = publishers
    .filter(p => p && p.publisherName)
    .map(p => p.publisherName.toLowerCase());
  
  if (publisherNames.length === 0) {
    return "unsigned";
  }
  
  const hasMajorPublisher = publisherNames.some(name => 
    MAJOR_PUBLISHERS.some(major => name.includes(major))
  );
  
  if (hasMajorPublisher) {
    return "major";
  }

  const hasSelfPublished = publisherNames.some(name => 
    name.includes("self") || 
    name.includes("independent") ||
    name.includes("admin") ||
    name.includes("private")
  );
  
  if (hasSelfPublished) {
    return "self-published";
  }

  return "indie";
}

export async function searchRecordingByISRC(isrc: string): Promise<MLCRecording | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    console.log(`[MLC] Searching for recording with ISRC: ${isrc}`);
    
    const response = await fetch(`${MLC_API_BASE_URL}/search/recordings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isrc: isrc,
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[MLC] No recording found for ISRC: ${isrc}`);
        return null;
      }
      throw new Error(`MLC API error: ${response.status} ${response.statusText}`);
    }

    const recordings: MLCRecording[] = await response.json();
    
    if (!recordings || recordings.length === 0) {
      console.log(`[MLC] No recordings found for ISRC: ${isrc}`);
      return null;
    }

    const recording = recordings[0];
    console.log(`[MLC] Found recording: "${recording.title}" with MLC Song Code: ${recording.mlcsongCode}`);
    
    return recording;
  } catch (error) {
    console.error(`[MLC] Error searching for ISRC ${isrc}:`, error);
    return null;
  }
}

export async function getWorkByMlcSongCode(mlcSongCode: string): Promise<MLCWork | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    console.log(`[MLC] Fetching work details for MLC Song Code: ${mlcSongCode}`);
    
    const response = await fetch(`${MLC_API_BASE_URL}/work/id/${mlcSongCode}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[MLC] No work found for Song Code: ${mlcSongCode}`);
        return null;
      }
      throw new Error(`MLC API error: ${response.status} ${response.statusText}`);
    }

    const work: MLCWork = await response.json();
    
    if (!work) {
      console.log(`[MLC] No work found for Song Code: ${mlcSongCode}`);
      return null;
    }

    const publishersCount = work.publishers?.length || 0;
    console.log(`[MLC] Found work: "${work.primaryTitle || 'Unknown'}" with ${publishersCount} publishers`);
    
    return work;
  } catch (error) {
    console.error(`[MLC] Error fetching work ${mlcSongCode}:`, error);
    return null;
  }
}

export async function searchWorkByTitleAndWriter(
  title: string, 
  writerFirstName: string,
  writerLastName: string
): Promise<{mlcSongCode: string; iswc: string} | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    console.log(`[MLC] Searching for work: "${title}" by ${writerFirstName} ${writerLastName}`);
    
    const response = await fetch(`${MLC_API_BASE_URL}/search/songcode`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: title,
        writers: [{
          writerFirstName: writerFirstName,
          writerLastName: writerLastName,
        }],
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[MLC] No work found for "${title}" by ${writerFirstName} ${writerLastName}`);
        return null;
      }
      throw new Error(`MLC API error: ${response.status} ${response.statusText}`);
    }

    const results: {mlcSongCode: string; iswc: string; workTitle: string}[] = await response.json();
    
    if (!results || results.length === 0) {
      console.log(`[MLC] No work found for "${title}" by ${writerFirstName} ${writerLastName}`);
      return null;
    }

    const result = results[0];
    console.log(`[MLC] Found work: "${result.workTitle}" - MLC Song Code: ${result.mlcSongCode}`);
    
    return {
      mlcSongCode: result.mlcSongCode,
      iswc: result.iswc,
    };
  } catch (error) {
    console.error(`[MLC] Error searching for "${title}" by ${writerFirstName} ${writerLastName}:`, error);
    return null;
  }
}

export async function enrichTrackWithMLC(isrc: string): Promise<{
  publisherName: string | null;
  publisherStatus: PublisherStatus;
  collectionShare: string | null;
  ipiNumber: string | null;
  iswc: string | null;
  mlcSongCode: string | null;
  writers: string[];
} | null> {
  if (!MLC_USERNAME || !MLC_PASSWORD) {
    console.log("[MLC] MLC API credentials not configured. Skipping publisher status lookup.");
    return null;
  }

  try {
    const recording = await searchRecordingByISRC(isrc);
    
    if (!recording || !recording.mlcsongCode) {
      console.log(`[MLC] No recording found or missing MLC Song Code for ISRC: ${isrc}`);
      return null;
    }

    const work = await getWorkByMlcSongCode(recording.mlcsongCode);
    
    if (!work) {
      console.log(`[MLC] No work details found for MLC Song Code: ${recording.mlcsongCode}, propagating minimal data`);
      return {
        publisherName: null,
        publisherStatus: "unsigned",
        collectionShare: null,
        ipiNumber: null,
        iswc: null,
        mlcSongCode: recording.mlcsongCode,
        writers: [],
      };
    }

    const publishers = work.publishers || [];
    const publisherStatus = determinePublisherStatus(publishers);
    
    const primaryPublisher = publishers.length > 0 ? publishers[0] : null;
    const collectionShare = primaryPublisher?.collectionShare 
      ? `${primaryPublisher.collectionShare}%` 
      : null;
    
    const writerIPI = work.writers && work.writers.length > 0 
      ? work.writers[0].writerIPI 
      : null;

    const writers = (work.writers || [])
      .filter(w => w && (w.writerFirstName || w.writerLastName))
      .map(w => `${w.writerFirstName || ''} ${w.writerLastName || ''}`.trim())
      .filter(Boolean);

    return {
      publisherName: primaryPublisher?.publisherName || null,
      publisherStatus,
      collectionShare,
      ipiNumber: writerIPI,
      iswc: work.iswc || null,
      mlcSongCode: work.mlcSongCode || recording.mlcsongCode || null,
      writers,
    };
  } catch (error) {
    console.error(`[MLC] Error enriching track with ISRC ${isrc}:`, error);
    return null;
  }
}
