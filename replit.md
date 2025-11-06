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
- 2025-01-05: Initial MVP implementation with schema, frontend components, and beautiful UI
- Design system configured with Inter font, consistent spacing, and professional color palette
- Comprehensive track filtering and search capabilities
- Theme support (light/dark mode)

## Next Steps
1. Complete backend API implementation
2. Integrate Spotify data fetching
3. Implement PostgreSQL persistence
4. Test end-to-end workflows
5. Deploy for production use
