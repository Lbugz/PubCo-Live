# AI Pub Feed MVP

## Project Overview
An automated Spotify playlist tracking and music publishing discovery platform that identifies unsigned artists and unpublished songwriters from user-selected Spotify playlists.

## Purpose
- Automate weekly collection of trending Spotify playlist data
- Enrich tracks with metadata (ISRC, label, writers)
- Rank each song's contributors by likelihood of being unsigned or unpublished
- Provide actionable publishing leads for A&R professionals

## Technology Stack
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL (Neon)
- **Integrations**: Spotify API (via Replit Connection)
- **Scheduling**: Planned for weekly automated fetching

## Data Model
### PlaylistSnapshot Table
- `id`: UUID (primary key)
- `week`: Date of snapshot
- `playlistName`: Name of Spotify playlist
- `playlistId`: Spotify playlist ID
- `trackName`: Track title
- `artistName`: Artist name(s)
- `spotifyUrl`: Link to track on Spotify
- `isrc`: International Standard Recording Code
- `label`: Record label
- `publisher`: Music publisher (enriched from MusicBrainz)
- `songwriter`: Songwriter(s) (enriched from MusicBrainz)
- `unsignedScore`: 0-10 scoring (likelihood of unsigned/unpublished)
- `addedAt`: When track was added to playlist
- `enrichedAt`: When metadata was enriched
- `instagram`: Artist Instagram handle
- `twitter`: Artist Twitter/X handle
- `tiktok`: Artist TikTok handle
- `email`: Contact email
- `contactNotes`: Outreach notes
- `createdAt`: Snapshot creation timestamp

### TrackedPlaylists Table
- `id`: UUID (primary key)
- `name`: Playlist name from Spotify
- `playlistId`: Spotify playlist ID (unique)
- `spotifyUrl`: Full Spotify playlist URL
- `createdAt`: When playlist was added for tracking

### Tags Table
- `id`: UUID (primary key)
- `name`: Tag name (unique)
- `color`: Tag color (blue, green, yellow, red, purple, orange, pink, gray)
- `createdAt`: Tag creation timestamp

### TrackTags Table
- `id`: UUID (primary key)
- `trackId`: Foreign key to playlist_snapshots
- `tagId`: Foreign key to tags
- `createdAt`: Tag assignment timestamp
- Unique constraint on (trackId, tagId)

## Scoring Rubric
- **Fresh Finds appearance**: +3 points
- **Independent/DK label**: +2 points
- **Missing publisher data**: +3 points
- **Missing writer data**: +2 points
- **Major label (Sony/Warner/Universal)**: -3 points
- **Final range**: 0-10 (clamped)

## Features Implemented
### MVP Phase 1
- ✅ Data schema and TypeScript interfaces
- ✅ Beautiful dashboard with stats cards
- ✅ Track table with filtering and search
- ✅ Score-based lead badges (High/Medium/Low)
- ✅ Week selector for historical data
- ✅ Playlist filtering
- ✅ Dark/light theme toggle
- ✅ CSV export functionality
- ✅ Responsive design for all devices
- ✅ Custom playlist tracking and management

### Phase 2 (Complete)
- ✅ **MusicBrainz Integration** - Enriches tracks with songwriter data via ISRC → Recording → Work chain
- ✅ **Lead Tagging System** - Create custom tags, tag tracks, filter by tags with 8 color options
- ✅ **Batch Week Comparison** - Compare track progression across multiple weeks with trend indicators
- ✅ **Contact Discovery** - Store and manage artist contact info (Instagram, Twitter, TikTok, email, notes)
- ✅ **AI Lead Prioritization** - GPT-4o-mini powered insights: summaries, outreach strategies, talking points, scoring rationale
- ✅ **Enhanced CSV Export** - Includes all metadata and contact fields for outreach

### Future Enhancements
- **MLC API Integration** - Direct publisher/songwriter lookup via MLC Public Search API (requires OAuth2 setup)
- **Automated Weekly Scheduling** - Cron-based playlist fetching
- **Enhanced AI Features** - Batch AI analysis, competitor tracking, trend predictions

## Custom Playlist Tracking
Users can add and manage any Spotify playlists to track (no longer limited to Fresh Finds). The system supports:
- Adding playlists via URL or playlist ID
- Viewing all tracked playlists
- Removing playlists from tracking
- Automatic playlist metadata fetching from Spotify

**How to Add Playlists:**
1. Click "Manage Playlists" button in dashboard header
2. Authorize Spotify if not already authenticated
3. Enter Spotify playlist URL (e.g., `https://open.spotify.com/playlist/37i9dQZF1DWWjGdmeTyeJ6`) or just the playlist ID
4. System automatically fetches playlist name and adds it to tracked list
5. Click "Fetch Data" to import tracks from all tracked playlists

