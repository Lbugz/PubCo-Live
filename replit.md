# AI Pub Feed MVP

## Overview
The AI Pub Feed MVP is an automated platform designed to identify unsigned artists and unpublished songwriters from user-selected Spotify playlists. It collects trending Spotify playlist data weekly, enriches track metadata with ISRCs, labels, and writers, and ranks contributors by their likelihood of being unsigned or unpublished. The system aims to provide actionable publishing leads for A&R professionals, streamlining new talent discovery.

## User Preferences
- Professional, data-focused UI
- Clean information hierarchy
- Fast data scanning and filtering
- Actionable export features

## System Architecture
The application features a modern full-stack architecture with a React, TypeScript, Tailwind CSS, and Shadcn UI frontend, an Express.js and Node.js backend, and a PostgreSQL database (Neon).

### UI/UX Decisions
The frontend is a single-page React application built with a a modular component architecture, a professional design system inspired by Linear/Notion patterns, and dark/light theme toggle. It emphasizes a clean information hierarchy, fast data scanning, filtering, and actionable export features. Key features include:
- Consolidated track actions via a dropdown menu.
- Songwriter display in "First Songwriter +X" format with expandable badges.
- Checkbox-based bulk selection system with cross-filter preservation.
- Sticky glassmorphism toolbar for bulk actions with "Apply to Selected" vs "Apply to All Filtered" options.
- Fixed left-hand sidebar navigation with expandable sections and active-state highlighting.
- Comprehensive playlist management interface with stats cards, search, filtering, and a sortable table.
- Album art thumbnails with lazy loading.
- Redesigned details drawer with a large album art hero, overlapping header, and radial score indicator.
- Dedicated songwriter panel in the details drawer displaying social links and CRM integration.
- Comprehensive multi-select playlist management with a bulk actions toolbar for fetching data, refreshing metadata, and exporting CSVs.

### Technical Implementations
- **Data Fetching**: Utilizes TanStack Query.
- **Scoring Algorithm**: Proprietary algorithm ranks tracks based on Fresh Finds appearance, independent label status, and missing publisher/writer data.
- **5-Tier Unified Enrichment Pipeline**:
    - **Tier 0 (ISRC Recovery)**: Uses Spotify API to recover missing ISRCs for tracks via name/artist search when not available from initial playlist fetch.
    - **Tier 1 (Spotify Credits & Stream Count Scraping)**: Uses Puppeteer to scrape songwriter, composer, producer, and publisher credits from Spotify track pages. **Also extracts Spotify stream counts** (e.g., "33,741" or "1.2M") directly from the page as a fallback for tracks without Chartmetric data. Includes smart name splitting for accurate songwriter identification.
        - **Critical Transpiler Fix**: Resolved `__name is not defined` error by switching from arrow function to plain string injection in `page.evaluate()`. The tsx/esbuild transpiler wraps functions with `__name(fn, "fnName")` helper calls that don't exist in the browser context. Solution: inject code as plain strings using `page.evaluate(stringVariable)` instead of `page.evaluate(() => {...})` to bypass transpilation entirely.
        - **Timeout Protection**: 45s master timeout with proper cleanup, networkidle2/domcontentloaded fallback strategy prevents server crashes.
        - **Stream Count Parsing**: Handles multiple formats (comma-separated "33,741" and abbreviated "1.2M", "45K"), filters out non-stream numbers by checking realistic range (100-1B).
    - **Tier 2 (MLC Publisher Status)**: Designed for MLC API integration to determine publisher status.
    - **Tier 3 (MusicBrainz Social Links)**: Queries MusicBrainz API for social profiles of identified songwriters using ISRC-based, Spotify API ISRC recovery, and name-based lookups.
    - **Tier 4 (Chartmetric Analytics)**: Fetches cross-platform streaming metrics, track stage, moods, and activities when available.
    - **Artist Normalization**: Separate `artists` table with unique MusicBrainz IDs prevents duplicates, and `artist_songwriters` junction table enables many-to-many track-artist relationships.
    - **Backfill Endpoint**: Processes existing enriched tracks to populate artist records and social links retrospectively.
    - **Real-time Enrichment Updates**: WebSocket integration broadcasts `track_enriched` events to connected clients. Details drawer automatically invalidates React Query caches and refreshes data without requiring user to close/reopen. Loading states include skeleton loaders for track details and spinner on enrichment button.
    - **Enrichment Activity Logging**: Creates detailed activity history entries including overall enrichment summary and per-songwriter MusicBrainz lookup results (found/not found with social links status). Shows clear messages like "No Chartmetric data found for ISRC [ISRC]" when external APIs have no data.
