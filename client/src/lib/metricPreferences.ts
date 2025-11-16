export type MetricId = 
  | 'deal-ready-tracks'
  | 'avg-unsigned-score'
  | 'missing-publisher'
  | 'high-confidence-unsigned'
  | 'publishing-opportunities'
  | 'enrichment-backlog';

export interface MetricPreferences {
  trackMetrics: MetricId[];
  publishingIntelligence: MetricId[];
}

const DEFAULT_PREFERENCES: MetricPreferences = {
  trackMetrics: ['deal-ready-tracks', 'avg-unsigned-score', 'missing-publisher'],
  publishingIntelligence: ['high-confidence-unsigned', 'publishing-opportunities', 'enrichment-backlog'],
};

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
  return [...prefs.trackMetrics, ...prefs.publishingIntelligence].includes(metricId);
}
