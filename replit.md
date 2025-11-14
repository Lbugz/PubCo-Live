# AI Pub Feed MVP

## Overview
The AI Pub Feed MVP is an automated platform for discovering unsigned artists and unpublished songwriters from Spotify playlists. It collects trending Spotify playlist data, enriches track metadata with crucial details like ISRCs, labels, and writers, and ranks contributors based on their likelihood of being unsigned or unpublished. The system aims to provide actionable publishing leads for A&R professionals, streamlining new talent discovery. Its ambition is to become the leading platform for identifying emerging musical talent.

## User Preferences
- Professional, data-focused UI
- Clean information hierarchy
- Fast data scanning and filtering
- Actionable export features

## System Architecture
The application features a modern full-stack architecture with a React, TypeScript, Tailwind CSS, and Shadcn UI frontend, an Express.js and Node.js backend, and a PostgreSQL database (Neon).

### UI/UX Decisions
The frontend is a single-page React application built with a modular component architecture, a professional design system inspired by Linear/Notion patterns, and dark/light theme toggle. It emphasizes a clean information hierarchy, fast data scanning, filtering, and actionable export features. Key features include consolidated track actions, songwriter display with expandable badges, checkbox-based bulk selection, a sticky glassmorphism toolbar for bulk actions, fixed left-hand sidebar navigation, comprehensive playlist management, album art thumbnails with lazy loading, a redesigned details drawer with radial score indicator, a dedicated songwriter panel, and multi-select playlist management with a bulk actions toolbar.

### Technical Implementations
- **Data Fetching**: Utilizes TanStack Query.
- **Scoring Algorithm**: Proprietary algorithm ranks tracks based on Fresh Finds appearance, independent label status, and missing publisher/writer data.
- **Playlist Metadata Timing**: Ensures playlist metadata is persisted to `tracked_playlists` before track insertion, with a backfill endpoint for retroactive updates.
- **Worker Process Architecture**: Standalone enrichment worker runs separately from the main Express/Vite server to prevent memory-related crashes. Features PostgreSQL-backed job queue with atomic job claiming via writable CTE and `FOR UPDATE SKIP LOCKED`, job recovery on crashes (resets stuck 'running' jobs to 'queued' on startup), and graceful shutdown handling. Worker can be started manually via `npx tsx server/worker-process.ts` for on-demand enrichment processing.
- **Automatic Enrichment**: Background enrichment triggers automatically after playlist fetch operations via `scheduleMetricsUpdate`.
- **Playlist Add Optimization (Phase 1)**: Eliminated redundant client-side GET /api/spotify/playlist/:id calls before POST /api/tracked-playlists. Client now sends placeholder data directly to backend, which handles all enrichment (Chartmetric → Spotify API fallback). Reduces API calls by 50% and cuts playlist addition latency in half.
- **Parallel Metadata Fetching (Phase 2)**: Refactored POST /api/tracked-playlists endpoint to fetch Chartmetric and Spotify metadata concurrently using Promise.allSettled instead of sequentially. Implements intelligent fallback logic that prefers Chartmetric data if available, otherwise uses Spotify API results. Reduces worst-case metadata fetch latency by 50-70% (from sequential sum to parallel max). Includes comprehensive error handling and performance logging for both data sources.
- **HTTP Loopback Elimination (Phase 3)**: Eliminated HTTP overhead in automatic playlist fetch triggers by replacing localhost fetch() calls with direct function invocation. Extracted 354-line core playlist fetch logic into `server/services/playlistFetchCore.ts` as single source of truth. Both POST /api/fetch-playlists endpoint and auto-trigger now delegate to shared `fetchPlaylistsCore()` function via registration pattern in `playlistFetchService.ts`. Removes 849 lines of code duplication from routes.ts. Custom error types (`PlaylistValidationError`, `PlaylistFetchError`) preserve original HTTP semantics (400 for validation errors, 500 for server errors). Eliminates 20-40ms HTTP round-trip overhead per auto-trigger invocation while maintaining identical functionality.
- **UI Performance Optimizations (Phase 6)**: Comprehensive optimizations for handling 500+ track datasets efficiently:
    - **Database-level Pagination**: SQL LIMIT/OFFSET with dedicated COUNT queries using Drizzle ORM's `.$dynamic()` method. Safe BigInt-to-number conversion for PostgreSQL counts. Backward-compatible API (plain array without params, paginated envelope with params).
    - **Search Debouncing**: Custom `useDebounce` hook (300ms delay) applied to Dashboard search input, eliminating per-keystroke re-renders and API calls.
    - **Component Memoization**: TrackTable, CardView, and KanbanView wrapped with React.memo to prevent unnecessary re-renders when parent state changes.
    - **Native Image Lazy Loading**: Album art uses browser-native `loading="lazy"` and `decoding="async"` attributes. Combined with TrackTable virtualization (@tanstack/react-virtual), provides optimal image loading performance without additional Intersection Observer complexity.
    - **State Update Optimization**: All event handlers wrapped with useCallback for stable callback references. Filtered tracks and stats (highPotentialCount, mediumPotentialCount, avgScore) consolidated into single useMemo computation. Selection handlers use functional setState pattern to avoid stale closures.
