# AI Pub Feed — Discovery Platform

## Overview
The AI Pub Feed is an automated platform designed to discover unsigned artists and unpublished songwriters from Spotify playlists. It collects trending Spotify playlist data, enriches track metadata with essential details like ISRCs, labels, and writers, and ranks contributors based on their likelihood of being unsigned or unpublished. The system provides actionable publishing leads for A&R professionals, streamlining new talent discovery with real-time progress tracking and comprehensive relationship management.

## Recent Changes

### Nov 16, 2025 - Sticky & Sortable Headers for All Tables
- **Sticky Header Container**: Created reusable `StickyHeaderContainer` component for filters and metrics sections
- **Dashboard**: Wrapped metrics and FilterBar in sticky header - stays visible while scrolling through tracks
- **Playlists**: Wrapped metrics and FilterBar in sticky header - stays visible while scrolling through playlist table
- **Contacts**: Wrapped metrics and FilterBar in sticky header - stays visible while scrolling through contact table
- **Consistent Table Styling**: All tables now use `glass-panel` class consistently for unified backdrop blur, background, and border styling
- **Removed Redundant Classes**: Simplified playlists table styling by removing duplicate `backdrop-blur-xl border border-primary/20` classes already covered by `glass-panel`
- **Sticky Table Headers**: Added sticky headers to all tables (Dashboard TrackTable, Playlists Table, Contacts Table) - column headers freeze at top when scrolling
- **Sortable Headers**: All tables already had sorting functionality via `SortableTableHeader` and `SortableHeaderForGrid` components - clicking column headers toggles sort direction

### Nov 16, 2025 - Publishing Intelligence System
- **Contact-Level Enrichment Tracking**: Added 4 boolean flags to contacts table (`mlcSearched`, `mlcFound`, `musicbrainzSearched`, `musicbrainzFound`) to track verified unsigned status at songwriter level
- **Automated Contact Sync**: Created `contactEnrichmentSync` service to aggregate track-level enrichment data to contact flags after each enrichment job completes
- **New Publishing Intelligence Metrics**:
  - **High-Confidence Unsigned**: Songwriters verified as unsigned through MLC search (mlcFound=0) with high-quality tracks (score ≥7)
  - **Publishing Opportunities**: All MLC-verified unsigned songwriters (mlcSearched=1 AND mlcFound=0)
  - **Enrichment Backlog**: Songwriters never searched in MLC (mlcSearched=0)
- **Dashboard UI Updates**: Added dedicated "Publishing Intelligence" section with contact-level metrics, separate from track metrics
- **Real-Time Cache Invalidation**: Metrics cache automatically invalidated after enrichment sync for immediate dashboard updates
- **Authoritative MLC Signals**: Metrics use contact-level MLC flags as source of truth for unsigned status, with EXISTS checks for score validation

### Nov 16, 2025 - Scoring Pipeline Fix & UX Improvements
- **Fixed premature scoring bug**: Removed incorrect score calculations during playlist fetch that assigned "High 8" scores to unenriched tracks
- **Post-enrichment scoring**: Scores now calculated only after Phase 2 (credits scraping) completes, ensuring accuracy based on real enriched metadata
- **Nullable score schema**: Updated `unsignedScore` column to allow null values, enabling "Pending" state for tracks awaiting enrichment
- **UI updates**: All components (track-table, card-view, details-drawer) show "Pending" badge for null scores instead of inflated values
- **Removed email requirement**: Deal-Ready Tracks filter no longer requires contact email (which enrichment never collects), now filters only by unsigned score 7-10
- **Fixed toast stacking**: Activity Panel job notifications no longer duplicate when WebSocket events are received multiple times
- **Mobile responsiveness**: All touch targets WCAG-compliant (48px), responsive layouts across all pages using pseudo-element technique

## User Preferences

- Professional, data-focused UI inspired by Linear/Notion
- Clean information hierarchy with collapsible sections
- Fast data scanning with sortable/filterable tables
- Actionable export features (CSV with all metadata)
- Real-time progress visibility (Activity Panel + WebSocket)
- Blue gradient buttons for primary actions
- Dark/light theme toggle with persistent preference

## System Architecture

### Frontend
- **React + TypeScript:** Component-based UI with type safety
- **TanStack Query:** Data fetching, caching, real-time updates
- **Wouter:** Lightweight client-side routing
- **Shadcn UI + Tailwind CSS:** Professional design system inspired by Linear/Notion
- **WebSocket Client:** Real-time job progress updates

### Backend
- **Express.js + Node.js:** RESTful API server
- **PostgreSQL (Neon):** Managed database with foreign key integrity
- **Drizzle ORM:** Type-safe database queries
- **WebSocket Server:** Real-time event broadcasting on `/ws`

