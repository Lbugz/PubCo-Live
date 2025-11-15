import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

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

type MessageHandler = (data: WebSocketMessage) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (handler: MessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState(false);
  
  // Store all message handlers
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  const connect = () => {
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
        console.log('🔌 WebSocket connected (single shared connection)');
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          
          // Only log non-connected messages to reduce noise
          if (data.type !== 'connected') {
            console.log('📨 WebSocket event:', data.type, data);
          }

          // Notify all subscribed handlers (only once per message)
          handlersRef.current.forEach(handler => {
            try {
              handler(data);
            } catch (error) {
              console.error('Error in WebSocket message handler:', error);
            }
          });
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
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
  };

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
  }, []);

  const subscribe = (handler: MessageHandler) => {
    handlersRef.current.add(handler);
    
    // Return unsubscribe function
    return () => {
      handlersRef.current.delete(handler);
    };
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
}
