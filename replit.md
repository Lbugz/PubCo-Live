# AI Pub Feed — Discovery Platform

### Overview
The AI Pub Feed is an automated platform designed to discover unsigned artists and unpublished songwriters from Spotify playlists. It collects trending Spotify playlist data, enriches track metadata, and ranks contributors based on their likelihood of being unsigned or unpublished. The system provides actionable publishing leads for A&R professionals, streamlining new talent discovery with real-time progress tracking and comprehensive relationship management. The project aims to revolutionize talent scouting by leveraging AI and automation to identify promising artists early in their careers.

### User Preferences
- Professional, data-focused UI inspired by Linear/Notion
- Clean information hierarchy with collapsible sections
- Fast data scanning with sortable/filterable tables
- Actionable export features (CSV with all metadata)
- Real-time progress visibility (Activity Panel + WebSocket)
- Blue gradient buttons for primary actions
- Dark/light theme toggle with persistent preference

### System Architecture

**Frontend**
- **React + TypeScript:** Component-based UI with type safety.
- **TanStack Query:** Data fetching, caching, real-time updates.
- **Wouter:** Lightweight client-side routing.
- **Shadcn UI + Tailwind CSS:** Professional design system inspired by Linear/Notion.
- **WebSocket Client:** Real-time job progress updates.

**Backend**
- **Express.js + Node.js:** RESTful API server.
- **PostgreSQL (Neon):** Managed database with foreign key integrity.
- **Drizzle ORM:** Type-safe database queries.
- **WebSocket Server:** Real-time event broadcasting on `/ws`.

**Worker Process**
- **Standalone Enrichment Worker:** Separate from API server.
- **Job Queue:** PostgreSQL-backed with atomic claiming.
- **Crash Recovery:** Automatic job reclamation.
- **Graceful Shutdown:** Clean job cleanup on SIGTERM/SIGINT.

**Key Features and Design Patterns**
- **Playlist Tracking:** Ingests Spotify playlists with intelligent fallback systems (Chartmetric-first, Spotify API fallback, Puppeteer for editorial). Automatically pulls and stores track metadata and creates weekly snapshots.
- **Multi-Phase Enrichment Pipeline:** Converts raw playlist tracks into rights-relevant metadata through four phases: Spotify API Batch Enrichment, Web Scraping (Puppeteer), MusicBrainz Lookup, and MLC Publisher Search.
- **Real-Time UX:** Features an Activity Panel for persistent job tracking and a 4-tier toast notification system, with WebSocket broadcasts for live updates.
- **Proprietary Scoring Algorithm:** A point-based rubric system (0-10 score) calculated at the contact level, prioritizing publishing metadata gaps as the strongest unsigned signal. Scores are updated post-enrichment.
- **Contacts CRM & Funnel Management:** Tracks writer discovery, growth, and outreach through pipeline stages (Discovery Pool, Watch List, Active Search). Includes a global dashboard, filterable tables, and detailed contact drawers.
- **Performance Tracking System:** Weekly snapshots capture point-in-time streaming metrics (Spotify + YouTube) for accurate WoW growth calculations. Streaming data is kept fresh through weekly playlist updates. Manual trigger endpoints available at POST /api/jobs/run-performance-snapshot and POST /api/jobs/run-playlist-update.
- **Technical Optimizations:** Includes database-level pagination, search query debouncing, component memoization, native image lazy loading, foreign key constraints, duplicate prevention, atomic job claiming, batch Spotify API calls, and tiered rate limiting.
- **Automation:** Utilizes `node-cron` for scheduled jobs including Fresh Finds weekly updates (Fridays 10:00-12:00 UTC), failed enrichment retries (daily 2:00 AM), and weekly performance snapshots (Fridays 4:59 AM UTC).

### External Dependencies
- **Spotify API:** OAuth 2.0 for playlist/track data.
- **Chartmetric API:** Cross-platform analytics, ISRC lookup.
- **MusicBrainz API:** Songwriter/publisher metadata.
- **The MLC API:** OAuth-based publisher ownership.
- **Neon PostgreSQL:** Managed database.
- **GPT-4o-mini:** AI-powered insights via Replit integration.
- **Puppeteer + Chromium:** Web scraping for editorial playlists and credits.