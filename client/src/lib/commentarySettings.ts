/**
 * COMMENTARY SETTINGS MANAGEMENT
 * 
 * Manages user preferences for scoring commentary generation
 * (AI-powered vs. rules-based)
 */

const STORAGE_KEY = 'scoring:aiNarrativeMode:v1';

/**
 * Get the current AI narrative mode setting
 */
export function getAINarrativeMode(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch (error) {
    console.error('Failed to load AI narrative mode setting:', error);
    return false; // Default to rules-based
  }
}

/**
 * Set the AI narrative mode preference
 */
export function setAINarrativeMode(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled.toString());
  } catch (error) {
    console.error('Failed to save AI narrative mode setting:', error);
  }
}

/**
 * React hook for AI narrative mode
 */
import { useState, useEffect } from 'react';

export function useAINarrativeMode() {
  const [aiNarrativeMode, setAiNarrativeMode] = useState(getAINarrativeMode);

  const toggleAINarrative = (enabled: boolean) => {
    setAINarrativeMode(enabled);
    setAiNarrativeMode(enabled);
  };

  // Persist to localStorage on change
  useEffect(() => {
    setAINarrativeMode(aiNarrativeMode);
  }, [aiNarrativeMode]);

  return {
    aiNarrativeMode,
    toggleAINarrative
  };
}
