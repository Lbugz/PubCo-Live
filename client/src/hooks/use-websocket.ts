import { useEffect, useRef, useCallback } from 'react';

interface WebSocketMessage {
  type: 'connected' | 'track_enriched' | 'batch_complete' | 'enrichment_progress';
  trackId?: string;
  trackName?: string;
  artistName?: string;
  enrichedCount?: number;
  totalCount?: number;
  playlistId?: string;
  message?: string;
}

interface UseWebSocketOptions {
  onTrackEnriched?: (data: WebSocketMessage) => void;
  onBatchComplete?: (data: WebSocketMessage) => void;
  onEnrichmentProgress?: (data: WebSocketMessage) => void;
  onConnected?: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Store callbacks in refs to avoid recreating connect function
  const callbacksRef = useRef(options);
  
  // Update callback refs when they change
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const connect = useCallback(() => {
    // Don't reconnect if already connected or max attempts reached
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn('Max WebSocket reconnection attempts reached');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttemptsRef.current = 0; // Reset attempts on successful connection
        if (callbacksRef.current.onConnected) {
          callbacksRef.current.onConnected();
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          console.log('WebSocket message received:', data);

          switch (data.type) {
            case 'connected':
              // Connection confirmation
              break;
            case 'track_enriched':
              if (callbacksRef.current.onTrackEnriched) {
                callbacksRef.current.onTrackEnriched(data);
              }
              break;
            case 'batch_complete':
              if (callbacksRef.current.onBatchComplete) {
                callbacksRef.current.onBatchComplete(data);
              }
              break;
            case 'enrichment_progress':
              if (callbacksRef.current.onEnrichmentProgress) {
                callbacksRef.current.onEnrichmentProgress(data);
              }
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
    }
  }, []); // Empty deps - connect function is stable

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