- **Lead Tagging System**: Allows custom, color-coded tags for tracks and filtering.
- **Batch Week Comparison**: Enables comparison of track progression across multiple weeks.
- **Contact Discovery**: Manages artist contact information.
- **AI Lead Prioritization**: Integrates GPT-4o-mini for generating insights, outreach strategies, and scoring rationale.
- **Custom Playlist Tracking**: Supports adding, managing, and bulk importing Spotify playlists, including automatic metadata fetching and duplicate prevention.
- **Advanced Editorial Playlist Capture**: Two-tier approach using Puppeteer for network capture (primary) and DOM harvesting (fallback) to access tracks from editorial playlists.
- **Enhanced CSV Export**: Includes all metadata and contact fields.
- **Chartmetric Analytics Integration**: Provides cross-platform tracking and industry insights. Stores Chartmetric IDs and implements rate limiting with exponential backoff. **Enhanced Metadata Capture**: Enrichment now calls `/api/track/:id` metadata endpoint to capture songwriter Chartmetric IDs, composer names, moods, and activities for deeper A&R insights.

### System Design Choices
- **Database Schema**: Includes `PlaylistSnapshot` (track-level data, enriched metadata, scores, contact info), `TrackedPlaylists` (user-selected Spotify playlists), `Tags` (custom tags), `TrackTags` (links tracks to tags), `Artists` (normalized songwriter/composer table with MusicBrainz IDs and social links), and `ArtistSongwriters` (junction table for track-artist relationships). Chartmetric fields (`chartmetricId`, `spotifyStreams`, `streamingVelocity`, `chartmetricStatus`, `songwriterIds`, `composerName`, `moods`, `activities`) are integrated into `PlaylistSnapshot`.
- **Backend API**: Provides RESTful endpoints for data retrieval, management, and enrichment.
- **Spotify Integration**: Uses the Spotify API and custom scraping for playlist and track data.

## External Dependencies
- **Spotify API**: For fetching playlist and track data via custom OAuth 2.0 implementation. Note: Editorial playlists owned by Spotify are inaccessible via API and require Puppeteer scraping.
  - **OAuth Implementation**: Custom Authorization Code Flow with automatic token refresh
  - **Security**: CSRF protection via state parameter, tokens stored server-side, HTTPS redirect URIs in production
  - **Authentication**: Redirect URIs follow 2024-2025 standards (HTTPS required except localhost/127.0.0.1)
  - **Why Custom OAuth?**: Replit Connectors API showed "Active" in UI but returned empty items array via API v2, preventing programmatic access. Custom OAuth provides reliable authentication until Replit integration is fixed.
- **MusicBrainz API**: For enriching tracks with publisher and songwriter metadata via ISRC.
- **Chartmetric API**: For cross-platform analytics and industry insights. **Current Access**: Basic API tier provides ISRC lookup, Chartmetric ID retrieval (95% success rate), and track metadata including songwriter IDs, composer names, moods, and activities. **Enterprise Tier Required**: Streaming stats endpoints (`/track/{id}/spotify/stats`, `/track/{id}/youtube/stats`) return 401 "internal API endpoint" error - these require enterprise-tier API access. **Value**: Chartmetric songwriter IDs enable cross-referencing with songwriter collaboration networks and future analytics integration.
- **Neon (PostgreSQL)**: Managed PostgreSQL database for data storage.
- **GPT-4o-mini (via Replit AI Integrations)**: For AI-powered lead prioritization and insights.
- **Puppeteer**: Used for web scraping Spotify track credits and editorial playlists.