## Architecture
### Frontend
- Single-page React application
- Query-based data fetching with TanStack Query
- Modular component architecture
- Professional design system following Linear/Notion patterns

### Backend
- RESTful API endpoints
- PostgreSQL database storage
- Spotify SDK integration
- Scoring algorithm implementation

## API Routes
- `GET /api/weeks` - Get all available weeks
- `GET /api/tracks?week={week}&tagId={tagId}` - Get tracks for a week or by tag
- `GET /api/playlists` - Get list of playlists
- `GET /api/export?week={week}&format=csv` - Export data with contacts
- `POST /api/fetch-playlists` - Trigger manual playlist fetch from tracked playlists
- `POST /api/enrich-metadata` - Enrich tracks with MusicBrainz data (batch of 50)
- `POST /api/tracks/:trackId/ai-insights` - Generate AI insights for a track
- `PATCH /api/tracks/:trackId/contact` - Update contact information
- `GET /api/tracked-playlists` - Get all tracked playlists
- `POST /api/tracked-playlists` - Add a new playlist to track
- `POST /api/playlists/bulk-import` - Bulk import playlists from CSV file
- `DELETE /api/tracked-playlists/:id` - Remove a playlist from tracking
- `GET /api/tags` - Get all tags
- `POST /api/tags` - Create a new tag
- `DELETE /api/tags/:id` - Delete a tag
- `GET /api/tracks/:trackId/tags` - Get tags for a track
- `POST /api/tracks/:trackId/tags/:tagId` - Add tag to track
- `DELETE /api/tracks/:trackId/tags/:tagId` - Remove tag from track
- `GET /api/spotify/playlist/:playlistId` - Fetch playlist info from Spotify
- `GET /api/spotify/status` - Check Spotify authentication status

## User Preferences
- Professional, data-focused UI
- Clean information hierarchy
- Fast data scanning and filtering
- Actionable export features

## Recent Changes
- 2025-11-07: **Advanced Filtering System**
  - **8 Toggle Filter Badges**: Has/No ISRC, Has/No Credits, Has/No Publisher, Has/No Songwriter
  - **Multi-Filter Combinations**: Supports AND logic - all active filters must match
  - **Dynamic Filter State**: Set-based state management for efficient toggle operations
  - **Clear All Button**: Appears when filters are active to reset all filters at once
  - **hasCredits Heuristic**: Defined as publisher OR songwriter present
  - **Intuitive UX**: Badges toggle between "default" (active) and "outline" (inactive) variants
  - **Performance**: Filters apply without re-fetching data, purely client-side computation

- 2025-11-07: **Spotify Credits Scraping Enrichment**
  - **New scrapeTrackCredits() Function**: Uses Puppeteer to visit track pages and extract credits data
    - Navigates to track URLs, finds Credits section via XPath
    - Extracts songwriter, composer, producer, and publisher information
    - Handles both visible credits and 3-dot menu access
    - Robust selectors that work with Puppeteer (no invalid :has-text() selectors)
  - **POST /api/enrich-credits Endpoint**: Batch processes up to 10 tracks with 2.5s rate limiting
    - Prevents anti-bot detection with proper delays
    - Returns success/failure counts for each batch
  - **Dual Enrichment UI**: Dashboard now has two enrichment buttons:
    - "Enrich (MB)": MusicBrainz API enrichment (existing)
    - "Enrich (Credits)": Spotify Credits scraping (new)
    - Clear labeling to differentiate enrichment methods

- 2025-11-06: **Bulk CSV Import Feature**
  - **CSV Upload**: Upload CSV files with multiple playlists (URL or ID format)
  - **Auto-Detection**: Automatically detects editorial vs non-editorial playlists
  - **Duplicate Prevention**: 
    - Playlist-level: Unique constraint on tracked_playlists.playlistId
    - Track-level: Unique index on (week, playlist_id, spotify_url)
  - **Progress Tracking**: Real-time success/failure/duplicate counts
  - **Database Integrity**: Drizzle uniqueIndex ensures no duplicate tracks per week
  - **Baseline Established**: 27 playlists imported, ready for first production fetch

- 2025-11-06: **Phase 3 Complete - Scraping & Enrichment Enhancements**
  - **Improved Auto-Scroll Algorithm**: Now captures 150+ tracks from large playlists (increased from 28)
    - Max iterations: 20 → 50
    - Stability check: 3 → 5 iterations
    - Better scroll timing and targeting
  - **Spotify API Track Search**: Scraped tracks can now be enriched with ISRC codes!
    - Two-step enrichment: Spotify search → ISRC → MusicBrainz → Publisher/Songwriter
    - Converts "No ISRC" scraped tracks into fully enrichable tracks
    - Rate-limited with proper error handling
  - **Visual Badge System**: Track table now shows ISRC status and data source
    - Green "ISRC" badge = can be enriched
    - Gray "No ISRC" badge = cannot be enriched (yet)
    - Blue "API" badge = fetched via Spotify API
    - Amber "Scraped" badge = fetched via web scraping
  - **Delete Playlist Feature**: Already implemented - trash icon in PlaylistManager

