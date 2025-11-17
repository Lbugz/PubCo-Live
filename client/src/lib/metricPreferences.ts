import { DashboardMetricPreferences, DEFAULT_METRIC_PREFERENCES, STORAGE_KEY } from '@shared/metricDefinitions';

export type { DashboardMetricPreferences };

const DEFAULT_PREFERENCES = DEFAULT_METRIC_PREFERENCES;

export function getMetricPreferences(): DashboardMetricPreferences {
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

export function saveMetricPreferences(preferences: DashboardMetricPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save metric preferences:', error);
  }
}
