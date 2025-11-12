import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

let wss: WebSocketServer | null = null;

export function initializeWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send initial connection success message
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connection established' }));
  });

  console.log('WebSocket server initialized on /ws');
}

export function broadcastEnrichmentUpdate(data: {
  type: 'track_enriched' | 'batch_complete' | 'enrichment_progress' | 'chartmetric_progress' | 'metric_update';
  trackId?: string;
  trackName?: string;
  artistName?: string;
  enrichedCount?: number;
  totalCount?: number;
  playlistId?: string;
  processed?: number;
  total?: number;
  enriched?: number;
  failed?: number;
}) {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