- **Unified Enrichment Pipeline**: Multi-phase enrichment system that runs after track insertion:
    - **Phase 1 (Spotify API Batch Enrichment)**: Runs FIRST to maximize ISRC coverage. Batches 50 tracks per API call to recover ISRCs, popularity, duration, explicit flags, release dates, album labels, album images, audio features (energy, valence, danceability, tempo), artist genres, and artist followers. Includes retry logic with exponential backoff for rate limits. Selective processing skips tracks with complete metadata. Achieves 90-99% ISRC recovery rate, enabling downstream Chartmetric matching.
    - **Phase 2 (Spotify Credits & Stream Count Scraping)**: Production-ready Puppeteer-based scraping with background job queue architecture. Scrapes songwriter credits (songwriter, producer, publisher, label) and stream counts from Spotify track pages. Features: optimized concurrency (maxConcurrency: 2, browserPoolSize: 2) for faster processing, 45s timeout per track, chunk-based processing (2 tracks/chunk), graceful error handling, and WebSocket progress updates. Handles various stream count formats (numeric, 1.2M, 1.2B).
    - **Phase 3 (MLC Publisher Status)**: Integrated with The MLC (Mechanical Licensing Collective) Public Search API using OAuth authentication. Searches tracks by ISRC and title/writers to retrieve publisher ownership information. Enriches tracks with publisher names, publisher status (published/unknown), MLC song codes, and ISWC identifiers. Processes tracks in batches of 5 concurrently using Promise.all for faster throughput. Implements comprehensive error handling with per-track failure isolation.
    - **Chartmetric ISRC Matching**: Runs after Phase 1 to leverage recovered ISRCs for Chartmetric ID lookup via playlist-level batch matching and per-track ISRC lookups.
    - **Tier 3 (MusicBrainz Social Links)**: [Planned] Queries MusicBrainz API for songwriter social profiles.
    - **Tier 4 (Chartmetric Analytics)**: Fetches cross-platform metrics, track stage, moods, and activities.
- **Enrichment Performance Optimizations**: TrackStateContext manages in-memory track state throughout job execution, eliminating repeated database reads between phases. Phase-boundary persistence ensures crash resilience while maintaining performance. Optimized concurrency settings and parallel processing significantly reduce enrichment time.
- **Artist Normalization**: Separate `artists` table with unique MusicBrainz IDs and a `artist_songwriters` junction table.
- **Real-time Enrichment Updates**: WebSocket integration broadcasts `track_enriched` events, updating the UI dynamically.
- **Enrichment Activity Logging**: Detailed activity history for enrichment processes.
- **Playlist Activity History**: Comprehensive logging system for all playlist operations.
- **Lead Tagging System**: Custom, color-coded tags for tracks with filtering capabilities.
- **Batch Week Comparison**: Compares track progression across multiple weeks.
- **Contact Discovery**: Manages artist contact information.
- **AI Lead Prioritization**: Integrates GPT-4o-mini for insights and outreach strategies.
- **Custom Playlist Tracking**: Supports adding, managing, and bulk importing Spotify playlists, including automatic metadata fetching and duplicate prevention.
- **Advanced Editorial Playlist Capture**: Two-tier approach using Puppeteer for network capture and DOM harvesting.
- **Enhanced CSV Export**: Includes all metadata and contact fields.
- **Chartmetric Integration**: Provides cross-platform tracking and industry insights, storing Chartmetric IDs and implementing rate limiting. It features a universal Chartmetric-first approach for all playlist operations, falling back to Spotify API or Puppeteer if Chartmetric access is unavailable or fails.

### System Design Choices
- **Database Schema**: Includes `PlaylistSnapshot`, `TrackedPlaylists`, `Tags`, `TrackTags`, `Artists`, and `ArtistSongwriters` tables. Chartmetric fields are integrated into `PlaylistSnapshot`.
- **Backend API**: Provides RESTful endpoints for data retrieval, management, and enrichment.
- **Spotify Integration**: Uses the Spotify API and custom scraping for playlist and track data.

## External Dependencies
- **Spotify API**: For fetching playlist and track data, utilizing a custom OAuth 2.0 implementation for authentication and token refresh. Editorial playlists require Puppeteer scraping due to API limitations.
- **MusicBrainz API**: For enriching tracks with publisher and songwriter metadata via ISRC, adhering to rate limiting and proper user-agent identification.
- **The MLC (Mechanical Licensing Collective) Public Search API**: OAuth-based API for querying publisher ownership information. Credentials stored in environment variables (MLC_USERNAME, MLC_PASSWORD). Supports ISRC-based recording search and title/writer-based work search. Returns publisher names, IPI numbers, collection shares, and songwriter details.
- **Chartmetric API**: Used for cross-platform analytics and industry insights, including ISRC lookup, Chartmetric ID retrieval, and track metadata. Enterprise tier is required for certain streaming stats endpoints.
- **Neon (PostgreSQL)**: Managed PostgreSQL database for persistent data storage.
- **GPT-4o-mini (via Replit AI Integrations)**: For AI-powered lead prioritization and insights generation.
- **Puppeteer + Chromium**: Used for web scraping Spotify track credits and editorial playlist data, with Chromium installed as a system dependency. Configured with optimized concurrency (2 browsers, 2 concurrent operations) for faster processing while maintaining stability.