- 2025-11-06: **Phase 2 Complete - All Features Implemented**
  - Contact Discovery: Added contact fields (Instagram, Twitter, TikTok, email, notes) with management UI
  - AI Lead Prioritization: GPT-4o-mini integration for outreach insights (via Replit AI Integrations)
  - MusicBrainz: Fixed songwriter enrichment to follow ISRC → Recording → Work → Songwriters chain
  - Enhanced CSV Export: Now includes all metadata and contact information
  - MLC API: Researched and documented for future integration (requires OAuth2)
  
- 2025-11-06: **Custom Playlist Tracking Implemented**
  - Pivoted from hardcoded Fresh Finds playlists to user-managed custom playlists
  - Complete CRUD operations for playlist management
  - PlaylistManager UI component with add/delete functionality

- 2025-11-06: **Phase 2 Initial Features** - MusicBrainz, Tagging, Comparison
  - MusicBrainz API integration for songwriter enrichment
  - Lead tagging system with color-coded tags and filtering
  - Batch week comparison view with trend analysis

## Implementation Status
✅ **MVP Phase 1 Complete**
- Dashboard UI, Spotify integration, scoring algorithm, filtering, export, custom playlists

✅ **Phase 2 Complete (6/6)**
1. ✅ **MusicBrainz Integration** - Enriches tracks with songwriter data via ISRC → Recording → Work chain
2. ✅ **Lead Tagging System** - Create custom tags, tag tracks, filter by tags with 8 colors
3. ✅ **Batch Week Comparison** - Compare track progression across multiple weeks with trend indicators
4. ✅ **Contact Discovery** - Store and manage social media, email, notes for outreach
5. ✅ **MLC API Research** - Documented Public Search API (OAuth2 setup deferred)
6. ✅ **AI Lead Prioritization** - GPT-4o-mini insights for summary, strategy, talking points, rationale

## How to Use

### Basic Workflow
1. **Authorize Spotify**: Click "Authorize Spotify" to connect your account (required for first-time use)
2. **Add Playlists**: Click "Manage Playlists" to add Spotify playlists to track
3. **Fetch Data**: Click "Fetch Data" to import tracks from tracked playlists
4. **Enrich Metadata**: Click "Enrich" to fetch publisher/songwriter data from MusicBrainz
5. **Tag Leads**: Use "Manage Tags" to create tags, then tag individual tracks using the "Tag" button
6. **Filter & Search**: Filter by week, playlist, tag, score range, or search tracks/artists/labels
7. **Compare Weeks**: Click "Compare" to analyze track progression across multiple weeks
8. **Export**: Download filtered results as CSV for outreach

### Feature Details

**Custom Playlist Management**
- Add any Spotify playlist via URL or ID through "Manage Playlists" dialog
- **Bulk CSV Import**: Upload a CSV file with multiple playlists (one URL or ID per row)
  - Automatically detects editorial vs non-editorial playlists
  - Shows real-time progress with success/failure/duplicate counts
  - Editorial playlists use web scraping method
  - Non-editorial playlists added to tracked list for API fetching
- System automatically fetches playlist metadata (name, ID) from Spotify API
- View all tracked playlists in the management interface
- Delete playlists from tracking with one click
- Authentication required: Clear error messages guide users to authorize if not authenticated
- Duplicate prevention: Cannot add the same playlist twice (unique constraint on playlist ID)

**MusicBrainz Enrichment**
- Automatically looks up publisher and songwriter metadata by ISRC
- Processes 50 tracks at a time with 1-second rate limiting
- Displays enriched data in track table (publisher shown below label)

**Lead Tagging**
- Create custom tags with 8 color options (blue, green, yellow, red, purple, orange, pink, gray)
- Tag individual tracks via "Tag" button popover
- Filter entire track list by tag using tag dropdown
- Tag badges appear below track names for quick visual identification
- Unique constraint prevents duplicate tags on same track

**Week Comparison**
- Select 2+ weeks to compare track progression
- View score changes with trend indicators (↗️ trending up, ↘️ trending down, — stable)
- Tracks sorted by magnitude of change
- Statistics show total compared, trending up, and trending down counts
- Matches tracks across weeks by ISRC

## Next Steps (Phase 2 Remaining)
4. Contact Discovery - Social media links, email patterns, outreach list
5. MLC API Integration - Official publisher/songwriter lookup
6. AI Lead Prioritization - Enhanced scoring, outreach suggestions
