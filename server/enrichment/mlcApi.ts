import type { PlaylistSnapshot } from "@shared/schema";

interface MLCAuthResponse {
  accessToken: string;
  expiresIn: string;
  tokenType: string;
  refreshToken?: string;
}

interface MLCSearchWriter {
  writerFirstName?: string;
  writerLastName?: string;
  writerIPI?: string;
}

interface MLCSearchWork {
  title?: string;
  writers?: MLCSearchWriter[];
}

interface MLCSearchWriterResponse {
  writerFirstName?: string;
  writerLastName?: string;
  writerIPI?: string;
  writerId?: string;
  writerRoleCode?: string;
}

interface MLCSearchWorkResponse {
  iswc?: string;
  mlcSongCode?: string;
  workTitle?: string;
  writers?: MLCSearchWriterResponse[];
}

interface MLCPublisher {
  publisherId?: string;
  publisherName?: string;
  publisherIpiNumber?: string;
  collectionShare?: number;
  administrators?: MLCPublisher[];
}

interface MLCWriter {
  writerId?: string;
  writerFirstName?: string;
  writerLastName?: string;
  writerIPI?: string;
  writerRoleCode?: string;
}

interface MLCWork {
  mlcSongCode?: string;
  iswc?: string;
  primaryTitle?: string;
  publishers?: MLCPublisher[];
  writers?: MLCWriter[];
  artists?: string;
}

interface MLCRecording {
  id?: string;
  isrc?: string;
  title?: string;
  artist?: string;
  labels?: string;
  mlcsongCode?: string;
}

interface MLCSearchRecording {
  isrc?: string;
  title?: string;
  artist?: string;
}

export interface MLCEnrichmentResult {
  trackId: string;
  hasPublisher: boolean;
  publisherNames: string[];
  writerNames: string[];
  administrators?: string;
  mlcSongCode?: string;
  iswc?: string;
  error?: string;
}

