# **AI Pub Feed — Discovery Platform Overview**

## **Internal A&R Team Guide**

**Last Updated:** November 18, 2025  
**Platform Link:** [https://pubco.replit.app](https://pubco.replit.app/playlists)

---

## **What It Does**

AI Pub Feed automatically discovers unsigned artists and unpublished songwriters from Spotify playlists, enriches their metadata, scores their commercial potential, and manages outreach through a built-in CRM system with real-time progress tracking.

---

## **Current Platform Statistics**
*(As of November 18, 2025)*

- **22 Tracked Playlists** — Mix of Fresh Finds, editorial, and custom playlists
- **1,506 Total Tracks** — Ingested and tracked across all playlists
- **807 Active Contacts** — Songwriters in the publishing pipeline
  - Discovery Pool: 805 contacts (<100K streams)
  - Watch List: 1 contact (100K–1M streams)
  - Active Search: 1 contact (>1M streams)

*To refresh these statistics, query the database tables: `tracked_playlists`, `playlist_snapshots`, and `contacts`.*

---

## **Known API Issues**

### **Chartmetric API**
- **Status:** ⚠️ Limited Functionality (Enterprise tier restrictions)
- **Impact:** Playlist metadata and track endpoints require Enterprise access
- **Mitigation:** Intelligent fallback to Spotify API with automatic retry logic
- **Support Ticket:** Opened November 14, 2025

### **MLC API**
- **Status:** ✅ Operational with graceful degradation
- **Impact:** OAuth authentication working, credentials required for full functionality
- **Mitigation:** System continues without MLC data if credentials not configured
- **Support Ticket:** Opened November 14, 2025 (proactive monitoring)

---

# **1️⃣ Playlist Tracking**

### **Purpose**

Ingest Spotify playlists (Fresh Finds, editorial, or custom) to detect emerging talent and build weekly snapshots of new tracks.

### **How It Works**

- Supports both public and editorial playlists (scraping fallback for restricted ones)
- Automatically pulls all track metadata (artist, album, release date)
- Tracks songs weekly across multiple Fresh Finds and custom playlists
- Optional weekly auto-refresh (set `ENABLE_AUTO_SCRAPE=true` in environment)

### **During Fetch**

### **Playlist Metadata Retrieval**

- **Chartmetric-First Approach:** Attempts Chartmetric API first for analytics and cross-platform identifiers
- **Spotify API Fallback:** Falls back to Spotify API for public playlists if Chartmetric unavailable
- **Editorial Playlist Scraping:** Uses Puppeteer with GraphQL network capture for editorial playlists (RapCaviar, Fresh Finds)
  - Intercepts Spotify's internal pathfinder API responses
  - Extracts metadata (name, curator, followers, track count) via network analysis
  - Shared browser architecture with auth monitoring
- Captures playlist name, curator, follower count, and track total

### **Track Metadata Collection**

- Pulls title, artist names, album data, Spotify URL, Spotify Track ID
- Saves album artwork thumbnails (medium-sized 300px images)
- Stores playlist context for each track (via `playlist_snapshots` table)
- Creates snapshot timestamps for historical comparisons

### **Automatic Enrichment Trigger**

- New tracks enter the enrichment queue instantly via background worker
- PostgreSQL-backed job queue with atomic job claiming
- Worker processes up to 50 tracks per batch with crash recovery
- Real-time progress visible in the **Activity Panel** (bottom-right corner)
- WebSocket broadcasts for live `track_enriched` events
- Enrichment phases add ISRCs, credits, stream counts, and more

### **Duplicate Prevention**

- Detects existing tracks via Spotify Track ID
- Cross-references tracks that appear across multiple playlists
- Prevents redundant enrichment jobs
- Skips duplicate tracks with toast notification

### **Key User Actions**

1. Open **Playlists** page
2. Click **Add Playlist** (blue gradient button), paste a Spotify URL
3. Fetch completes in 2–10 seconds with toast confirmation
4. Enrichment begins immediately in the background
5. Monitor progress in **Activity Panel** for live updates

---

# **2️⃣ Multi-Phase Enrichment Pipeline**

### **Purpose**

Convert raw playlist tracks into complete, rights-relevant metadata for scouting and publishing decisions through a four-phase enrichment process.

---

## **Phase 1 — Spotify API Batch Enrichment**

### **What Happens**

- **Batch Processing:** Groups up to 50 tracks per API call for efficiency
- **ISRC Recovery:** Extracts ISRCs from Spotify track metadata
- **Label Identification:** Captures album label information (independent vs. major)
- **Release Metadata:** Pulls release dates, popularity scores, duration, explicit flags
- **Audio Features:** Retrieves danceability, energy, valence, tempo, key, mode
- **Artist Data:** Collects artist genres and follower counts
- **Album Artwork:** Extracts medium-sized (300px) album images

### **Outcome**

✔️ Nearly 100% ISRC recovery rate for valid tracks  
✔️ Complete track metadata foundation for scoring

---

## **Phase 2 — Web Scraping (Puppeteer)**

### **What Happens**

- Extracts songwriter/producer credits from Spotify track pages
- Scrapes real-time stream counts directly from Spotify
- Captures metadata missing from API responses
- Uses tiered rate limiting to prevent blocking
- Shared browser session with cookie persistence for auth

### **Outcome**

✔️ Reveals unsigned writers and missing publishing metadata  
✔️ Provides accurate stream counts for scoring

---

## **Phase 3 — MusicBrainz Lookup**

### **What Happens**

- Queries MusicBrainz API by ISRC and track metadata
- Retrieves songwriter/publisher details when available
- Adds global creator identifiers (MusicBrainz IDs)
- Adheres to strict rate limiting (1 request/second)

### **Outcome**

✔️ Provides deeper publishing context for rights evaluation  
✔️ Supplements missing writer information

---

## **Phase 4 — MLC Publisher Search**

### **What Happens**

- Queries The MLC (Mechanical Licensing Collective) Public Search API
- Identifies publisher relationships tied to ISRCs
- Confirms unsigned/unpublished status via U.S. mechanical rights
- Uses OAuth 2.0 authentication with token caching
- Graceful degradation when credentials not configured

### **Status**

✅ **Operational** — Authentication working with graceful fallback  
- Automatically retries on 401 errors (clears cached token)
- Skips MLC enrichment if `MLC_USERNAME` and `MLC_PASSWORD` not set
- Logs detailed error messages for troubleshooting

---

### **Worker Architecture**

- **Standalone Enrichment Worker:** Separate process from API server
- **PostgreSQL Job Queue:** Atomic job claiming with row-level locking
- **Crash Recovery:** Abandoned jobs automatically reclaimed after timeout
- **Graceful Shutdown:** SIGTERM/SIGINT handlers for clean job cleanup
- **Concurrency Control:** `p-limit` for managing parallel enrichment tasks
- **Phase Tracking:** Each job tracks progress through 4 enrichment phases

### **Enrichment Actions**

- Runs automatically after playlist ingestion
- Monitor via **Activity Panel** (bottom-right, persistent job tracker)
- Re-enrich any track via actions menu dropdown
- Phase 1 completes in ~30 seconds per 50 tracks (Spotify API batch)
- Phase 2 takes ~2–3 minutes per track (Puppeteer scraping)
- Manual enrichment uses `skipQueueWait=true` to prevent deadlock

---

# **3️⃣ Real-Time UX Features**

### **Activity Panel** *(New)*

- **Persistent Job Tracker:** Bottom-right corner, shows live enrichment progress
- **Reduces Toast Noise:** Long-running jobs display in panel instead of toasts
- **Phase-by-Phase Updates:** Shows current phase, tracks processed, and completion %
- **Collapsible:** Minimize when not needed, expands on new activity

### **4-Tier Toast Notification System** *(New)*

- **Success (Green):** Completed operations with checkmark icon
- **Info (Blue):** Informational updates with info icon
- **Warning (Yellow):** Non-critical issues with alert icon
- **Destructive (Red):** Errors and failures with X icon
- **Colored Left Borders:** Visual distinction between severity levels
- **Normalized Copy:** Consistent messaging (e.g., "3 playlists · 45 new tracks · 12 duplicates skipped")

### **Clickable Songwriter Names** *(New)*

- **Interactive Contacts Table:** Songwriter names are clickable links
- **Quick Access:** Opens contact detail drawer on click
- **Visual Feedback:** Cursor pointer, hover elevation, text-primary color
- **Expanded Clickable Area:** Entire name cell is interactive

### **WebSocket Live Updates**

- **Real-Time Broadcasts:** `track_enriched` events pushed to connected clients
- **Auto-Refresh:** Track tables update without manual refresh
- **Job Progress:** Live updates for enrichment job status
- **Connection Monitoring:** Automatic reconnection on disconnect

---

# **4️⃣ Proprietary Scoring Algorithm**

### **Purpose**

Assign a 1–10 score indicating unsigned/unpublished likelihood and commercial potential. The algorithm prioritizes publishing metadata gaps as the strongest signal of unsigned opportunity.

---

## **Scoring Methodology**

The algorithm uses a **point-based rubric system** that evaluates multiple signals. Scores are capped at 10 (maximum opportunity) and floored at 0.

### **Scoring Rubric**

| Signal | Points | Criteria | Rationale |
|--------|--------|----------|-----------|
| **Missing Publisher** | +5 | No publisher listed in metadata | **Highest priority** - Direct indicator of unsigned publishing opportunity |
| **Missing Writer** | +3 | No songwriter credits in metadata | Metadata gap suggesting potential self-written/DIY artist |
| **Self-Written + Fresh Finds** | +3 | Artist wrote own song + appears on Fresh Finds playlist | Editorial validation + self-publishing signal |
| **Self-Written + Indie Label** | +2 | Artist wrote own song + independent/DIY label | Self-released + self-written = strong unsigned indicator |
| **High Stream Velocity** | +2 | >50% week-over-week growth | Urgent opportunity - rapid momentum |
| **Medium Stream Velocity** | +1 | >20% week-over-week growth | Watch closely - building momentum |

### **Self-Written Detection**

The algorithm includes intelligent **artist-songwriter name matching** to identify self-written tracks:

- Normalizes both artist name and songwriter field (lowercase, trimmed)
- Handles common variations: "Artist Name, Other Writer"
- Partial matching: checks if songwriter field contains artist name or vice versa
- Only awards bonuses when artist is confirmed as songwriter

**Example Matches:**
- Artist: "Olivia Rodrigo" → Songwriter: "olivia rodrigo" ✅
- Artist: "The 1975" → Songwriter: "The 1975, George Daniel" ✅
- Artist: "Drake" → Songwriter: "Aubrey Graham" ❌ (different names)

### **Label Classification**

Independent/DIY labels are detected via regex pattern matching:
- Keywords: `DK`, `DIY`, `indie`, `independent` (case-insensitive)
- Only contributes points if **artist is also the songwriter**
- Hired songwriters for major artists still score high (no major label penalty)

---

## **Scoring Examples**

### **Score 10 — Highest Priority Lead**
```
✓ Missing Publisher (+5)
✓ Missing Writer (+3)
✓ High Stream Velocity (+2)
= 10/10 (capped)
```
**Profile:** Self-released artist with no publishing metadata and explosive growth

---

### **Score 8 — Strong Unsigned Signal**
```
✓ Missing Publisher (+5)
✓ Self-Written + Fresh Finds (+3)
= 8/10
```
**Profile:** Editorial-validated emerging artist with publishing gap

---

### **Score 7 — Quality Lead**
```
✓ Missing Publisher (+5)
✓ Self-Written + Indie Label (+2)
= 7/10
```
**Profile:** Independent artist managing own publishing

---

### **Score 5 — Moderate Opportunity**
```
✓ Missing Publisher (+5)
= 5/10
```
**Profile:** Basic publishing metadata gap, needs investigation

---

### **Score 3 — Low Priority**
```
✓ Missing Writer (+3)
= 3/10
```
**Profile:** Minor metadata gap, likely hired songwriter on major label

---

## **Score Distribution Guide**

| Score Range | Priority | Recommended Action |
|-------------|----------|-------------------|
| **9-10** | 🔥 Hot Lead | Immediate outreach - multiple high-value signals |
| **7-8** | ⭐ Strong Lead | Prioritize for research and contact |
| **5-6** | ⚡ Moderate Lead | Add to watch list, monitor growth |
| **3-4** | 📊 Low Lead | Track for metadata updates |
| **0-2** | ❄️ Minimal Lead | Likely signed or insufficient data |

---

## **Algorithm Philosophy**

### **Why Publisher > Writer?**
Missing publisher metadata is weighted **5 points** (vs. 3 for missing writer) because:
- Direct indicator of unsigned publishing opportunity
- More actionable for A&R outreach
- Clearer business opportunity signal

### **No Major Label Penalty**
The algorithm intentionally **does not penalize major label tracks** because:
- Hired songwriters can write for major artists and still be unsigned publishers
- Publishing rights are independent of master recording rights
- Focuses on songwriter/publisher gaps, not artist's label status

### **Fresh Finds Bonus Logic**
Fresh Finds bonus only applies when **artist wrote the song themselves** because:
- Combines editorial validation (Spotify curation) with self-publishing signal
- Self-written + editorial placement = strong emerging talent indicator
- Filters out hired songwriters on curated playlists

### **Stream Velocity Multiplier**
Growth velocity adds urgency to existing signals:
- >50% WoW growth = act now (momentum building)
- >20% WoW growth = watch closely (steady growth)
- Complements metadata gaps with market validation

**Data Source & Calculation:**
1. **Stream Counts:** Extracted during enrichment Phase 2 (Puppeteer scraping)
   - Primary: Chartmetric API (`/track/:id/spotify/stats`)
   - Fallback: Web scraping from Spotify track pages
   - Stored in `playlist_snapshots.spotifyStreams` column
2. **Weekly Snapshots:** Automated job runs every Monday at 1:00 AM
   - Captures current stream counts for all tracks
   - Compares to previous week's snapshot
   - Formula: `(Current - Previous) / Previous × 100 = WoW %`
3. **Contact Aggregation:** WoW % averaged across all songwriter's tracks
   - Stored in `contacts.wowGrowthPct` column
   - Used by scoring algorithm to award velocity bonuses
4. **Automation:** Requires `ENABLE_AUTO_SCRAPE=true` environment variable
   - Job: "Weekly Performance Snapshots" (Mondays 1AM)
   - Manual trigger available via: `POST /api/performance/snapshots`

---

## **User Actions**

- **View Scores:** Tracks page with sortable "Score" column
- **Filter Leads:** Use filter bar to show only score ≥7 (quality leads)
- **Export CSV:** Download enriched metadata with scores for external research
- **Auto-Updates:** Scores recalculate after each enrichment phase
- **Chartmetric Integration:** Cross-platform analytics provide additional context

---

## **Technical Implementation**

- **Location:** `server/scoring.ts`
- **Trigger:** Calculated during enrichment Phase 1 (Spotify API)
- **Updates:** Recalculated when metadata changes (publisher, writer, WoW %)
- **Storage:** Persisted in `playlist_snapshots.unsigned_score` column
- **Range:** Always between 0-10 (min/max constraints)

---

# **5️⃣ Contacts CRM & Funnel Management**

### **Purpose**

Track writer discovery, growth, and outreach in a structured publishing pipeline with comprehensive relationship management.

### **Stages**

- **Discovery Pool** — <100K streams (805 contacts)
- **Watch List** — 100K–1M streams or >20% WoW growth (1 contact)
- **Active Search** — >1M streams or >50% WoW growth (1 contact)

### **CRM Features**

#### **Global Dashboard**
- Total contacts, hot leads, funnel breakdown
- Stage distribution with color-coded badges
- Unsigned percentage metrics

#### **Filterable Table**
- Search by songwriter name
- Filter by stage (Discovery, Watch, Active Search)
- Quick filters: Hot Leads, Chartmetric Linked, Positive WoW Growth
- Sortable columns: streams, track count, WoW %, stage

#### **Contact Detail Drawer**
- **Stats Section:**
  - Total streams, track count, WoW %
  - Hot lead indicator (flame icon)
  - Chartmetric link if available
- **Quick Actions:**
  - Toggle hot lead status
  - Move to different pipeline stage
  - Mark outreach started
  - Add to custom tags
- **Tabbed Interface:**
  - **Tracks:** Related songs with enrichment status
  - **Performance:** Weekly stream snapshots, growth charts
  - **Activity:** Interaction history (DMs, emails, calls, meetings)
  - **Notes:** Pinnable notes for team collaboration
  - **Alerts:** Stream thresholds, velocity spikes, inactivity warnings

#### **Relationship Tracking**
- Log outreach activities: DM, Email, Call, Meeting, Social Touch
- Track interaction timestamps and types
- Monitor relationship progression through stages
- Auto-promotion based on stream velocity

#### **Performance Monitoring**
- Weekly performance snapshots (streams, followers, WoW %)
- Automatic WoW calculations
- Historical trend visualization
- Growth acceleration alerts

#### **Bulk Actions** *(Available)*
- Select multiple contacts via checkboxes
- Update stage in bulk
- Assign tags to multiple contacts
- Sticky glassmorphism toolbar for bulk operations

---

# **6️⃣ System Architecture**

### **Frontend**
- **React + TypeScript** — Component-based UI with type safety
- **TanStack Query** — Data fetching, caching, real-time updates
- **Wouter** — Lightweight client-side routing
- **Shadcn UI + Tailwind CSS** — Professional design system
- **WebSocket Client** — Real-time job progress updates

### **Backend**
- **Express.js + Node.js** — RESTful API server
- **PostgreSQL (Neon)** — Managed database with foreign key integrity
- **Drizzle ORM** — Type-safe database queries
- **WebSocket Server** — Real-time event broadcasting on `/ws`

### **Worker Process**
- **Standalone Enrichment Worker** — Separate from API server
- **Job Queue** — PostgreSQL-backed with atomic claiming
- **Crash Recovery** — Automatic job reclamation after timeout
- **Graceful Shutdown** — Clean job cleanup on SIGTERM/SIGINT

### **Integrations**
- **Spotify API** — OAuth 2.0, playlist/track metadata
- **Chartmetric API** — Cross-platform analytics, ISRC matching
- **MusicBrainz API** — Songwriter/publisher metadata
- **The MLC API** — OAuth-based publisher ownership data
- **Puppeteer + Chromium** — Web scraping for editorial playlists and credits

### **Automation**
- **Node-Cron Scheduler** — Weekly Fresh Finds updates (Fridays 9AM)
- **Failed Enrichment Retry** — Daily retry job (2AM)
- **Weekly Performance Snapshots** — Mondays 1AM for WoW % tracking
- **Auto-Enrichment** — Triggers immediately after playlist fetch

---



# **8️⃣ Key Differentiators**

### **Editorial Playlist Capture**
- GraphQL network interception for restricted playlists
- Shared browser architecture with auth monitoring
- Cookie persistence for authentication continuity
- Reliable metadata extraction vs. brittle DOM selectors

### **Intelligent Fallback System**
- Chartmetric → Spotify API → Puppeteer scraper cascade
- Graceful degradation when APIs unavailable
- MLC integration with credential-based activation

### **Real-Time UX**
- Activity Panel for persistent job tracking
- 4-tier toast system with severity-based design
- WebSocket live updates without polling
- Clickable elements for faster navigation

### **Data Integrity**
- Foreign key constraints across all relationships
- Duplicate prevention via Spotify Track IDs
- Atomic job claiming prevents concurrent conflicts
- Database-level pagination for performance

---

## **Final Note**

This system provides an end-to-end pipeline for playlist-driven A&R sourcing, metadata enrichment, publishing intelligence, and relationship management. It is designed to surface opportunities early and provide clear, data-driven workflows for scouting and outreach with professional-grade real-time UX.
