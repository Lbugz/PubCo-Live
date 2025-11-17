import { DashboardMetricPreferences, DEFAULT_METRIC_PREFERENCES, STORAGE_KEY } from '@shared/metricDefinitions';

export type { DashboardMetricPreferences };

const DEFAULT_PREFERENCES = DEFAULT_METRIC_PREFERENCES;

// Migration map from old metric IDs to new ones
const LEGACY_TO_NEW_METRIC_MAP: Record<string, { section: 'playlists' | 'tracks' | 'contacts', newId: string }> = {
  // Old track metrics
  'dealReady': { section: 'tracks', newId: 'dealReadyTracks' },
  'avgScore': { section: 'tracks', newId: 'avgUnsignedScore' },
  'missingPublisher': { section: 'tracks', newId: 'missingPublisherTracks' },
  
  // Old publishing intelligence (contact) metrics
  'highConfidenceUnsigned': { section: 'contacts', newId: 'highConfidenceUnsigned' },
  'publishingOpportunities': { section: 'contacts', newId: 'mlcVerifiedUnsigned' },
  'enrichmentBacklog': { section: 'contacts', newId: 'enrichmentBacklogContacts' },
};

export function getMetricPreferences(): DashboardMetricPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      
      // Check if this is the old 2-section format with trackMetrics and publishingIntelligence
      if ('trackMetrics' in parsed && 'publishingIntelligence' in parsed) {
        console.log('Migrating legacy metric preferences to new format');
        
        const migrated: DashboardMetricPreferences = {
          playlists: [],
          tracks: [],
          contacts: [],
        };
        
        // Migrate trackMetrics array
        if (Array.isArray(parsed.trackMetrics)) {
          parsed.trackMetrics.forEach((metricId: string) => {
            const mapping = LEGACY_TO_NEW_METRIC_MAP[metricId];
            if (mapping && mapping.section === 'tracks') {
              migrated.tracks.push(mapping.newId);
            }
          });
        }
        
        // Migrate publishingIntelligence array
        if (Array.isArray(parsed.publishingIntelligence)) {
          parsed.publishingIntelligence.forEach((metricId: string) => {
            const mapping = LEGACY_TO_NEW_METRIC_MAP[metricId];
            if (mapping && mapping.section === 'contacts') {
              migrated.contacts.push(mapping.newId);
            }
          });
        }
        
        // Fill in defaults for playlists (new section)
        migrated.playlists = DEFAULT_PREFERENCES.playlists;
        
        // Ensure each section has exactly 3 metrics
        if (migrated.tracks.length < 3) {
          const remaining = DEFAULT_PREFERENCES.tracks.filter(m => !migrated.tracks.includes(m));
          migrated.tracks.push(...remaining.slice(0, 3 - migrated.tracks.length));
        }
        if (migrated.contacts.length < 3) {
          const remaining = DEFAULT_PREFERENCES.contacts.filter(m => !migrated.contacts.includes(m));
          migrated.contacts.push(...remaining.slice(0, 3 - migrated.contacts.length));
        }
        
        // Save migrated preferences
        saveMetricPreferences(migrated);
        return migrated;
      }
      
      // If already in new format, return as-is
      if ('playlists' in parsed && 'tracks' in parsed && 'contacts' in parsed) {
        return parsed;
      }
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
