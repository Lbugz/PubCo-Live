export interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  section: 'playlists' | 'tracks' | 'contacts';
}

export const PLAYLIST_METRICS: MetricDefinition[] = [
  {
    id: 'total_playlists',
    label: 'Total Playlists',
    description: 'Total number of tracked playlists across all sources',
    section: 'playlists',
  },
  {
    id: 'editorial_playlists',
    label: 'Editorial Playlists',
    description: 'Spotify editorial playlists (highest quality curation)',
    section: 'playlists',
  },
  {
    id: 'total_playlist_followers',
    label: 'Total Playlist Followers',
    description: 'Sum of all followers across tracked playlists',
    section: 'playlists',
  },
  {
    id: 'avg_tracks_per_playlist',
    label: 'Avg Tracks per Playlist',
    description: 'Average number of tracks per playlist',
    section: 'playlists',
  },
  {
    id: 'recently_updated_playlists',
    label: 'Recently Updated',
    description: 'Playlists refreshed in last 7 days',
    section: 'playlists',
  },
  {
    id: 'high_value_playlists',
    label: 'High-Value Playlists',
    description: 'Playlists with >50,000 followers',
    section: 'playlists',
  },
  {
    id: 'large_playlists',
    label: 'Large Playlists',
    description: 'Playlists with >50 tracks (deep catalog)',
    section: 'playlists',
  },
  {
    id: 'incomplete_playlists',
    label: 'Incomplete Playlists',
    description: 'Playlists missing curator or genre metadata',
    section: 'playlists',
  },
  {
    id: 'chartmetric_linked_playlists',
    label: 'Chartmetric Linked',
    description: 'Playlists connected to Chartmetric for analytics',
    section: 'playlists',
  },
  {
    id: 'avg_followers_per_playlist',
    label: 'Avg Followers',
    description: 'Average followers per playlist (quality indicator)',
    section: 'playlists',
  },
];

export const TRACK_METRICS: MetricDefinition[] = [
  {
    id: 'deal_ready_tracks',
    label: 'Deal-Ready Tracks',
    description: 'Tracks with unsigned score 7-10 (strong publishing signals)',
    section: 'tracks',
  },
  {
    id: 'avg_unsigned_score',
    label: 'Avg Unsigned Score',
    description: 'Average unsigned score across all tracks',
    section: 'tracks',
  },
  {
    id: 'missing_publisher_tracks',
    label: 'Missing Publisher',
    description: 'Tracks with no publisher data (highest unsigned indicator)',
    section: 'tracks',
  },
  {
    id: 'self_written_tracks',
    label: 'Self-Written Tracks',
    description: 'Tracks where artist wrote their own song',
    section: 'tracks',
  },
  {
    id: 'high_velocity_tracks',
    label: 'High Velocity',
    description: 'Tracks with >50% week-over-week growth',
    section: 'tracks',
  },
  {
    id: 'enriched_tracks',
    label: 'Enriched Tracks',
    description: 'Tracks with complete metadata enrichment',
    section: 'tracks',
  },
  {
    id: 'fresh_finds_tracks',
    label: 'Fresh Finds',
    description: 'Tracks from Spotify Fresh Finds playlists',
    section: 'tracks',
  },
  {
    id: 'indie_label_tracks',
    label: 'Indie Label',
    description: 'Tracks on indie/DIY labels (unsigned signal)',
    section: 'tracks',
  },
  {
    id: 'total_streams',
    label: 'Total Streams',
    description: 'Sum of all stream counts across tracks',
    section: 'tracks',
  },
  {
    id: 'enrichment_pending_tracks',
    label: 'Enrichment Pending',
    description: 'Tracks awaiting metadata enrichment',
    section: 'tracks',
  },
];

export const CONTACT_METRICS: MetricDefinition[] = [
  {
    id: 'high_confidence_unsigned',
    label: 'High-Confidence Unsigned',
    description: 'MLC-verified unsigned songwriters with scores 7-10 (hottest leads)',
    section: 'contacts',
  },
  {
    id: 'total_songwriters',
    label: 'Total Songwriters',
    description: 'Total unique songwriters tracked',
    section: 'contacts',
  },
  {
    id: 'active_search_contacts',
    label: 'Active Search',
    description: 'Contacts in Active Search pipeline stage',
    section: 'contacts',
  },
  {
    id: 'avg_contact_score',
    label: 'Avg Contact Score',
    description: 'Average unsigned score across all contacts',
    section: 'contacts',
  },
  {
    id: 'mlc_verified_unsigned',
    label: 'MLC-Verified Unsigned',
    description: 'Contacts confirmed unsigned via MLC search',
    section: 'contacts',
  },
  {
    id: 'watch_list_contacts',
    label: 'Watch List',
    description: 'Contacts in Watch List stage (warm leads)',
    section: 'contacts',
  },
  {
    id: 'discovery_pool_contacts',
    label: 'Discovery Pool',
    description: 'Contacts in Discovery Pool stage (cold leads)',
    section: 'contacts',
  },
  {
    id: 'high_stream_velocity_contacts',
    label: 'High Stream Velocity',
    description: 'Contacts with tracks >50% WoW growth',
    section: 'contacts',
  },
  {
    id: 'solo_writers',
    label: 'Solo Writers',
    description: 'Contacts writing alone (no collaborators)',
    section: 'contacts',
  },
  {
    id: 'enrichment_backlog_contacts',
    label: 'Enrichment Backlog',
    description: 'Contacts never searched in MLC (need attention)',
    section: 'contacts',
  },
];

export interface DashboardMetricPreferences {
  playlists: [string, string, string];
  tracks: [string, string, string];
  contacts: [string, string, string];
}

export const DEFAULT_METRIC_PREFERENCES: DashboardMetricPreferences = {
  playlists: ['editorial_playlists', 'total_playlist_followers', 'recently_updated_playlists'],
  tracks: ['deal_ready_tracks', 'missing_publisher_tracks', 'high_velocity_tracks'],
  contacts: ['high_confidence_unsigned', 'mlc_verified_unsigned', 'active_search_contacts'],
};

export const STORAGE_KEY = 'dashboardMetricPreferences';
