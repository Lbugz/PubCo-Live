import puppeteer from "puppeteer";

// Helper function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parseFollowerCount(followerText: string): number | null {
  if (!followerText) return null;
  
  const cleaned = followerText.replace(/followers?/i, '').trim();
  const match = cleaned.match(/^([0-9,.]*)\s*([KMB])?$/i);
  if (!match) return null;
  
  const numberPart = match[1].replace(/,/g, '');
  const suffix = match[2]?.toUpperCase();
  
  let value = parseFloat(numberPart);
  if (isNaN(value)) return null;
  
  switch (suffix) {
    case 'K': value *= 1e3; break;
    case 'M': value *= 1e6; break;
    case 'B': value *= 1e9; break;
  }
  
  return Math.floor(value);
}

export interface NetworkCaptureTrack {
  trackId: string;
  isrc: string | null;
  name: string;
  artists: string[];
  album: string | null;
  albumArt: string | null;
  addedAt: Date;
  popularity: number | null;
  durationMs: number | null;
  spotifyUrl: string;
}

export interface NetworkCaptureResult {
  success: boolean;
  tracks: NetworkCaptureTrack[];
  totalCaptured: number;
  playlistName?: string | null;
  curator?: string | null;
  followers?: number | null;
  imageUrl?: string | null;
  error?: string;
}

