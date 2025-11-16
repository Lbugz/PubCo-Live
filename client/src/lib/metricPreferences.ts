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
  | 'mlc-verified-unsigned'
  | 'musicbrainz-found'
  | 'total-songwriters';

export type MetricId = TrackMetricId | PublishingMetricId;

export interface MetricPreferences {
  trackMetrics: [TrackMetricId | null, TrackMetricId | null, TrackMetricId | null];
  publishingIntelligence: [PublishingMetricId | null, PublishingMetricId | null, PublishingMetricId | null];
}

const DEFAULT_PREFERENCES: MetricPreferences = {
  trackMetrics: ['deal-ready-tracks', 'avg-unsigned-score', 'missing-publisher'],
  publishingIntelligence: ['high-confidence-unsigned', 'publishing-opportunities', 'enrichment-backlog'],
};

export const TRACK_METRIC_OPTIONS: { id: TrackMetricId; label: string }[] = [
  { id: 'deal-ready-tracks', label: 'Deal-Ready Tracks' },
  { id: 'avg-unsigned-score', label: 'Avg Unsigned Score' },
  { id: 'missing-publisher', label: 'Missing Publisher' },
  { id: 'high-stream-velocity', label: 'High Stream Velocity' },
  { id: 'self-written-tracks', label: 'Self-Written Tracks' },
  { id: 'indie-label-tracks', label: 'Indie Label Tracks' },
];

export const PUBLISHING_METRIC_OPTIONS: { id: PublishingMetricId; label: string }[] = [
  { id: 'high-confidence-unsigned', label: 'High-Confidence Unsigned' },
  { id: 'publishing-opportunities', label: 'Publishing Opportunities' },
  { id: 'enrichment-backlog', label: 'Enrichment Backlog' },
  { id: 'mlc-verified-unsigned', label: 'MLC Verified Unsigned' },
  { id: 'musicbrainz-found', label: 'MusicBrainz Found' },
  { id: 'total-songwriters', label: 'Total Songwriters' },
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
