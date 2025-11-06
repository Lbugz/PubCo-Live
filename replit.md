# AI Pub Feed MVP

## Project Overview
An automated Spotify playlist tracking and music publishing discovery platform that identifies unsigned artists and unpublished songwriters from Fresh Finds playlists.

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
- `unsignedScore`: 0-10 scoring (likelihood of unsigned/unpublished)
- `addedAt`: When track was added to playlist
- `createdAt`: Snapshot creation timestamp

## Scoring Rubric
- **Fresh Finds appearance**: +3 points
- **Independent/DK label**: +2 points
- **Missing publisher data**: +3 points
- **Missing writer data**: +2 points
- **Major label (Sony/Warner/Universal)**: -3 points
- **Final range**: 0-10 (clamped)

## Features Implemented
### MVP Phase 1 (Current)
- ✅ Data schema and TypeScript interfaces
- ✅ Beautiful dashboard with stats cards
- ✅ Track table with filtering and search
- ✅ Score-based lead badges (High/Medium/Low)
- ✅ Week selector for historical data
- ✅ Playlist filtering
- ✅ Dark/light theme toggle
- ✅ CSV export functionality
- ✅ Responsive design for all devices

### Planned Phase 2 (Future)
- MLC API integration for publisher/songwriter enrichment
- MusicBrainz API for missing metadata
- Contact discovery and lead tagging
- AI-assisted outreach suggestions
- Batch comparison across weeks

## Fresh Finds Playlists Tracked
1. Fresh Finds (main)
2. Fresh Finds Pop
3. Fresh Finds Dance
4. Fresh Finds Experimental
5. Fresh Finds Hip-Hop
6. Fresh Finds Rock
7. Fresh Finds Latin
8. Fresh Finds R&B
9. Fresh Finds Indie
10. Fresh Finds Jazz

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
- `GET /api/tracks?week={week}` - Get tracks for a week
- `GET /api/playlists` - Get list of playlists
- `GET /api/export?week={week}&format=csv` - Export data
- `POST /api/fetch-playlists` - Trigger manual playlist fetch

## User Preferences
- Professional, data-focused UI
- Clean information hierarchy
- Fast data scanning and filtering
- Actionable export features

## Recent Changes
- 2025-11-06: **Phase 2 Features Implemented** - MusicBrainz, Tagging, Comparison
- MusicBrainz API integration for publisher/songwriter enrichment
- Lead tagging system with color-coded tags and filtering
- Batch week comparison view with trend analysis
- Enhanced track table with tag badges and metadata display
- Improved cache management with React Query v5

## Implementation Status
✅ **MVP Phase 1 Complete**
- Dashboard UI, Spotify integration, scoring algorithm, filtering, export

✅ **Phase 2 Progress (3/6 Complete)**
1. ✅ **MusicBrainz Integration** - Enriches tracks with publisher/songwriter data via ISRC lookup
2. ✅ **Lead Tagging System** - Create custom tags, tag tracks, filter by tags
3. ✅ **Batch Week Comparison** - Compare track progression across multiple weeks
4. ⏳ Contact Discovery - (Not started)
5. ⏳ MLC API Integration - (Not started)
6. ⏳ AI Lead Prioritization - (Not started)

## How to Use

### Basic Workflow
1. **Fetch Data**: Click "Fetch Data" to import Fresh Finds tracks (requires Spotify connection)
2. **Enrich Metadata**: Click "Enrich" to fetch publisher/songwriter data from MusicBrainz
3. **Tag Leads**: Use "Manage Tags" to create tags, then tag individual tracks using the "Tag" button
4. **Filter & Search**: Filter by week, playlist, tag, score range, or search tracks/artists/labels
5. **Compare Weeks**: Click "Compare" to analyze track progression across multiple weeks
6. **Export**: Download filtered results as CSV for outreach

### Feature Details

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
