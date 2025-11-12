import { invalidateMetricsCache } from "./metricsService";
import { broadcastEnrichmentUpdate } from "./websocket";

interface ScheduledUpdate {
  timeoutId?: NodeJS.Timeout;
  lastInvalidated: number;
  pendingSource?: string;
}

const scheduledUpdate: ScheduledUpdate = {
  lastInvalidated: 0,
};

const DEBOUNCE_WINDOW_MS = 8000; // 8 seconds - balance real-time visibility with DB/cache workload

/**
 * Immediately invalidates metrics cache and broadcasts metric_update event.
 * Use for endpoints that complete in a single operation.
 * 
 * @param source - Optional description of what triggered the update (e.g., "track_enrichment", "playlist_fetch")
 */
export function triggerMetricsUpdate(options: { source?: string } = {}) {
  const now = Date.now();
  const source = options.source || "unknown";
  
  console.log(`[MetricsUpdate] Triggering immediate update from: ${source}`);
  
  // Invalidate cache immediately
  invalidateMetricsCache();
  
  // Broadcast to connected clients
  broadcastEnrichmentUpdate({
    type: 'metric_update',
  });
  
  // Update timestamp
  scheduledUpdate.lastInvalidated = now;
  scheduledUpdate.pendingSource = undefined;
}

/**
 * Schedules a debounced metrics update for batch/streaming operations.
 * Multiple calls within the debounce window will be collapsed into a single update.
 * Uses leading-edge invalidation (immediate cache clear) and trailing-edge broadcast.
 * 
 * @param source - Optional description of what triggered the update
 */
export function scheduleMetricsUpdate(options: { source?: string } = {}) {
  const now = Date.now();
  const source = options.source || "unknown";
  const timeSinceLastUpdate = now - scheduledUpdate.lastInvalidated;
  
  // Leading edge: Invalidate cache immediately if enough time has passed
  if (timeSinceLastUpdate >= DEBOUNCE_WINDOW_MS) {
    console.log(`[MetricsUpdate] Leading-edge cache invalidation from: ${source}`);
    invalidateMetricsCache();
    scheduledUpdate.lastInvalidated = now;
  }
  
  // Store the source for logging
  scheduledUpdate.pendingSource = source;
  
  // Clear any existing timeout
  if (scheduledUpdate.timeoutId) {
    clearTimeout(scheduledUpdate.timeoutId);
  }
  
  // Trailing edge: Schedule broadcast after debounce window
  scheduledUpdate.timeoutId = setTimeout(() => {
    console.log(`[MetricsUpdate] Trailing-edge broadcast from: ${scheduledUpdate.pendingSource || source}`);
    
    broadcastEnrichmentUpdate({
      type: 'metric_update',
    });
    
    scheduledUpdate.pendingSource = undefined;
    scheduledUpdate.timeoutId = undefined;
  }, DEBOUNCE_WINDOW_MS);
}

/**
 * Immediately flushes any pending scheduled update.
 * Useful when a batch operation completes and you want to ensure
 * the final update is broadcast without waiting for the debounce window.
 */
export function flushMetricsUpdate() {
  if (scheduledUpdate.timeoutId) {
    console.log(`[MetricsUpdate] Flushing pending update from: ${scheduledUpdate.pendingSource || "unknown"}`);
    
    clearTimeout(scheduledUpdate.timeoutId);
    
    // Final cache invalidation + broadcast
    invalidateMetricsCache();
    broadcastEnrichmentUpdate({
      type: 'metric_update',
    });
    
    scheduledUpdate.lastInvalidated = Date.now();
    scheduledUpdate.pendingSource = undefined;
    scheduledUpdate.timeoutId = undefined;
  }
}
