# AI Pub Feed MVP

## Overview
The AI Pub Feed MVP is an automated platform designed to identify unsigned artists and unpublished songwriters from user-selected Spotify playlists. Its primary purpose is to collect trending Spotify playlist data weekly, enrich track metadata with ISRCs, labels, and writers, and then rank contributors by their likelihood of being unsigned or unpublished. This system provides actionable publishing leads for A&R professionals, streamlining the discovery of new talent.

## User Preferences
- Professional, data-focused UI
- Clean information hierarchy
- Fast data scanning and filtering
- Actionable export features

## System Architecture
The application features a modern full-stack architecture with a React, TypeScript, Tailwind CSS, and Shadcn UI frontend, an Express.js and Node.js backend, and a PostgreSQL database (Neon).

### UI/UX Decisions
The frontend is a single-page React application built with a modular component architecture, a professional design system inspired by Linear/Notion patterns, and dark/light theme toggle. It emphasizes a clean information hierarchy, fast data scanning, filtering, and actionable export features.

**Recent UI/UX Improvements (November 2025):**
- **Tracks View Header Restructure (November 11, 2025)**: Removed UnifiedControlPanel component entirely and replaced with clean inline markup matching Playlists View design. Header now features simple "Tracks" title with "Enrich Artists" button only. Stats cards, filters, and view controls integrated directly into page layout for consistency across views.
- **Default Week Filter (November 11, 2025)**: Changed default week filter from "latest" to "all" in both frontend and backend. Backend properly returns all tracks when selectedWeek is "all" instead of applying unnecessary date filtering.
- **Fetch Data Migration (November 11, 2025)**: Moved Fetch Data button from Tracks View to Playlists View header, positioned next to Add Playlist button with full dropdown functionality (fetch all, editorial only, non-editorial, specific playlists). Created shared `useFetchPlaylistsMutation` hook to centralize playlist fetching logic.
- **Visual Consistency (November 11, 2025)**: Standardized stats card grids to `grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4` across both Tracks and Playlists views. Table row padding unified at `p-4` for consistent information density.
- **Hover Interaction Fix (November 11, 2025)**: Removed `interactive-scale` class from track rows and cards to eliminate confusing expansion effect during selection operations while preserving hover gradient affordance.
- **Actions Consolidation**: Created TrackActionsDropdown component with 3-dot menu (MoreVertical icon) that consolidates all per-track actions (Enrich MB, Enrich Credits, AI Insights, Tag, Contact, Spotify link) into a single dropdown. Applied to track table, card, and kanban views.
- **Controlled Dialog Pattern**: Refactored TrackAIInsights, TrackTagPopover, and TrackContactDialog to accept controlled state (open/onOpenChange props), allowing external components to trigger them programmatically while maintaining standalone usage.
- **Auto-fetch AI Insights**: Implemented useEffect in TrackAIInsights that auto-triggers data fetching when dialog is opened externally via controlled state, ensuring insights load correctly from dropdown menu.
- **Songwriter Display Format**: Implemented "First Songwriter +2" format with expandable badge to show all songwriters, improving information density while maintaining readability.
- **Bulk Selection System**: Added checkbox-based bulk selection with cross-filter preservation using membership checking (`.every()` and `.some()`) for indeterminate states. Select-all checkbox properly handles filtered track sets.
- **Bulk Actions Toolbar**: Created sticky glassmorphism toolbar that appears when tracks are selected, showing selection count and total filtered count. Includes action buttons for enrichment, tagging, export, and clear selection with loading states.
- **Apply to Selected vs All Filtered**: Enhanced bulk actions with dropdown menus offering two operation modes: "Apply to Selected (X tracks)" for currently selected tracks, and "Apply to All Filtered (Y tracks)" for all tracks matching current filters. Includes dynamic track counts and accurate toast feedback.
- **Fixed Left-Hand Sidebar Navigation**: Implemented Shadcn sidebar component with expandable sections for Discovery (Playlists View, Tracks View), Relationships/CRM (Contacts, Engagements, Opportunities), Deals (Pipeline, Deal Detail, Templates), and Settings (Spotify & APIs, Database & Storage, User Preferences, Automation, Dev). Features dark/glass styling, location-aware auto-expansion, active-state highlighting, and hover interactions using the hover-elevate utility.
- **Playlists View (November 2025)**: Comprehensive playlist management interface at `/playlists` featuring stats cards (Total, Active, Paused, Error counts), search and source filtering, sortable table with columns for Name, Source, Tracks, Curator, Followers, Last Updated, Status, and Actions. Includes details drawer with full metadata display and "View Tracks" action that navigates to Tracks View with automatic playlist filtering via URL query parameters. Implements source normalization logic to handle null/undefined values as "Unknown" for consistent filtering.

