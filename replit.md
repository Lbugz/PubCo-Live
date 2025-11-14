# AI Pub Feed MVP

## Overview
The AI Pub Feed MVP is an automated platform designed to discover unsigned artists and unpublished songwriters from Spotify playlists. It collects trending Spotify playlist data, enriches track metadata with essential details like ISRCs, labels, and writers, and ranks contributors based on their likelihood of being unsigned or unpublished. The system aims to provide actionable publishing leads for A&R professionals, streamlining new talent discovery. Its ambition is to become the leading platform for identifying emerging musical talent.

## User Preferences
- Professional, data-focused UI
- Clean information hierarchy
- Fast data scanning and filtering
- Actionable export features

## System Architecture
The application features a modern full-stack architecture with a React, TypeScript, Tailwind CSS, and Shadcn UI frontend, an Express.js and Node.js backend, and a PostgreSQL database (Neon).

### UI/UX Decisions
The frontend is a single-page React application with a modular component architecture, a professional design system inspired by Linear/Notion patterns, and dark/light theme toggle. It emphasizes clean information hierarchy, fast data scanning, filtering, and actionable export features. Key UI features include consolidated track actions, songwriter display, bulk selection with a sticky glassmorphism toolbar, fixed left-hand sidebar navigation, comprehensive playlist management, album art thumbnails with lazy loading, a redesigned details drawer, and a dedicated songwriter panel.

### Technical Implementations
- **Data Fetching**: Utilizes TanStack Query.
- **Scoring Algorithm**: Proprietary algorithm ranks tracks based on Fresh Finds appearance, independent label status, and missing publisher/writer data.
- **Worker Process Architecture**: Standalone enrichment worker with a PostgreSQL-backed job queue for atomic job claiming, crash recovery, and graceful shutdown.
- **Automatic Enrichment**: Background enrichment triggers automatically after playlist fetch operations.
- **Playlist Add Optimization**: Optimized playlist addition by eliminating redundant client-side calls and parallelizing Chartmetric and Spotify metadata fetching using `Promise.allSettled` for intelligent fallback.
- **HTTP Loopback Elimination**: Replaced internal HTTP calls with direct function invocation for core playlist fetch logic, reducing overhead and code duplication.
- **Parallel Playlist Fetching**: Processes multiple playlists concurrently using `p-limit` for concurrency control and tiered rate limiting for external APIs (Chartmetric, Spotify, Puppeteer).
- **Spotify API ISRC Bug Fix**: Ensured complete metadata, including ISRCs, is fetched from Spotify API fallback.
- **UI Performance Optimizations**: Implemented database-level pagination, search debouncing, component memoization, native image lazy loading, and state update optimization.
- **Unified Enrichment Pipeline**: Multi-phase system for track enrichment:
    - **Phase 1 (Spotify API Batch Enrichment)**: Batches Spotify API calls to recover ISRCs, popularity, duration, explicit flags, release dates, album labels, album images, audio features, artist genres, and artist followers.
    - **Phase 2 (Spotify Credits & Stream Count Scraping)**: Puppeteer-based scraping for songwriter credits and stream counts from Spotify track pages.
    - **Phase 3 (MLC Publisher Status)**: Integration with The MLC Public Search API for publisher ownership information via ISRC and title/writers.
    - **Chartmetric ISRC Matching**: Leverages recovered ISRCs for Chartmetric ID lookup.
- **Enrichment Performance Optimizations**: Manages in-memory track state and optimizes concurrency for efficient enrichment.
- **Artist Normalization**: Separate `artists` table with unique MusicBrainz IDs and a `artist_songwriters` junction table.
- **Real-time Enrichment Updates**: WebSocket integration broadcasts `track_enriched` events.
- **Activity Logging**: Detailed activity history for enrichment processes and playlist operations. Fixed foreign key bug where activity logs referenced `playlist.playlistId` (Spotify ID string) instead of `playlist.id` (database UUID), resolving FK constraint violations.
- **Lead Tagging System**: Custom, color-coded tags for tracks with filtering.
- **Custom Playlist Tracking**: Supports adding, managing, and bulk importing Spotify playlists with automatic metadata fetching and duplicate prevention.
- **Advanced Editorial Playlist Capture**: Robust fallback system with browser-sharing architecture for editorial playlists:
    - **Spotify API 404 Fallback**: When Spotify API returns 404 (editorial/curated playlists), automatically falls back to Puppeteer scraper
    - **Browser-Sharing Architecture**: Single Puppeteer session reused across network capture and auth monitoring, eliminating duplicate browser launches
    - **GraphQL Metadata Extraction**: Network capture intercepts Spotify's internal pathfinder GraphQL API responses to extract playlist metadata (name, curator, followers, track count) instead of unreliable DOM selectors
    - **Auth Monitoring Integration**: Puppeteer scraper loads cookies from `SPOTIFY_COOKIES_JSON` secret, monitors authentication status, and persists cookies for future use
    - **Shared Page Instance**: `scrapeSpotifyPlaylist` launches browser with auth monitoring, passes page to `fetchEditorialTracksViaNetwork` for metadata extraction, reducing overhead
    - **Production Validation**: Tested with RapCaviar editorial playlist, successfully extracted correct metadata (name="RapCaviar", curator="Spotify", followers=15,848,007) with 50 tracks
- **Enhanced CSV Export**: Includes all metadata and contact fields.
- **Chartmetric Integration**: Provides cross-platform tracking and industry insights, storing Chartmetric IDs and implementing rate limiting. Uses `/search` endpoint instead of `/playlist/url` (which returns 401 errors). Features universal Chartmetric-first approach for all playlist operations, falling back to Spotify API or Puppeteer if Chartmetric access is unavailable or fails. Uses correct Chartmetric API endpoint format (`/playlist/{platform}/{id}`) with URL encoding to properly resolve Spotify playlist IDs to Chartmetric IDs.

### System Design Choices
- **Database Schema**: Includes `PlaylistSnapshot`, `TrackedPlaylists`, `Tags`, `TrackTags`, `Artists`, and `ArtistSongwriters` tables, with Chartmetric fields integrated into `PlaylistSnapshot`.
- **Backend API**: Provides RESTful endpoints for data retrieval, management, and enrichment.
- **Spotify Integration**: Uses the Spotify API and custom scraping for playlist and track data.

## External Dependencies
- **Spotify API**: For fetching playlist and track data, using OAuth 2.0. Editorial playlists require Puppeteer scraping.
- **MusicBrainz API**: For enriching tracks with publisher and songwriter metadata via ISRC, adhering to rate limiting.
- **The MLC (Mechanical Licensing Collective) Public Search API**: OAuth-based API for querying publisher ownership information via ISRC and title/writers.
- **Chartmetric API**: Used for cross-platform analytics and industry insights, including ISRC lookup and track metadata.
- **Neon (PostgreSQL)**: Managed PostgreSQL database for persistent data storage.
- **GPT-4o-mini (via Replit AI Integrations)**: For AI-powered lead prioritization and insights generation.
- **Puppeteer + Chromium**: Used for web scraping Spotify track credits and editorial playlist data.