import { useEffect, useCallback } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

interface WebSocketMessage {
  type: 'connected' | 'track_enriched' | 'batch_complete' | 'enrichment_progress' | 'metric_update' | 'playlist_error' | 'playlist_updated' | 'playlist_quality_updated' | 'playlist_fetch_complete' | 'enrichment_job_started' | 'enrichment_job_completed' | 'enrichment_job_failed' | 'enrichment_phase_started';
  trackId?: string;
  trackName?: string;
  artistName?: string;
  enrichedCount?: number;
  totalCount?: number;
  playlistId?: string;
  playlistName?: string;
  tracksInserted?: number;
  message?: string;
  error?: string;
  data?: any;
  id?: string;
  updates?: any;
  track?: {
    name?: string;
    artist?: string;
  };
  jobId?: string;
  trackCount?: number;
  tracksEnriched?: number;
  errors?: number;
  success?: boolean;
  phase?: number;
  phaseName?: string;
}

interface UseWebSocketOptions {
  onTrackEnriched?: (data: WebSocketMessage) => void;
  onBatchComplete?: (data: WebSocketMessage) => void;
  onEnrichmentProgress?: (data: WebSocketMessage) => void;
  onMetricUpdate?: (data: WebSocketMessage) => void;
  onPlaylistError?: (data: WebSocketMessage) => void;
  onPlaylistUpdated?: (data: WebSocketMessage) => void;
  onJobStarted?: (data: WebSocketMessage) => void;
  onJobCompleted?: (data: WebSocketMessage) => void;
  onJobFailed?: (data: WebSocketMessage) => void;
  onPhaseStarted?: (data: WebSocketMessage) => void;
  onConnected?: () => void;
  onMessage?: (data: WebSocketMessage) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { isConnected, subscribe } = useWebSocketContext();

  // Create stable message handler using useCallback
  const handleMessage = useCallback((data: WebSocketMessage) => {
    // Always call generic onMessage handler if provided
    if (options.onMessage) {
      options.onMessage(data);
    }

    // Route to specific handlers
    switch (data.type) {
      case 'connected':
        if (options.onConnected) {
          options.onConnected();
        }
        break;
      case 'track_enriched':
        if (options.onTrackEnriched) {
          options.onTrackEnriched(data);
        }
        break;
      case 'batch_complete':
        if (options.onBatchComplete) {
          options.onBatchComplete(data);
        }
        break;
      case 'enrichment_progress':
        if (options.onEnrichmentProgress) {
          options.onEnrichmentProgress(data);
        }
        break;
      case 'metric_update':
        if (options.onMetricUpdate) {
          options.onMetricUpdate(data);
        }
        break;
      case 'playlist_error':
        if (options.onPlaylistError) {
          options.onPlaylistError(data);
        }
        break;
      case 'playlist_updated':
        if (options.onPlaylistUpdated) {
          options.onPlaylistUpdated(data);
        }
        break;
      case 'playlist_quality_updated':
        if (options.onMetricUpdate) {
          options.onMetricUpdate(data);
        }
        break;
      case 'playlist_fetch_complete':
        if (options.onMessage) {
          options.onMessage(data);
        }
        break;
      case 'enrichment_job_started':
        if (options.onJobStarted) {
          options.onJobStarted(data);
        }
        break;
      case 'enrichment_job_completed':
        if (options.onJobCompleted) {
          options.onJobCompleted(data);
        }
        break;
      case 'enrichment_job_failed':
        if (options.onJobFailed) {
          options.onJobFailed(data);
        }
        break;
      case 'enrichment_phase_started':
        if (options.onPhaseStarted) {
          options.onPhaseStarted(data);
        }
        break;
    }
  }, [options]);

  // Subscribe to messages when component mounts
  useEffect(() => {
    const unsubscribe = subscribe(handleMessage);
    return unsubscribe;
  }, [subscribe, handleMessage]);

  return {
    isConnected,
  };
}