### Technical Implementations
- **Data Fetching**: Utilizes TanStack Query for efficient data fetching.
- **Scoring Algorithm**: A proprietary algorithm ranks tracks based on criteria such as Fresh Finds appearance, independent label status, and missing publisher/writer data.
- **2-Tier Unified Enrichment Pipeline (November 2025)**: Streamlined enrichment system with two primary tiers:
  - **Tier 1 (Spotify Credits Scraping)**: Uses Puppeteer to scrape songwriter, composer, producer, and publisher credits directly from Spotify track pages. This is the primary source for songwriter discovery and provides the most comprehensive credit data.
  - **Tier 2 (MusicBrainz Social Links)**: For each songwriter identified in Tier 1, queries MusicBrainz API to discover social profiles (Instagram, Twitter, Facebook, Bandcamp, LinkedIn, YouTube, Discogs, Website) via artist URL relationships. Uses 3-tier MusicBrainz lookup: (1) ISRC-based (fastest), (2) Spotify API ISRC recovery, (3) Name-based search with 90+ confidence threshold.
  - **MLC Publisher Status (Future)**: System architecture includes MLC API integration (`enrichTrackWithMLC()` in `server/mlc.ts`) to determine publisher status (Unsigned/Self-Published/Indie/Major) once official API credentials are obtained from themlc.com/dataprograms. Current implementation gracefully skips MLC lookups when credentials are not configured.
  - **Artist Normalization**: Separate `artists` table with unique MusicBrainz IDs prevents duplicate profiles; `artist_songwriters` junction enables many-to-many track-artist relationships for proper CRM integration
  - **Backfill Endpoint**: `/api/enrich-artists` processes existing enriched tracks to populate artist records and social links retrospectively
- **Lead Tagging System**: Allows creation of custom, color-coded tags for tracks and filtering.
- **Batch Week Comparison**: Enables comparison of track progression across multiple weeks with trend indicators.
- **Contact Discovery**: Stores and manages artist contact information (Instagram, Twitter, TikTok, email, notes).
- **AI Lead Prioritization**: Integrates GPT-4o-mini for generating insights, outreach strategies, and scoring rationale.
- **Custom Playlist Tracking**: Supports adding, managing, and bulk importing Spotify playlists via URL/ID, including automatic metadata fetching and duplicate prevention.
- **Spotify Credits Scraping**: Employs Puppeteer to scrape songwriter, composer, producer, and publisher credits directly from Spotify track pages, complementing MusicBrainz enrichment. **Smart Name Splitting (November 2025)**: Implements intelligent name parsing that handles both comma-separated names and concatenated names without delimiters. Uses capital letter transition detection (lowercase→uppercase) to split run-together names like "Gustav NystromIman Conta Hulten" into individually identifiable songwriters for CRM enrichment requirements.
- **Advanced Editorial Playlist Capture**: Two-tier approach for editorial playlists inaccessible via API:
  - **Network Capture (Primary)**: Intercepts JSON responses from Spotify's web player API using Puppeteer's `page.on('response')` to capture all playlist tracks without DOM limitations.
  - **DOM Harvester (Fallback)**: Uses `MutationObserver` to track virtualized row swaps and harvest track data during scrolling if network capture yields insufficient results.
- **Enhanced CSV Export**: Includes all metadata and contact fields for comprehensive outreach.

### System Design Choices
- **Database Schema**:
    - `PlaylistSnapshot`: Stores track-level data, including enriched metadata, scores, contact info, and enrichmentTier field (isrc, spotify-isrc, name-based, or artist_links)
    - `TrackedPlaylists`: Manages user-selected Spotify playlists for tracking.
    - `Tags`: Defines custom tags for categorizing tracks.
    - `TrackTags`: Links tracks to tags.
    - `Artists` (November 2025): Normalized songwriter/composer table with unique MusicBrainz IDs and social link fields (Instagram, Twitter, Facebook, Bandcamp, LinkedIn, YouTube, Discogs, Website)
    - `ArtistSongwriters` (November 2025): Many-to-many junction table linking tracks to artist records, enabling proper CRM relationships and "all tracks by artist" queries
- **Backend API**: Provides RESTful endpoints for data retrieval, management, and enrichment.
- **Spotify Integration**: Uses the Spotify API for playlist and track data, including a custom scraping solution for detailed credits.

## External Dependencies
- **Spotify API**: For fetching playlist and track data. **Note**: Editorial playlists owned by Spotify return 404 errors and cannot be accessed via API.
- **MusicBrainz API**: For enriching tracks with publisher and songwriter metadata via ISRC.
- **Neon (PostgreSQL)**: Managed PostgreSQL database for data storage.
- **GPT-4o-mini (via Replit AI Integrations)**: For AI-powered lead prioritization and insights.
- **Puppeteer**: Used for web scraping Spotify track credits and editorial playlists. **Network Capture Method**: Intercepts Spotify's internal API responses to bypass virtualized scrolling limitations and capture all tracks from editorial playlists (160+ tracks). **DOM Harvester**: Fallback method using `MutationObserver` for edge cases where network capture fails.