### Worker Process
- **Standalone Enrichment Worker:** Separate from API server
- **Job Queue:** PostgreSQL-backed with atomic claiming
- **Crash Recovery:** Automatic job reclamation
- **Graceful Shutdown:** Clean job cleanup on SIGTERM/SIGINT

### Key Features and Design Patterns
- **Playlist Tracking:** Ingests Spotify playlists (public, editorial, custom) with intelligent fallback systems (Chartmetric-first, Spotify API fallback, Puppeteer for editorial). Automatically pulls and stores track metadata and creates weekly snapshots.
- **Multi-Phase Enrichment Pipeline:** Converts raw playlist tracks into rights-relevant metadata through four phases:
    1.  **Spotify API Batch Enrichment:** Extracts ISRCs, label info, release metadata, audio features, and artist data.
    2.  **Web Scraping (Puppeteer):** Extracts songwriter/producer credits and real-time stream counts from Spotify track pages.
    3.  **MusicBrainz Lookup:** Queries for songwriter/publisher details and global creator identifiers.
    4.  **MLC Publisher Search:** Confirms unsigned/unpublished status via U.S. mechanical rights, with OAuth 2.0 authentication and graceful degradation.
- **Real-Time UX:** Features an Activity Panel for persistent job tracking and a 4-tier toast notification system. WebSocket broadcasts provide live updates for `track_enriched` events and job progress.
- **Proprietary Scoring Algorithm:** Point-based rubric system (0-10 score) prioritizing publishing metadata gaps as strongest unsigned signal:
    - **Missing Publisher (+5):** Highest priority - direct unsigned publishing indicator
    - **Missing Writer (+3):** Metadata gap suggesting self-written/DIY artist
    - **Self-Written + Fresh Finds (+3):** Artist wrote own song + editorial validation
    - **Self-Written + Indie Label (+2):** Self-released + self-written = strong unsigned signal
    - **High Stream Velocity (+2):** >50% WoW growth = urgent opportunity
    - **Medium Stream Velocity (+1):** >20% WoW growth = building momentum
    - **Self-Written Detection:** Intelligent artist-songwriter name matching (normalized, handles variations)
    - **Label Classification:** Regex pattern for indie/DIY/DK keywords
    - **No Major Label Penalty:** Hired songwriters for majors can still be unsigned publishers
    - **Score Distribution:** 9-10 (hot lead), 7-8 (strong lead), 5-6 (moderate), 3-4 (low), 0-2 (minimal)
    - **Implementation:** `server/scoring.ts`, calculated in Phase 1, persisted in `playlist_snapshots.unsigned_score`
- **Contacts CRM & Funnel Management:** Tracks writer discovery, growth, and outreach through pipeline stages (Discovery Pool, Watch List, Active Search). Includes a global dashboard, filterable tables, and detailed contact drawers with performance metrics, activity logs, notes, and alerts. Supports bulk actions for stage updates and tag assignments.
- **Technical Optimizations:** Includes database-level pagination, search query debouncing, component memoization, native image lazy loading, foreign key constraints, duplicate prevention, atomic job claiming, batch Spotify API calls, and tiered rate limiting for external APIs. Editorial playlist handling uses browser-sharing architecture with GraphQL network interception and cookie persistence.
- **Automation:** Utilizes `node-cron` for scheduled jobs:
    - **Fresh Finds Weekly Update** (Fridays 9AM): Auto-scrapes Fresh Finds playlists
    - **Failed Enrichment Retry** (Daily 2AM): Re-queues failed enrichments
    - **Weekly Performance Snapshots** (Mondays 1AM): Captures stream counts for WoW % calculations
    - Auto-enrichment triggers immediately after playlist fetch
    - Stream velocity data sources: Chartmetric API → Puppeteer scraping → stored in `playlist_snapshots.spotifyStreams`
    - WoW % formula: `(Current Week Streams - Previous Week Streams) / Previous Week Streams × 100`

### Database Schema
- `tracked_playlists`
- `playlist_snapshots`
- `contacts`
- `artists`
- `artist_songwriters`
- `tags` / `track_tags`
- `activities`
- `notes`
- `alerts`

## External Dependencies

- **Spotify API:** OAuth 2.0 for playlist/track data
- **Chartmetric API:** Cross-platform analytics, ISRC lookup
- **MusicBrainz API:** Songwriter/publisher metadata
- **The MLC API:** OAuth-based publisher ownership
- **Neon PostgreSQL:** Managed database
- **GPT-4o-mini:** AI-powered insights via Replit integration
- **Puppeteer + Chromium:** Web scraping for editorial playlists and credits