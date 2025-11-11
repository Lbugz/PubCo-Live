import { execSync } from "child_process";

const MLC_USERNAME = process.env.MLC_USERNAME;
const MLC_PASSWORD = process.env.MLC_PASSWORD;
const MLC_API_BASE_URL = "https://public-api.themlc.com";

function getChromiumPath(): string | undefined {
  try {
    const chromiumPath = execSync("which chromium || which chromium-browser || which google-chrome", {
      encoding: "utf8",
    }).trim();
    return chromiumPath || undefined;
  } catch (error) {
    console.warn("[MLC Portal] Could not find system chromium, will use Puppeteer's bundled browser");
    return undefined;
  }
}

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

export function determinePublisherStatus(publishers: MLCPublisher[]): PublisherStatus {
  if (!publishers || publishers.length === 0) {
    return "unsigned";
  }

  const publisherNames = publishers.map(p => p.publisherName.toLowerCase());
  
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
    
    const response = await fetch(`${MLC_API_BASE_URL}/works`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        mlcsongCode: mlcSongCode,
      }]),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[MLC] No work found for Song Code: ${mlcSongCode}`);
        return null;
      }
      throw new Error(`MLC API error: ${response.status} ${response.statusText}`);
    }

    const works: MLCWork[] = await response.json();
    
    if (!works || works.length === 0) {
      console.log(`[MLC] No work found for Song Code: ${mlcSongCode}`);
      return null;
    }

    const work = works[0];
    console.log(`[MLC] Found work: "${work.primaryTitle}" with ${work.publishers?.length || 0} publishers`);
    
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

export async function scrapeMLCPortal(isrc: string): Promise<{
  publisherName: string | null;
  publisherStatus: PublisherStatus;
  collectionShare: string | null;
  ipiNumber: string | null;
  iswc: string | null;
  mlcSongCode: string | null;
  writers: string[];
} | null> {
  const puppeteer = await import("puppeteer");
  let browser;

  try {
    console.log(`[MLC Portal] Searching for ISRC: ${isrc}`);
    
    const chromiumPath = getChromiumPath();
    
    browser = await puppeteer.default.launch({
      headless: true,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto("https://portal.themlc.com/search", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    console.log("[MLC Portal] Loaded search page");

    await page.waitForSelector('input[placeholder*="ISRC"], input[name*="isrc"], input[type="text"]', { timeout: 10000 });

    const searchInput = await page.$('input[placeholder*="ISRC"], input[name*="isrc"], input[type="text"]');
    if (!searchInput) {
      throw new Error("Could not find search input");
    }

    await searchInput.type(isrc);
    console.log(`[MLC Portal] Entered ISRC: ${isrc}`);

    await Promise.race([
      page.waitForSelector('button[type="submit"]', { timeout: 5000 }).then(btn => btn?.click()),
      page.keyboard.press("Enter"),
    ]);

    console.log("[MLC Portal] Submitted search");

    try {
      await page.waitForNetworkIdle({ timeout: 10000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      console.log("[MLC Portal] Network idle timeout, continuing with extraction");
    }

    console.log("[MLC Portal] Extracting results...");

    const extractedData = await page.evaluate(() => {
      const results = {
        publishers: [],
        writers: [],
        iswc: null,
        songCode: null,
      };

      const allText = document.body.innerText;
      
      const iswcMatch = allText.match(/ISWC[:\s]+([A-Z0-9\-\.]+)/i);
      if (iswcMatch) results.iswc = iswcMatch[1];

      const songCodeMatch = allText.match(/MLC Song Code[:\s]+([A-Z0-9\-]+)/i);
      if (songCodeMatch) results.songCode = songCodeMatch[1];

      const publisherElements = document.querySelectorAll(
        '[class*="publisher"], [data-testid*="publisher"], td:contains("Publisher"), .publisher-name'
      );
      publisherElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && !text.toLowerCase().includes("publisher name")) {
          results.publishers.push(text);
        }
      });

      const writerElements = document.querySelectorAll(
        '[class*="writer"], [data-testid*="writer"], td:contains("Writer"), .writer-name'
      );
      writerElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && !text.toLowerCase().includes("writer name")) {
          results.writers.push(text);
        }
      });

      if (results.publishers.length === 0) {
        const rows = document.querySelectorAll("tr");
        rows.forEach(row => {
          const cells = row.querySelectorAll("td");
          cells.forEach((cell, idx) => {
            const text = cell.textContent?.trim().toLowerCase() || "";
            if (text.includes("publisher") && cells[idx + 1]) {
              const pubName = cells[idx + 1].textContent?.trim();
              if (pubName && pubName.length > 2) {
                results.publishers.push(pubName);
              }
            }
            if (text.includes("writer") && cells[idx + 1]) {
              const writerName = cells[idx + 1].textContent?.trim();
              if (writerName && writerName.length > 2) {
                results.writers.push(writerName);
              }
            }
          });
        });
      }

      return results;
    });

    console.log(`[MLC Portal] Found ${extractedData.publishers.length} publishers, ${extractedData.writers.length} writers`);

    if (extractedData.publishers.length === 0 && extractedData.writers.length === 0) {
      console.log("[MLC Portal] No results found for ISRC");
      return null;
    }

    const publishers: MLCPublisher[] = extractedData.publishers.map(name => ({
      publisherId: "",
      publisherName: name,
      publisherIpiNumber: "",
      publisherRoleCode: "",
      collectionShare: 0,
      mlcPublisherNumber: "",
    }));

    const publisherStatus = determinePublisherStatus(publishers);
    const primaryPublisher = publishers.length > 0 ? publishers[0] : null;

    return {
      publisherName: primaryPublisher?.publisherName || null,
      publisherStatus,
      collectionShare: null,
      ipiNumber: null,
      iswc: extractedData.iswc,
      mlcSongCode: extractedData.songCode,
      writers: extractedData.writers,
    };
  } catch (error) {
    console.error(`[MLC Portal] Error scraping for ISRC ${isrc}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
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
  try {
    const recording = await searchRecordingByISRC(isrc);
    
    if (!recording || !recording.mlcsongCode) {
      console.log(`[MLC] No recording found or missing MLC Song Code for ISRC: ${isrc}`);
      return scrapeMLCPortal(isrc);
    }

    const work = await getWorkByMlcSongCode(recording.mlcsongCode);
    
    if (!work) {
      return scrapeMLCPortal(isrc);
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

    const writers = work.writers.map(w => 
      `${w.writerFirstName} ${w.writerLastName}`.trim()
    ).filter(Boolean);

    return {
      publisherName: primaryPublisher?.publisherName || null,
      publisherStatus,
      collectionShare,
      ipiNumber: writerIPI,
      iswc: work.iswc || null,
      mlcSongCode: work.mlcSongCode || null,
      writers,
    };
  } catch (error) {
    console.error(`[MLC] Error enriching track with ISRC ${isrc}:`, error);
    return null;
  }
}
