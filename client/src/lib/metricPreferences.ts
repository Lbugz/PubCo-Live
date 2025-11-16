export type TrackMetricId = 
  | 'deal-ready-tracks'
  | 'avg-unsigned-score'
  | 'missing-publisher'
  | 'high-stream-velocity'
  | 'self-written-tracks'
  | 'indie-label-tracks';

export type PublishingMetricId =
  | 'high-confidence-unsigned'
  | 'publishing-opportunities'
  | 'enrichment-backlog'
  | 'solo-writers'
  | 'active-collaborators'
  | 'with-top-publisher';

export type MetricId = TrackMetricId | PublishingMetricId;

export interface MetricPreferences {
  trackMetrics: [TrackMetricId | null, TrackMetricId | null, TrackMetricId | null];
  publishingIntelligence: [PublishingMetricId | null, PublishingMetricId | null, PublishingMetricId | null];
}

const DEFAULT_PREFERENCES: MetricPreferences = {
  trackMetrics: ['deal-ready-tracks', 'avg-unsigned-score', 'missing-publisher'],
  publishingIntelligence: ['high-confidence-unsigned', 'publishing-opportunities', 'enrichment-backlog'],
};

export interface MetricOption {
  id: TrackMetricId | PublishingMetricId;
  label: string;
  description: string;
  category: 'Playlist' | 'Tracks' | 'Contacts';
}

export const TRACK_METRIC_OPTIONS: MetricOption[] = [
  { 
    id: 'deal-ready-tracks', 
    label: 'Deal-Ready Tracks', 
    description: 'Tracks with unsigned score 7-10 (strong publishing signals)',
    category: 'Tracks'
  },
  { 
    id: 'avg-unsigned-score', 
    label: 'Avg Unsigned Score', 
    description: 'Average unsigned score (0-10) across all tracks',
    category: 'Tracks'
  },
  { 
    id: 'missing-publisher', 
    label: 'Missing Publisher', 
    description: 'Tracks with no publisher data after enrichment (+5 points)',
    category: 'Tracks'
  },
  { 
    id: 'high-stream-velocity', 
    label: 'High Stream Velocity', 
    description: 'Tracks with >50% week-over-week stream growth',
    category: 'Tracks'
  },
  { 
    id: 'self-written-tracks', 
    label: 'Self-Written Tracks', 
    description: 'Tracks where artist wrote their own song (+3 points)',
    category: 'Tracks'
  },
  { 
    id: 'indie-label-tracks', 
    label: 'Indie Label Tracks', 
    description: 'Tracks released on independent/DIY labels (+2 points)',
    category: 'Tracks'
  },
];

export const PUBLISHING_METRIC_OPTIONS: MetricOption[] = [
  { 
    id: 'high-confidence-unsigned', 
    label: 'High-Confidence Unsigned', 
    description: 'MLC-verified unsigned songwriters with scores 7-10 (hottest leads)',
    category: 'Contacts'
  },
  { 
    id: 'publishing-opportunities', 
    label: 'Publishing Opportunities', 
    description: 'All MLC-verified unsigned songwriters ready for outreach',
    category: 'Contacts'
  },
  { 
    id: 'enrichment-backlog', 
    label: 'Enrichment Backlog', 
    description: 'Songwriters not yet searched in MLC (run enrichment to discover)',
    category: 'Contacts'
  },
  { 
    id: 'solo-writers', 
    label: 'Solo Writers', 
    description: 'Songwriters with no co-writer collaborations (0 collaborators)',
    category: 'Contacts'
  },
  { 
    id: 'active-collaborators', 
    label: 'Active Collaborators', 
    description: 'Songwriters with 3+ co-writers (frequent collaborators)',
    category: 'Contacts'
  },
  { 
    id: 'with-top-publisher', 
    label: 'With Top Publisher', 
    description: 'Songwriters with identified top publisher (market share data available)',
    category: 'Contacts'
  },
];

const STORAGE_KEY = 'metric-preferences';

export function getMetricPreferences(): MetricPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load metric preferences:', error);
  }
  return DEFAULT_PREFERENCES;
}

export function saveMetricPreferences(preferences: MetricPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save metric preferences:', error);
  }
}

export function isMetricEnabled(metricId: MetricId): boolean {
  const prefs = getMetricPreferences();
  const allMetrics = [...prefs.trackMetrics, ...prefs.publishingIntelligence];
  return allMetrics.some(m => m === metricId);
}