export async function fetchEditorialTracksViaNetwork(
  playlistUrl: string
): Promise<NetworkCaptureResult> {
  console.log(`[Network Capture] Starting for: ${playlistUrl}`);
  console.log(`[Network Capture] Running in headless mode with saved cookies...`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
      headless: true, // Run in headless mode (Replit has no X server)
      args: [
        "--window-size=1440,900",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: { width: 1440, height: 900 },
    });

    const [page] = await browser.pages();
    
    // Load saved cookies if available
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      if (fs.existsSync(cookiesPath)) {
        const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log(`[Network Capture] Loaded ${cookies.length} saved cookies`);
      } else {
        console.log(`[Network Capture] No saved cookies found, will need manual login`);
      }
    } catch (err) {
      console.warn('[Network Capture] Failed to load cookies:', err);
    }
    
    // Accumulator for captured data
    const seenOffsets = new Set<number>();
    const allItems: any[] = [];
    const capturedTracks = new Set<string>(); // Track duplicate tracks from GraphQL
    let graphQLMetadata: any = null; // Store playlist metadata from GraphQL
    
    // Intercept network responses - capture ALL JSON to see what Spotify uses
    let responseCount = 0;
    page.on("response", async (res) => {
      const url = res.url();
      
      // DEBUG: Log ALL Spotify requests to see what's happening
      if (url.includes('spotify.com') || url.includes('spclient')) {
        responseCount++;
        if (responseCount <= 10) { // Only log first 10 to avoid spam
          console.log(`[Network Capture] Response #${responseCount}: ${url.substring(0, 120)}`);
          console.log(`[Network Capture] Content-Type: ${res.headers()["content-type"]}`);
        }
      }
      
      // Only process JSON responses from Spotify domains
      if (!url.includes('spotify.com') && !url.includes('spclient')) return;
      
      try {
        const ct = (res.headers()["content-type"] || "").toLowerCase();
        if (!ct.includes("application/json")) return;
        
        const json = await res.json();
        
        // DEBUG: Log ALL JSON responses to see what Spotify is returning
        console.log(`[Network Capture] JSON from: ${url.substring(0, 120)}`);
        console.log(`[Network Capture] JSON keys: ${Object.keys(json).join(', ')}`);
        
        // Check for Spotify's NEW GraphQL pathfinder API format
        if (url.includes('pathfinder') && json?.data?.playlistV2?.content?.items) {
          const playlistV2 = json.data.playlistV2;
          const graphqlItems = playlistV2.content.items;
          console.log(`[Network Capture] ✅ Found ${graphqlItems.length} tracks in pathfinder GraphQL response!`);
          
          // Extract playlist metadata from GraphQL (only if not already captured)
          if (!graphQLMetadata) {
            // DEBUG: Log full playlistV2 structure to understand followers field
            console.log('[Network Capture] 🔍 DEBUG - playlistV2 keys:', Object.keys(playlistV2));
            console.log('[Network Capture] 🔍 DEBUG - playlistV2.followers:', JSON.stringify(playlistV2.followers, null, 2));
            console.log('[Network Capture] 🔍 DEBUG - playlistV2.ownerV2:', JSON.stringify(playlistV2.ownerV2, null, 2));
            
            graphQLMetadata = {
              name: playlistV2.name,
              curator: playlistV2.ownerV2?.data?.name || playlistV2.owner?.name,
              followers: playlistV2.followers?.totalCount || null,
              imageUrl: playlistV2.images?.items?.[0]?.sources?.[0]?.url || playlistV2.images?.[0]?.url,
            };
            console.log(`[Network Capture] 📊 Extracted GraphQL metadata: name="${graphQLMetadata.name}", curator="${graphQLMetadata.curator}", followers=${graphQLMetadata.followers}`);
          }
          
          // Parse GraphQL pathfinder format: data.playlistV2.content.items[]
          for (const item of graphqlItems) {
            try {
              const trackData = item?.itemV2?.data;
              if (!trackData || trackData.__typename !== 'Track') continue;
              
              const trackUri = trackData.uri;
              const trackId = trackUri?.split(':').pop();
              if (!trackId) continue;
              
              // Skip duplicates
              if (capturedTracks.has(trackId)) continue;
              capturedTracks.add(trackId);
              
              const trackName = trackData.name || '';
              const artistNames = trackData.artists?.items?.map((a: any) => a.profile?.name).filter(Boolean) || [];
              const albumName = trackData.albumOfTrack?.name || null;
              
              // CRITICAL FIX: Extract ISRC from GraphQL response
              // DEBUG: Log structure for first track to understand ISRC location
              if (allItems.length === 0) {
                console.log('[Network Capture] 🔍 DEBUG - First track structure:');
                console.log('trackData keys:', Object.keys(trackData));
                console.log('trackData.trackUnion:', trackData.trackUnion);
                console.log('trackData.externalIds:', trackData.externalIds);
                console.log('trackData.isrc:', trackData.isrc);
              }
              
              const isrc = trackData.trackUnion?.isrc || 
                          trackData.externalIds?.isrc || 
                          trackData.isrc || 
                          null;
              
              if (allItems.length === 0 && isrc) {
                console.log(`[Network Capture] ✅ Found ISRC: ${isrc}`);
              } else if (allItems.length === 0 && !isrc) {
                console.warn('[Network Capture] ⚠️  ISRC not found in trackData! Need to check GraphQL structure.');
              }
              
              allItems.push({
                id: trackId,
                name: trackName,
                artists: artistNames,
                album: albumName,
                uri: trackUri,
                external_ids: { isrc }, // Add ISRC so line 357 can find it
              });
            } catch (err) {
              console.error('[Network Capture] Error parsing pathfinder track:', err);
            }
          }
          
          console.log(`[Network Capture] Total captured from pathfinder: ${allItems.length} unique tracks`);
          return; // Skip old format parsing
        }
        
        // Log all Spotify JSON responses to understand their structure
        if (json?.items || json?.tracks || json?.content) {
          console.log(`[Network Capture] ✅ Found items/tracks/content array (OLD FORMAT)!`);
        }
        
        // Check for various OLD response formats Spotify might use (fallback)
        let items = null;
        if (json?.items && Array.isArray(json.items)) {
          items = json.items;
        } else if (json?.tracks?.items && Array.isArray(json.tracks.items)) {
          items = json.tracks.items;
        } else if (json?.content?.items && Array.isArray(json.content.items)) {
          items = json.content.items;
        }
        
        if (items && items.length > 0) {
          // Try to infer offset from URL
          const urlObj = new URL(url);
          const offset = Number(urlObj.searchParams.get("offset") || urlObj.searchParams.get("fromRow") || 0);
          
          if (!seenOffsets.has(offset)) {
            seenOffsets.add(offset);
            allItems.push(...items);
            console.log(`[Network Capture] ✅ Captured page offset=${offset} count=${items.length} total=${allItems.length}`);
          }
        }
      } catch (err: any) {
        // Log parsing errors to debug
        if (url.includes('playlist') || url.includes('track')) {
          console.log(`[Network Capture] ⚠️  Error parsing response from: ${url.substring(0, 100)}`);
          console.log(`[Network Capture] Error: ${err.message}`);
        }
      }
    });
    
    // Navigate to the playlist
    console.log(`[Network Capture] Navigating to playlist...`);
    await page.goto(playlistUrl, { 
      waitUntil: "networkidle2",
      timeout: 60000 
    });
    
    // Check if we hit a login wall
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`[Network Capture] Page loaded: ${pageTitle} (${pageUrl})`);
    
    // Check for login or cookie consent
    const needsLogin = pageUrl.includes('/login') || pageUrl.includes('/authorize');
    
    if (needsLogin) {
      console.log(`[Network Capture] ⚠️  Spotify login required. Waiting 30 seconds for manual login...`);
      await wait(30000);
    }
    
    // Handle cookie consent banner
    console.log(`[Network Capture] Checking for cookie consent banner...`);
    const consentSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="onetrust-accept"]',
      'button[aria-label*="Accept"]',
      'button[aria-label*="accept"]',
      '[data-testid="accept-all-cookies"]',
      'button[id*="accept"]',
      'button[id*="agree"]',
    ];
    
    let consentAccepted = false;
    for (const selector of consentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        console.log(`[Network Capture] ✅ Accepted cookie consent using: ${selector}`);
        await wait(2000);
        consentAccepted = true;
        break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!consentAccepted) {
      console.log(`[Network Capture] No cookie consent banner found (already accepted or not shown)`);
    }
    
    // Wait for initial content to load
    await wait(3000);
    
    console.log(`[Network Capture] Captured ${allItems.length} items so far from initial load`);
    
    // Scroll to trigger additional page loads
    console.log(`[Network Capture] Scrolling to trigger pagination...`);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel({ deltaY: 800 });
      await wait(700);
    }
    
    // Wait for any late requests
    await wait(2000);
    
    // Extract playlist metadata (name, curator, followers, artwork)
    // PRIORITY 1: Use GraphQL metadata if available (most reliable)
    let playlistName: string | null = graphQLMetadata?.name || null;
    let curator: string | null = graphQLMetadata?.curator || null;
    let followers: number | null = graphQLMetadata?.followers || null;
    let imageUrl: string | null = graphQLMetadata?.imageUrl || null;
    
    // FALLBACK: Try DOM extraction if GraphQL didn't provide complete metadata
    if (!playlistName || !curator || !followers || !imageUrl) {
      console.log(`[Network Capture] GraphQL metadata incomplete, trying DOM fallback...`);
      try {
        const metadata = await page.evaluate(() => {
          // Extract playlist name - be specific to avoid sidebar elements
          const nameElement = document.querySelector('[data-testid="playlist-page"] h1[data-encore-id="type"]')
                             || document.querySelector('main h1[data-encore-id="type"]')
                             || document.querySelector('h1[data-encore-id="type"]');
          let name = nameElement?.textContent?.trim() || null;
          
          // Fallback to page title if element not found or contains "null"
          if (!name || name === "null" || name === "Your Library") {
            const titleMatch = document.title.match(/^([^|]+)/);
            name = titleMatch ? titleMatch[1].trim() : null;
          }
          
          const curatorElement = document.querySelector('[data-testid="entityHeaderSubtitle"] a')
                                || document.querySelector('[data-testid="entityHeaderSubtitle"] span')
                                || document.querySelector('div[data-testid="entity-subtitle"]');
          const curator = curatorElement?.textContent?.trim() || null;
          
          // Try multiple selectors for followers - Spotify UI changes frequently
          let followerText: string | null = null;
          const followerSelectors = [
            'button[data-testid="followers-count"]', // Old format
            '[data-testid="entity-subtitle-more-button"]', // Button with likes/followers
            '[aria-label*="followers"]',
            '[aria-label*="follower"]',
            'button:has-text("followers")', // Contains "followers" text
            '[data-testid="playlist-followers"]',
            'span:has-text("followers")', // Span containing "followers"
          ];
          
          // Try each selector
          for (const selector of followerSelectors) {
            try {
              const element = document.querySelector(selector);
              if (element?.textContent) {
                const text = element.textContent.trim();
                // Check if it contains follower info (number + "follower")
                if (text.match(/\d+.*follow/i)) {
                  followerText = text;
                  break;
                }
              }
            } catch (e) {
              // Continue to next selector
            }
          }
          
          // Fallback: Search all text nodes for follower count
          if (!followerText) {
            const allText = document.body.innerText;
            const followerMatch = allText.match(/(\d+[,\d]*\s*[KMB]?\s*followers?)/i);
            if (followerMatch) {
              followerText = followerMatch[1];
            }
          }
          
          // Extract playlist artwork - look for the cover image
          const imageElement = document.querySelector('[data-testid="playlist-image"] img')
                              || document.querySelector('[data-testid="entity-image"] img')
                              || document.querySelector('img[alt*="playlist"]')
                              || document.querySelector('main img');
          const imageUrl = imageElement?.getAttribute('src') || null;
          
          return { name, curator, followerText, imageUrl };
        });
        
        // Use DOM values only if GraphQL didn't provide them
        playlistName = playlistName || metadata.name;
        curator = curator || metadata.curator;
        
        // Parse follower count if we have the text
        if (metadata.followerText && !followers) {
          const parsed = parseFollowerCount(metadata.followerText);
          console.log(`[Network Capture] Parsing follower text: "${metadata.followerText}" → ${parsed}`);
          followers = parsed;
        }
        
        imageUrl = imageUrl || metadata.imageUrl;
        
        console.log(`[Network Capture] DOM metadata: name="${metadata.name}", curator="${metadata.curator}", followerText="${metadata.followerText}", parsedFollowers=${followers}`);
      } catch (err) {
        console.warn('[Network Capture] Failed to extract DOM metadata:', err);
      }
    }
    
    console.log(`[Network Capture] Final metadata: name="${playlistName}", curator="${curator}", followers=${followers}, artwork=${imageUrl ? 'yes' : 'no'}`);
    console.log(`[Network Capture] Metadata source: ${graphQLMetadata ? 'GraphQL (primary)' : 'DOM (fallback)'}`);
    
    // Save cookies for future use with microservice
    try {
      const cookies = await page.cookies();
      const fs = await import('fs');
      const path = await import('path');
      const cookiesPath = path.join(process.cwd(), 'spotify-cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log(`[Network Capture] Saved ${cookies.length} cookies for future microservice use`);
    } catch (err) {
      console.warn('[Network Capture] Failed to save cookies:', err);
    }
    
    await browser.close();
    browser = undefined;
    
    // Map to our schema
    const tracks: NetworkCaptureTrack[] = allItems
      .map((item: any) => {
        const track = item.track || item;
        if (!track || !track.name) return null;
        
        return {
          trackId: track.id || "",
          isrc: track.external_ids?.isrc || null,
          name: track.name,
          artists: (track.artists || []).map((a: any) => a.name).filter(Boolean),
          album: track.album?.name || null,
          albumArt: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
          addedAt: item.added_at ? new Date(item.added_at) : new Date(),
          popularity: track.popularity || null,
          durationMs: track.duration_ms || null,
          spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        };
      })
      .filter((t): t is NetworkCaptureTrack => t !== null);
    
    console.log(`[Network Capture] Success! Captured ${tracks.length} unique tracks`);
    
    return {
      success: true,
      tracks,
      totalCaptured: tracks.length,
      playlistName,
      curator,
      followers,
      imageUrl,
    };
  } catch (error: any) {
    console.error(`[Network Capture] Error:`, error.message);
    
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    
    return {
      success: false,
      tracks: [],
      totalCaptured: 0,
      error: error.message,
    };
  }
}
