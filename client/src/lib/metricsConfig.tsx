import { Target, Sparkles, Activity, Music2, Users, TrendingUp, Music, List, Clock, Flame, CheckCircle, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DashboardMetricsData {
  playlists: PlaylistMetricsData;
  tracks: TrackMetricsData;
  contacts: ContactMetricsData;
}

export interface PlaylistMetricsData {
  totalPlaylists: number;
  editorialPlaylists: number;
  totalPlaylistFollowers: number;
  avgTracksPerPlaylist: number;
  recentlyUpdatedPlaylists: number;
  highValuePlaylists: number;
  largePlaylists: number;
  incompletePlaylists: number;
  chartmetricLinkedPlaylists: number;
  avgFollowersPerPlaylist: number;
}

export interface TrackMetricsData {
  dealReadyTracks: number;
  avgUnsignedScore: number;
  missingPublisherTracks: number;
  selfWrittenTracks: number;
  highVelocityTracks: number;
  enrichedTracks: number;
  freshFindsTracks: number;
  indieLabelTracks: number;
  totalStreams: number;
  enrichmentPendingTracks: number;
}

export interface ContactMetricsData {
  highConfidenceUnsigned: number;
  totalSongwriters: number;
  activeSearchContacts: number;
  avgContactScore: number;
  mlcVerifiedUnsigned: number;
  watchListContacts: number;
  discoveryPoolContacts: number;
  highStreamVelocityContacts: number;
  soloWriters: number;
  enrichmentBacklogContacts: number;
}

export interface MetricCardConfig {
  label: string;
  icon: LucideIcon;
  variant: "default" | "green" | "blue" | "purple" | "yellow";
  tooltip: string;
  valueExtractor: (data: DashboardMetricsData) => string | number;
  testId: string;
  onClick?: () => void;
}

export const METRIC_CARD_CONFIG: Record<string, MetricCardConfig> = {
  // Playlist Metrics
  total_playlists: {
    label: "Total Playlists",
    icon: List,
    variant: "default",
    tooltip: "Total number of tracked playlists across all sources",
    valueExtractor: (data) => data.playlists.totalPlaylists.toLocaleString(),
    testId: "stats-total-playlists",
  },
  editorial_playlists: {
    label: "Editorial Playlists",
    icon: Sparkles,
    variant: "blue",
    tooltip: "Spotify editorial playlists (highest quality curation)",
    valueExtractor: (data) => data.playlists.editorialPlaylists.toLocaleString(),
    testId: "stats-editorial-playlists",
  },
  total_playlist_followers: {
    label: "Total Playlist Followers",
    icon: Users,
    variant: "green",
    tooltip: "Sum of all followers across tracked playlists",
    valueExtractor: (data) => data.playlists.totalPlaylistFollowers.toLocaleString(),
    testId: "stats-total-playlist-followers",
  },
  avg_tracks_per_playlist: {
    label: "Avg Tracks per Playlist",
    icon: Music,
    variant: "default",
    tooltip: "Average number of tracks per playlist",
    valueExtractor: (data) => data.playlists.avgTracksPerPlaylist.toFixed(1),
    testId: "stats-avg-tracks-per-playlist",
  },
  recently_updated_playlists: {
    label: "Recently Updated",
    icon: Clock,
    variant: "blue",
    tooltip: "Playlists refreshed in last 7 days",
    valueExtractor: (data) => data.playlists.recentlyUpdatedPlaylists.toLocaleString(),
    testId: "stats-recently-updated-playlists",
  },
  high_value_playlists: {
    label: "High-Value Playlists",
    icon: Flame,
    variant: "yellow",
    tooltip: "Playlists with >50,000 followers",
    valueExtractor: (data) => data.playlists.highValuePlaylists.toLocaleString(),
    testId: "stats-high-value-playlists",
  },
  large_playlists: {
    label: "Large Playlists",
    icon: BarChart3,
    variant: "default",
    tooltip: "Playlists with >50 tracks (deep catalog)",
    valueExtractor: (data) => data.playlists.largePlaylists.toLocaleString(),
    testId: "stats-large-playlists",
  },
  incomplete_playlists: {
    label: "Incomplete Playlists",
    icon: Activity,
    variant: "default",
    tooltip: "Playlists missing curator or genre metadata",
    valueExtractor: (data) => data.playlists.incompletePlaylists.toLocaleString(),
    testId: "stats-incomplete-playlists",
  },
  chartmetric_linked_playlists: {
    label: "Chartmetric Linked",
    icon: CheckCircle,
    variant: "green",
    tooltip: "Playlists connected to Chartmetric for analytics",
    valueExtractor: (data) => data.playlists.chartmetricLinkedPlaylists.toLocaleString(),
    testId: "stats-chartmetric-linked-playlists",
  },
  avg_followers_per_playlist: {
    label: "Avg Followers",
    icon: TrendingUp,
    variant: "default",
    tooltip: "Average followers per playlist (quality indicator)",
    valueExtractor: (data) => data.playlists.avgFollowersPerPlaylist.toLocaleString(),
    testId: "stats-avg-followers-per-playlist",
  },

  // Track Metrics
  deal_ready_tracks: {
    label: "Deal-Ready Tracks",
    icon: Target,
    variant: "green",
    tooltip: "Tracks with unsigned score 7-10 (strong publishing signals)",
    valueExtractor: (data) => data.tracks.dealReadyTracks.toLocaleString(),
    testId: "stats-deal-ready-tracks",
  },
  avg_unsigned_score: {
    label: "Avg Unsigned Score",
    icon: Activity,
    variant: "default",
    tooltip: "Average unsigned score (0-10) across all tracks",
    valueExtractor: (data) => data.tracks.avgUnsignedScore.toFixed(1),
    testId: "stats-avg-unsigned-score",
  },
  missing_publisher_tracks: {
    label: "Missing Publisher",
    icon: Sparkles,
    variant: "blue",
    tooltip: "Tracks with no publisher data (highest unsigned indicator)",
    valueExtractor: (data) => data.tracks.missingPublisherTracks.toLocaleString(),
    testId: "stats-missing-publisher-tracks",
  },
  self_written_tracks: {
    label: "Self-Written Tracks",
    icon: Music2,
    variant: "default",
    tooltip: "Tracks where artist wrote their own song",
    valueExtractor: (data) => data.tracks.selfWrittenTracks.toLocaleString(),
    testId: "stats-self-written-tracks",
  },
  high_velocity_tracks: {
    label: "High Velocity",
    icon: TrendingUp,
    variant: "green",
    tooltip: "Tracks with >50% week-over-week growth",
    valueExtractor: (data) => data.tracks.highVelocityTracks.toLocaleString(),
    testId: "stats-high-velocity-tracks",
  },
  enriched_tracks: {
    label: "Enriched Tracks",
    icon: CheckCircle,
    variant: "green",
    tooltip: "Tracks with complete metadata enrichment",
    valueExtractor: (data) => data.tracks.enrichedTracks.toLocaleString(),
    testId: "stats-enriched-tracks",
  },
  fresh_finds_tracks: {
    label: "Fresh Finds",
    icon: Sparkles,
    variant: "blue",
    tooltip: "Tracks from Spotify Fresh Finds playlists",
    valueExtractor: (data) => data.tracks.freshFindsTracks.toLocaleString(),
    testId: "stats-fresh-finds-tracks",
  },
  indie_label_tracks: {
    label: "Indie Label",
    icon: Music,
    variant: "default",
    tooltip: "Tracks on indie/DIY labels (unsigned signal)",
    valueExtractor: (data) => data.tracks.indieLabelTracks.toLocaleString(),
    testId: "stats-indie-label-tracks",
  },
  total_streams: {
    label: "Total Streams",
    icon: BarChart3,
    variant: "purple",
    tooltip: "Sum of all stream counts across tracks",
    valueExtractor: (data) => data.tracks.totalStreams.toLocaleString(),
    testId: "stats-total-streams",
  },
  enrichment_pending_tracks: {
    label: "Enrichment Pending",
    icon: Activity,
    variant: "default",
    tooltip: "Tracks awaiting metadata enrichment",
    valueExtractor: (data) => data.tracks.enrichmentPendingTracks.toLocaleString(),
    testId: "stats-enrichment-pending-tracks",
  },

  // Contact Metrics
  high_confidence_unsigned: {
    label: "High-Confidence Unsigned",
    icon: Target,
    variant: "green",
    tooltip: "MLC-verified unsigned songwriters with scores 7-10 (hottest leads)",
    valueExtractor: (data) => data.contacts.highConfidenceUnsigned.toLocaleString(),
    testId: "stats-high-confidence-unsigned",
  },
  total_songwriters: {
    label: "Total Songwriters",
    icon: Users,
    variant: "default",
    tooltip: "Total unique songwriters tracked",
    valueExtractor: (data) => data.contacts.totalSongwriters.toLocaleString(),
    testId: "stats-total-songwriters",
  },
  active_search_contacts: {
    label: "Active Search",
    icon: Target,
    variant: "blue",
    tooltip: "Contacts in Active Search pipeline stage",
    valueExtractor: (data) => data.contacts.activeSearchContacts.toLocaleString(),
    testId: "stats-active-search-contacts",
  },
  avg_contact_score: {
    label: "Avg Contact Score",
    icon: Activity,
    variant: "default",
    tooltip: "Average unsigned score across all contacts",
    valueExtractor: (data) => data.contacts.avgContactScore.toFixed(1),
    testId: "stats-avg-contact-score",
  },
  mlc_verified_unsigned: {
    label: "MLC-Verified Unsigned",
    icon: Sparkles,
    variant: "blue",
    tooltip: "Contacts confirmed unsigned via MLC search",
    valueExtractor: (data) => data.contacts.mlcVerifiedUnsigned.toLocaleString(),
    testId: "stats-mlc-verified-unsigned",
  },
  watch_list_contacts: {
    label: "Watch List",
    icon: Clock,
    variant: "yellow",
    tooltip: "Contacts in Watch List stage (warm leads)",
    valueExtractor: (data) => data.contacts.watchListContacts.toLocaleString(),
    testId: "stats-watch-list-contacts",
  },
  discovery_pool_contacts: {
    label: "Discovery Pool",
    icon: List,
    variant: "default",
    tooltip: "Contacts in Discovery Pool stage (cold leads)",
    valueExtractor: (data) => data.contacts.discoveryPoolContacts.toLocaleString(),
    testId: "stats-discovery-pool-contacts",
  },
  high_stream_velocity_contacts: {
    label: "High Stream Velocity",
    icon: TrendingUp,
    variant: "green",
    tooltip: "Contacts with tracks >50% WoW growth",
    valueExtractor: (data) => data.contacts.highStreamVelocityContacts.toLocaleString(),
    testId: "stats-high-stream-velocity-contacts",
  },
  solo_writers: {
    label: "Solo Writers",
    icon: Music2,
    variant: "default",
    tooltip: "Contacts writing alone (no collaborators)",
    valueExtractor: (data) => data.contacts.soloWriters.toLocaleString(),
    testId: "stats-solo-writers",
  },
  enrichment_backlog_contacts: {
    label: "Enrichment Backlog",
    icon: Activity,
    variant: "default",
    tooltip: "Contacts never searched in MLC (need attention)",
    valueExtractor: (data) => data.contacts.enrichmentBacklogContacts.toLocaleString(),
    testId: "stats-enrichment-backlog-contacts",
  },
};

export function getMetricConfig(metricId: string): MetricCardConfig | null {
  return METRIC_CARD_CONFIG[metricId] || null;
}
