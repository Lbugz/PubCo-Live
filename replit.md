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
The frontend is a single-page React application built with a modular component architecture, a professional design system inspired by Linear/Notion patterns, and dark/light theme toggle. It emphasizes a clean information hierarchy, fast data scanning, filtering, and actionable export features. The dashboard provides a unified control panel for all data operations, including fetching, enrichment, and export, and features a robust filtering system with 8 toggle badges for detailed data exploration.

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