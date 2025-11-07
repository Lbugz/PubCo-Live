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
- **Unified Control Panel**: Consolidated ALL header controls into UnifiedControlPanel using component slot pattern. Header now displays only logo, week info, and theme toggle. Authorize Spotify button relocated from header to control panel's Actions row.
- **Optimized Filters Layout**: Redesigned filters/search component by moving score range slider into Completeness Filters dropdown, tightened spacing, and reduced select widths for more compact layout.
- **Actions Consolidation**: Created TrackActionsDropdown component with 3-dot menu (MoreVertical icon) that consolidates all per-track actions (Enrich MB, Enrich Credits, AI Insights, Tag, Contact, Spotify link) into a single dropdown. Applied to track table, card, and kanban views.
- **Controlled Dialog Pattern**: Refactored TrackAIInsights, TrackTagPopover, and TrackContactDialog to accept controlled state (open/onOpenChange props), allowing external components to trigger them programmatically while maintaining standalone usage.
- **Auto-fetch AI Insights**: Implemented useEffect in TrackAIInsights that auto-triggers data fetching when dialog is opened externally via controlled state, ensuring insights load correctly from dropdown menu.
- **Songwriter Display Format**: Implemented "First Songwriter +2" format with expandable badge to show all songwriters, improving information density while maintaining readability.
- **Bulk Selection System**: Added checkbox-based bulk selection with cross-filter preservation using membership checking (`.every()` and `.some()`) for indeterminate states. Select-all checkbox properly handles filtered track sets.
- **Bulk Actions Toolbar**: Created sticky glassmorphism toolbar that appears when tracks are selected, showing selection count and total filtered count. Includes action buttons for enrichment, tagging, export, and clear selection with loading states.
- **Apply to Selected vs All Filtered**: Enhanced bulk actions with dropdown menus offering two operation modes: "Apply to Selected (X tracks)" for currently selected tracks, and "Apply to All Filtered (Y tracks)" for all tracks matching current filters. Includes dynamic track counts and accurate toast feedback.

### Technical Implementations
- **Data Fetching**: Utilizes TanStack Query for efficient data fetching.
- **Scoring Algorithm**: A proprietary algorithm ranks tracks based on criteria such as Fresh Finds appearance, independent label status, and missing publisher/writer data.
- **MusicBrainz Integration**: Enriches tracks with songwriter data via ISRC → Recording → Work chain.
- **Lead Tagging System**: Allows creation of custom, color-coded tags for tracks and filtering.
- **Batch Week Comparison**: Enables comparison of track progression across multiple weeks with trend indicators.
- **Contact Discovery**: Stores and manages artist contact information (Instagram, Twitter, TikTok, email, notes).
- **AI Lead Prioritization**: Integrates GPT-4o-mini for generating insights, outreach strategies, and scoring rationale.
- **Custom Playlist Tracking**: Supports adding, managing, and bulk importing Spotify playlists via URL/ID, including automatic metadata fetching and duplicate prevention.
- **Spotify Credits Scraping**: Employs Puppeteer to scrape songwriter, composer, producer, and publisher credits directly from Spotify track pages, complementing MusicBrainz enrichment.
- **Enhanced CSV Export**: Includes all metadata and contact fields for comprehensive outreach.

### System Design Choices
- **Database Schema**:
    - `PlaylistSnapshot`: Stores track-level data, including enriched metadata, scores, and contact info.
    - `TrackedPlaylists`: Manages user-selected Spotify playlists for tracking.
    - `Tags`: Defines custom tags for categorizing tracks.
    - `TrackTags`: Links tracks to tags.
- **Backend API**: Provides RESTful endpoints for data retrieval, management, and enrichment.
- **Spotify Integration**: Uses the Spotify API for playlist and track data, including a custom scraping solution for detailed credits.

## External Dependencies
- **Spotify API**: For fetching playlist and track data.
- **MusicBrainz API**: For enriching tracks with publisher and songwriter metadata via ISRC.
- **Neon (PostgreSQL)**: Managed PostgreSQL database for data storage.
- **GPT-4o-mini (via Replit AI Integrations)**: For AI-powered lead prioritization and insights.
- **Puppeteer**: Used for web scraping Spotify track credits.