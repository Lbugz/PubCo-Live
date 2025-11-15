# AI Pub Feed — Discovery Platform

## Overview
The AI Pub Feed is an automated platform designed to discover unsigned artists and unpublished songwriters from Spotify playlists. It collects trending Spotify playlist data, enriches track metadata with essential details like ISRCs, labels, and writers, and ranks contributors based on their likelihood of being unsigned or unpublished. The system provides actionable publishing leads for A&R professionals, streamlining new talent discovery with real-time progress tracking and comprehensive relationship management.

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
- **Proprietary Scoring Algorithm:** Assigns a 1-10 score indicating unsigned/unpublished likelihood and commercial potential based on factors like Fresh Finds appearance, independent label status, missing writer/publisher data, and stream velocity.
- **Contacts CRM & Funnel Management:** Tracks writer discovery, growth, and outreach through pipeline stages (Discovery Pool, Watch List, Active Search). Includes a global dashboard, filterable tables, and detailed contact drawers with performance metrics, activity logs, notes, and alerts. Supports bulk actions for stage updates and tag assignments.
- **Technical Optimizations:** Includes database-level pagination, search query debouncing, component memoization, native image lazy loading, foreign key constraints, duplicate prevention, atomic job claiming, batch Spotify API calls, and tiered rate limiting for external APIs. Editorial playlist handling uses browser-sharing architecture with GraphQL network interception and cookie persistence.
- **Automation:** Utilizes `node-cron` for weekly Fresh Finds updates and daily retry jobs for failed enrichments. Auto-enrichment triggers immediately after playlist fetch.

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