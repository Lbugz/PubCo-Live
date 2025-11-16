import { useState, useEffect } from "react";

export interface QuickFilterDefinition {
  id: string;
  label: string;
  icon?: any;
  variant?: "default" | "hot" | "success";
  defaultVisible: boolean;
}

const STORAGE_KEY_PREFIX = "quickFilterPreferences_";

export function useQuickFilterPreferences(pageId: string, availableFilters: QuickFilterDefinition[]) {
  const storageKey = `${STORAGE_KEY_PREFIX}${pageId}`;

  const [visibleFilterIds, setVisibleFilterIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load quick filter preferences:", error);
    }
    
    return new Set(
      availableFilters.filter((f) => f.defaultVisible).map((f) => f.id)
    );
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(visibleFilterIds)));
    } catch (error) {
      console.error("Failed to save quick filter preferences:", error);
    }
  }, [storageKey, visibleFilterIds]);

  const toggleFilterVisibility = (filterId: string) => {
    setVisibleFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(filterId)) {
        next.delete(filterId);
      } else {
        next.add(filterId);
      }
      return next;
    });
  };

  const resetToDefaults = () => {
    setVisibleFilterIds(
      new Set(availableFilters.filter((f) => f.defaultVisible).map((f) => f.id))
    );
  };

  const visibleFilters = availableFilters.filter((f) => visibleFilterIds.has(f.id));

  return {
    visibleFilters,
    visibleFilterIds,
    toggleFilterVisibility,
    resetToDefaults,
    allFilters: availableFilters,
  };
}