class MLCApiClient {
  private baseUrl = "https://public-api.themlc.com";
  private username: string;
  private password: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  private async authenticate(): Promise<void> {
    const now = Date.now();
    
    if (this.accessToken && this.tokenExpiry > now + 60000) {
      return;
    }

    console.log("[MLC API] Authenticating...");
    
    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[MLC API] Authentication failed: ${response.status} ${error}`);
        throw new Error(`MLC authentication failed: ${response.status} ${error}`);
      }

      const data: MLCAuthResponse = await response.json();
      
      if (!data.accessToken) {
        console.error("[MLC API] No access token in response:", data);
        throw new Error("MLC authentication response missing access token");
      }
      
      this.accessToken = data.accessToken;
      
      const expiresInSeconds = parseInt(data.expiresIn, 10);
      this.tokenExpiry = now + (expiresInSeconds * 1000);
      
      console.log(`[MLC API] ✓ Authenticated (expires in ${expiresInSeconds}s)`);
    } catch (error) {
      console.error("[MLC API] Authentication error:", error);
      throw error;
    }
  }

  async searchByISRC(isrc: string, title?: string, artist?: string): Promise<MLCRecording[]> {
    await this.authenticate();

    const searchPayload: MLCSearchRecording = {
      isrc,
      ...(title && { title }),
      ...(artist && { artist }),
    };

    const response = await fetch(`${this.baseUrl}/search/recordings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(searchPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MLC ISRC search failed: ${response.status} ${error}`);
    }

    return await response.json();
  }

  async searchByTitleAndWriters(title: string, writers?: MLCSearchWriter[]): Promise<MLCSearchWorkResponse[]> {
    await this.authenticate();

    const searchPayload: MLCSearchWork = {
      title,
      ...(writers && writers.length > 0 && { writers }),
    };

    const response = await fetch(`${this.baseUrl}/search/songcode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(searchPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MLC title/writer search failed: ${response.status} ${error}`);
    }

    return await response.json();
  }

  async getWorkById(mlcSongCode: string): Promise<MLCWork> {
    await this.authenticate();

    const response = await fetch(`${this.baseUrl}/work/id/${mlcSongCode}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MLC work lookup failed: ${response.status} ${error}`);
    }

    return await response.json();
  }
}

async function enrichSingleTrack(
  track: Pick<PlaylistSnapshot, "id" | "isrc" | "trackName" | "artistName" | "songwriter">,
  client: MLCApiClient
): Promise<MLCEnrichmentResult> {
  try {
    let mlcWork: MLCWork | null = null;

    if (track.isrc) {
      console.log(`[MLC] ${track.id}: Searching by ISRC ${track.isrc}...`);
      const recordings = await client.searchByISRC(
        track.isrc,
        track.trackName,
        track.artistName
      );

      if (recordings.length > 0) {
        const recording = recordings[0];
        console.log(`[MLC] ${track.id}: Found recording, fetching work data...`);
        
        if (recording.mlcsongCode) {
          mlcWork = await client.getWorkById(recording.mlcsongCode);
        }
      }
    }

    if (!mlcWork && track.trackName) {
      console.log(`[MLC] ${track.id}: Searching by title "${track.trackName}"...`);
      
      let writers: MLCSearchWriter[] | undefined;
      if (track.songwriter) {
        const songwriterNames = track.songwriter.split(/[,&;]/).map(s => s.trim());
        writers = songwriterNames.map(name => {
          const parts = name.split(' ');
          return {
            writerFirstName: parts.slice(0, -1).join(' ') || parts[0],
            writerLastName: parts.length > 1 ? parts[parts.length - 1] : '',
          };
        });
      }

      const searchResults = await client.searchByTitleAndWriters(track.trackName, writers);

      if (searchResults.length > 0) {
        const firstResult = searchResults[0];
        console.log(`[MLC] ${track.id}: Found ${searchResults.length} works, fetching first match...`);
        
        if (firstResult.mlcSongCode) {
          mlcWork = await client.getWorkById(firstResult.mlcSongCode);
        }
      }
    }

    if (mlcWork) {
      const publishers = mlcWork.publishers || [];
      const writers = mlcWork.writers || [];
      
      const publisherNames = publishers
        .map(p => p.publisherName)
        .filter((name): name is string => !!name);
      
      const writerNames = writers
        .map(w => `${w.writerFirstName || ''} ${w.writerLastName || ''}`.trim())
        .filter(name => !!name);

      // Extract administrators from all publishers
      const administratorNames: string[] = [];
      for (const publisher of publishers) {
        if (publisher.administrators && publisher.administrators.length > 0) {
          const adminNames = publisher.administrators
            .map(admin => admin.publisherName)
            .filter((name): name is string => !!name);
          administratorNames.push(...adminNames);
        }
      }
      const administrators = administratorNames.length > 0 
        ? administratorNames.join(", ") 
        : undefined;

      console.log(`[MLC] ${track.id}: ✓ Found ${publishers.length} publishers, ${writers.length} writers, ${administratorNames.length} administrators`);

      return {
        trackId: track.id,
        hasPublisher: publishers.length > 0,
        publisherNames,
        writerNames,
        administrators,
        mlcSongCode: mlcWork.mlcSongCode,
        iswc: mlcWork.iswc,
      };
    } else {
      console.log(`[MLC] ${track.id}: No MLC data found`);
      return {
        trackId: track.id,
        hasPublisher: false,
        publisherNames: [],
        writerNames: [],
      };
    }
  } catch (error) {
    console.error(`[MLC] ${track.id}: Error -`, error);
    return {
      trackId: track.id,
      hasPublisher: false,
      publisherNames: [],
      writerNames: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function enrichTracksWithMLC(
  tracks: Pick<PlaylistSnapshot, "id" | "isrc" | "trackName" | "artistName" | "songwriter">[]
): Promise<MLCEnrichmentResult[]> {
  console.log(`[MLC DEBUG] enrichTracksWithMLC called with ${tracks.length} tracks`);
  const username = process.env.MLC_USERNAME;
  const password = process.env.MLC_PASSWORD;
  
  console.log(`[MLC DEBUG] Username exists: ${!!username}, Password exists: ${!!password}`);
  console.log(`[MLC DEBUG] Username length: ${username?.length || 0}, Password length: ${password?.length || 0}`);

  if (!username || !password) {
    console.warn("[MLC] No credentials found, skipping MLC enrichment");
    console.warn(`[MLC] process.env keys: ${Object.keys(process.env).filter(k => k.includes('MLC')).join(', ')}`);
    return tracks.map(t => ({
      trackId: t.id,
      hasPublisher: false,
      publisherNames: [],
      writerNames: [],
      error: "MLC credentials not configured",
    }));
  }

  const client = new MLCApiClient(username, password);
  const CONCURRENCY = 5;

  console.log(`[MLC] Starting publisher lookup for ${tracks.length} tracks (${CONCURRENCY} concurrent)...`);

  const results: MLCEnrichmentResult[] = [];

  for (let i = 0; i < tracks.length; i += CONCURRENCY) {
    const batch = tracks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(track => enrichSingleTrack(track, client))
    );
    results.push(...batchResults);
  }

  console.log(`[MLC] Completed: ${results.filter(r => r.hasPublisher).length}/${tracks.length} tracks have publishers`);
  
  return results;
}
