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

export interface MetricCardConfig<T = any> {
  getProps: (data: T) => {
    title: string;
    value: string | number;
    icon: LucideIcon;
    variant: "default" | "green" | "blue" | "purple" | "yellow";
    tooltip: string;
    testId: string;
    onClick?: () => void;
  };
}

export const METRIC_CARD_CONFIG = {
  playlists: {
    total_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Total Playlists",
        value: data.totalPlaylists.toLocaleString(),
        icon: List,
        variant: "default" as const,
        tooltip: "Total number of tracked playlists across all sources",
        testId: "stats-total-playlists",
      }),
    },
    editorial_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Editorial Playlists",
        value: data.editorialPlaylists.toLocaleString(),
        icon: Sparkles,
        variant: "blue" as const,
        tooltip: "Spotify editorial playlists (highest quality curation)",
        testId: "stats-editorial-playlists",
      }),
    },
    total_playlist_followers: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Total Playlist Followers",
        value: data.totalPlaylistFollowers.toLocaleString(),
        icon: Users,
        variant: "green" as const,
        tooltip: "Sum of all followers across tracked playlists",
        testId: "stats-total-playlist-followers",
      }),
    },
    avg_tracks_per_playlist: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Avg Tracks per Playlist",
        value: data.avgTracksPerPlaylist.toFixed(1),
        icon: Music,
        variant: "default" as const,
        tooltip: "Average number of tracks per playlist",
        testId: "stats-avg-tracks-per-playlist",
      }),
    },
    recently_updated_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Recently Updated",
        value: data.recentlyUpdatedPlaylists.toLocaleString(),
        icon: Clock,
        variant: "blue" as const,
        tooltip: "Playlists refreshed in last 7 days",
        testId: "stats-recently-updated-playlists",
      }),
    },
    high_value_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "High-Value Playlists",
        value: data.highValuePlaylists.toLocaleString(),
        icon: Flame,
        variant: "yellow" as const,
        tooltip: "Playlists with >50,000 followers",
        testId: "stats-high-value-playlists",
      }),
    },
    large_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Large Playlists",
        value: data.largePlaylists.toLocaleString(),
        icon: BarChart3,
        variant: "default" as const,
        tooltip: "Playlists with >50 tracks (deep catalog)",
        testId: "stats-large-playlists",
      }),
    },
    incomplete_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Incomplete Playlists",
        value: data.incompletePlaylists.toLocaleString(),
        icon: Activity,
        variant: "default" as const,
        tooltip: "Playlists missing curator or genre metadata",
        testId: "stats-incomplete-playlists",
      }),
    },
    chartmetric_linked_playlists: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Chartmetric Linked",
        value: data.chartmetricLinkedPlaylists.toLocaleString(),
        icon: CheckCircle,
        variant: "green" as const,
        tooltip: "Playlists connected to Chartmetric for analytics",
        testId: "stats-chartmetric-linked-playlists",
      }),
    },
    avg_followers_per_playlist: {
      getProps: (data: PlaylistMetricsData) => ({
        title: "Avg Followers",
        value: data.avgFollowersPerPlaylist.toLocaleString(),
        icon: TrendingUp,
        variant: "default" as const,
        tooltip: "Average followers per playlist (quality indicator)",
        testId: "stats-avg-followers-per-playlist",
      }),
    },
  },
  tracks: {
    deal_ready_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Deal-Ready Tracks",
        value: data.dealReadyTracks.toLocaleString(),
        icon: Target,
        variant: "green" as const,
        tooltip: "Tracks with unsigned score 7-10 (strong publishing signals)",
        testId: "stats-deal-ready-tracks",
      }),
    },
    avg_unsigned_score: {
      getProps: (data: TrackMetricsData) => ({
        title: "Avg Unsigned Score",
        value: data.avgUnsignedScore.toFixed(1),
        icon: Activity,
        variant: "default" as const,
        tooltip: "Average unsigned score (0-10) across all tracks",
        testId: "stats-avg-unsigned-score",
      }),
    },
    missing_publisher_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Missing Publisher",
        value: data.missingPublisherTracks.toLocaleString(),
        icon: Sparkles,
        variant: "blue" as const,
        tooltip: "Tracks with no publisher data (highest unsigned indicator)",
        testId: "stats-missing-publisher-tracks",
      }),
    },
    self_written_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Self-Written Tracks",
        value: data.selfWrittenTracks.toLocaleString(),
        icon: Music2,
        variant: "default" as const,
        tooltip: "Tracks where artist wrote their own song",
        testId: "stats-self-written-tracks",
      }),
    },
    high_velocity_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "High Velocity",
        value: data.highVelocityTracks.toLocaleString(),
        icon: TrendingUp,
        variant: "green" as const,
        tooltip: "Tracks with >50% week-over-week growth",
        testId: "stats-high-velocity-tracks",
      }),
    },
    enriched_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Enriched Tracks",
        value: data.enrichedTracks.toLocaleString(),
        icon: CheckCircle,
        variant: "green" as const,
        tooltip: "Tracks with complete metadata enrichment",
        testId: "stats-enriched-tracks",
      }),
    },
    fresh_finds_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Fresh Finds",
        value: data.freshFindsTracks.toLocaleString(),
        icon: Sparkles,
        variant: "blue" as const,
        tooltip: "Tracks from Spotify Fresh Finds playlists",
        testId: "stats-fresh-finds-tracks",
      }),
    },
    indie_label_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Indie Label",
        value: data.indieLabelTracks.toLocaleString(),
        icon: Music,
        variant: "default" as const,
        tooltip: "Tracks on indie/DIY labels (unsigned signal)",
        testId: "stats-indie-label-tracks",
      }),
    },
    total_streams: {
      getProps: (data: TrackMetricsData) => ({
        title: "Total Streams",
        value: data.totalStreams.toLocaleString(),
        icon: BarChart3,
        variant: "purple" as const,
        tooltip: "Sum of all stream counts across tracks",
        testId: "stats-total-streams",
      }),
    },
    enrichment_pending_tracks: {
      getProps: (data: TrackMetricsData) => ({
        title: "Enrichment Pending",
        value: data.enrichmentPendingTracks.toLocaleString(),
        icon: Activity,
        variant: "default" as const,
        tooltip: "Tracks awaiting metadata enrichment",
        testId: "stats-enrichment-pending-tracks",
      }),
    },
  },
  contacts: {
    high_confidence_unsigned: {
      getProps: (data: ContactMetricsData) => ({
        title: "High-Confidence Unsigned",
        value: data.highConfidenceUnsigned.toLocaleString(),
        icon: Target,
        variant: "green" as const,
        tooltip: "MLC-verified unsigned songwriters with scores 7-10 (hottest leads)",
        testId: "stats-high-confidence-unsigned",
      }),
    },
    total_songwriters: {
      getProps: (data: ContactMetricsData) => ({
        title: "Total Songwriters",
        value: data.totalSongwriters.toLocaleString(),
        icon: Users,
        variant: "default" as const,
        tooltip: "Total unique songwriters tracked",
        testId: "stats-total-songwriters",
      }),
    },
    active_search_contacts: {
      getProps: (data: ContactMetricsData) => ({
        title: "Active Search",
        value: data.activeSearchContacts.toLocaleString(),
        icon: Target,
        variant: "blue" as const,
        tooltip: "Contacts in Active Search pipeline stage",
        testId: "stats-active-search-contacts",
      }),
    },
    avg_contact_score: {
      getProps: (data: ContactMetricsData) => ({
        title: "Avg Contact Score",
        value: data.avgContactScore.toFixed(1),
        icon: Activity,
        variant: "default" as const,
        tooltip: "Average unsigned score across all contacts",
        testId: "stats-avg-contact-score",
      }),
    },
    mlc_verified_unsigned: {
      getProps: (data: ContactMetricsData) => ({
        title: "MLC-Verified Unsigned",
        value: data.mlcVerifiedUnsigned.toLocaleString(),
        icon: Sparkles,
        variant: "blue" as const,
        tooltip: "Contacts confirmed unsigned via MLC search",
        testId: "stats-mlc-verified-unsigned",
      }),
    },
    watch_list_contacts: {
      getProps: (data: ContactMetricsData) => ({
        title: "Watch List",
        value: data.watchListContacts.toLocaleString(),
        icon: Clock,
        variant: "yellow" as const,
        tooltip: "Contacts in Watch List stage (warm leads)",
        testId: "stats-watch-list-contacts",
      }),
    },
    discovery_pool_contacts: {
      getProps: (data: ContactMetricsData) => ({
        title: "Discovery Pool",
        value: data.discoveryPoolContacts.toLocaleString(),
        icon: List,
        variant: "default" as const,
        tooltip: "Contacts in Discovery Pool stage (cold leads)",
        testId: "stats-discovery-pool-contacts",
      }),
    },
    high_stream_velocity_contacts: {
      getProps: (data: ContactMetricsData) => ({
        title: "High Stream Velocity",
        value: data.highStreamVelocityContacts.toLocaleString(),
        icon: TrendingUp,
        variant: "green" as const,
        tooltip: "Contacts with tracks >50% WoW growth",
        testId: "stats-high-stream-velocity-contacts",
      }),
    },
    solo_writers: {
      getProps: (data: ContactMetricsData) => ({
        title: "Solo Writers",
        value: data.soloWriters.toLocaleString(),
        icon: Music2,
        variant: "default" as const,
        tooltip: "Contacts writing alone (no collaborators)",
        testId: "stats-solo-writers",
      }),
    },
    enrichment_backlog_contacts: {
      getProps: (data: ContactMetricsData) => ({
        title: "Enrichment Backlog",
        value: data.enrichmentBacklogContacts.toLocaleString(),
        icon: Activity,
        variant: "default" as const,
        tooltip: "Contacts never searched in MLC (need attention)",
        testId: "stats-enrichment-backlog-contacts",
      }),
    },
  },
} as const;

export function getMetricConfig(section: 'playlists' | 'tracks' | 'contacts', metricId: string): MetricCardConfig | null {
  const sectionConfig = METRIC_CARD_CONFIG[section];
  return (sectionConfig as any)[metricId] || null;
}
