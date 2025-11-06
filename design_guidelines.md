# Design Guidelines: AI Pub Feed MVP

## Design Approach
**System:** Modern Dashboard Pattern (Linear-inspired data clarity + Notion-like information architecture)

**Rationale:** This is a data-intensive analytics tool requiring efficient information scanning, clear hierarchy, and professional polish. The design prioritizes rapid data comprehension over visual flair while maintaining modern aesthetics.

## Typography System
- **Primary Font:** Inter (via Google Fonts CDN)
- **Hierarchy:**
  - Page titles: text-3xl font-bold (32px)
  - Section headers: text-xl font-semibold (20px)
  - Table headers: text-sm font-medium uppercase tracking-wide (14px)
  - Body/data: text-base font-normal (16px)
  - Metadata/labels: text-sm (14px)
  - Badges/tags: text-xs font-medium (12px)

## Layout System
**Spacing Primitives:** Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4 or p-6
- Section spacing: space-y-6 or space-y-8
- Card gaps: gap-4
- Table cell padding: px-4 py-3

**Container Strategy:**
- Dashboard max-width: max-w-7xl mx-auto px-4
- Sidebar (if used): w-64 fixed
- Main content: flex-1 with responsive padding

## Component Library

### Navigation
- **Top Bar:** Fixed header with logo, week selector dropdown, export button
- Height: h-16
- Layout: Flex justify-between items-center px-6
- Include: App title (font-bold text-xl), current week display, primary actions

### Data Tables
- **Track Table:** Primary component showing playlist tracks
- Structure: Full-width responsive table with hover states
- Columns: Track Name, Artist, Playlist Badge, Label, ISRC, Unsigned Score Badge, Actions
- Row height: Comfortable spacing (h-14)
- Sticky header: position-sticky top-0
- Zebra striping: Alternate row treatment for scannability

### Badges & Scoring
- **Unsigned Score Badge:** Pill-shaped badge with score indicator
  - High (7-10): Prominent treatment, border-2
  - Medium (4-6): Standard treatment, border
  - Low (0-3): Subtle treatment
  - Size: px-3 py-1 rounded-full text-xs font-semibold
  
- **Playlist Tags:** Rounded badges showing playlist source
  - Size: px-2.5 py-0.5 rounded text-xs font-medium
  - Truncate long names with max-w-[150px]

### Cards
- **Stats Overview Cards:** Row of 3-4 metric cards at dashboard top
- Structure: Grid grid-cols-1 md:grid-cols-4 gap-4
- Card padding: p-6 rounded-lg border
- Content: Large number (text-3xl font-bold), label below (text-sm)
- Examples: Total Tracks This Week, High Potential Leads, Playlists Tracked, Avg Score

### Filters & Controls
- **Filter Bar:** Horizontal bar above table
- Layout: flex flex-wrap gap-4 items-center p-4 rounded-lg border mb-6
- Controls: Playlist multi-select dropdown, score range slider, search input, date range picker
- Search: Full-width on mobile, w-64 on desktop with search icon

### Export Section
- **Export Button:** Prominent button in top navigation
- Include dropdown for format selection (CSV, JSON)
- Icon: Download icon from Heroicons

### Historical Data Viewer
- **Week Selector:** Dropdown in top nav showing all available weeks
- Format: "Week of Jan 5, 2025"
- Visual indicator for current week vs historical

## Page Structure

### Dashboard Layout
```
┌─────────────────────────────────────────┐
│  Top Navigation Bar (h-16)              │
├─────────────────────────────────────────┤
│  Stats Cards Row (4 cards)              │
├─────────────────────────────────────────┤
│  Filter Bar (playlist, score, search)   │
├─────────────────────────────────────────┤
│  Main Data Table                        │
│  (with pagination at bottom)            │
└─────────────────────────────────────────┘
```

### Empty States
- Center aligned with icon, heading, description
- Icon size: w-16 h-16 mb-4
- Heading: text-lg font-semibold mb-2
- Use for: No data yet, no results from filters

## Responsive Behavior
- **Desktop (lg:):** Full table with all columns visible
- **Tablet (md:):** Hide less critical columns (ISRC), stack filters
- **Mobile:** Card-based layout instead of table, stack all stats cards

## Interactions (Minimal)
- Table row hover: Subtle background shift
- Button states: Standard focus rings, no custom animations
- Dropdown transitions: Simple fade-in (duration-200)
- No scroll animations or page transitions

## Data Visualization
- **Score Distribution:** Optional horizontal bar chart showing score ranges
- Keep charts minimal: Simple bars, no gradients
- Use within a card: p-6 rounded-lg border

## Critical Design Principles
1. **Information Density:** Maximize data visible per screen without clutter
2. **Scannability:** Strong typographic hierarchy and consistent spacing
3. **Professional Polish:** Clean borders, consistent rounding (rounded-lg), refined spacing
4. **Action-Oriented:** Export and filter controls prominently placed
5. **Mobile-Ready:** Graceful degradation to card-based mobile view