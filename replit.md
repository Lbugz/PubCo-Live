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
- 2025-11-06: **MVP Complete** - Full implementation deployed and functional
- Beautiful dashboard UI with Inter font, consistent spacing, and professional color palette
- PostgreSQL database schema created and connected
- All API endpoints implemented and tested (/api/weeks, /api/tracks, /api/playlists, /api/export, /api/fetch-playlists)
- Spotify integration working via Replit connection
- Scoring algorithm implemented and functional
- Theme support (light/dark mode) with smooth transitions
- CSV export functionality working
- Comprehensive filtering, search, and data visualization

## Implementation Status
✅ MVP Phase 1 Complete
- All frontend components built and polished
- Backend API fully implemented
- Database persistence working
- Spotify integration configured
- Scoring system operational
- Export functionality ready
- Responsive design for all devices
- Dark/light theme toggle

## How to Use
1. Click "Fetch Data" button to populate database from Spotify Fresh Finds playlists (takes 30-60 seconds)
2. View tracks with unsigned likelihood scores (0-10)
3. Filter by playlist, search by track/artist/label, or adjust score range
4. Export results to CSV for outreach
5. Navigate between weeks to track historical data
6. Toggle between light/dark themes

## Next Steps (Phase 2)
1. Schedule automated weekly data fetching (cron job)
2. Add MLC API integration for publisher/songwriter data enrichment
3. Implement contact discovery features
4. Add batch comparison across weeks
5. Create AI-assisted outreach suggestions
6. Deploy for production use
