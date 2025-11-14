# WebSocket Broadcast Audit

## Current Implementation Status

### ✅ IMPLEMENTED - Broadcasting via WebSocket

| Event Type | Trigger | Location | Frontend Handler | Status |
|------------|---------|----------|------------------|---------|
| **Track Enriched** | Individual track completes enrichment | `server/routes.ts` (lines 1688, 2130) | `useWebSocket.onTrackEnriched` | ✅ Working |
| **Batch Complete** | Enrichment batch finishes | `server/routes.ts` (line 1138) | `useWebSocket.onBatchComplete` | ✅ Working |
| **Chartmetric Progress** | Chartmetric enrichment progress | `server/routes.ts` (line 1587) | ❌ No handler | ⚠️ Partial |
| **Metric Update** | Playlist metrics recalculated | `server/metricsUpdateManager.ts` (lines 32, 72, 94) | `useWebSocket.onMetricUpdate` | ✅ Working |
| **Playlist Updated** | Playlist metadata changes | `server/routes.ts` (lines 835, 2479, 2862) | `useWebSocket.onPlaylistUpdated` | ✅ Working |
| **Playlist Error** | Playlist fetch/validation error | `server/routes.ts` (line 2718) | `useWebSocket.onPlaylistError` | ✅ Working |

### ❌ MISSING - Should Be Broadcasting

| Event Type | Trigger | Current Status | Priority | Notes |
|------------|---------|----------------|----------|-------|
| **Job Status Updates** | Enrichment job transitions (queued→running→completed) | ❌ Not broadcasting | 🔴 High | Jobs change status in worker but no WS broadcast |
| **Activity Log Entries** | New activity logged | ❌ Not broadcasting | 🟡 Medium | Activity logs created but not pushed to UI |
| **Track Status Transitions** | enrichmentStatus changes (pending→enriching→completed) | ❌ Not broadcasting | 🟡 Medium | Status changes in DB but no real-time UI update |
| **Live Follower Counts** | Playlist follower count updates | ❌ Not broadcasting | 🟢 Low | Only updates during metadata refresh |
| **Live Analytics** | Real-time analytics data changes | ❌ Not broadcasting | 🟢 Low | Analytics fetch manually, not pushed |
| **Enrichment Phase Progress** | Phase 1/2/3 transitions | ⚠️ Partial | 🟡 Medium | Phase completion broadcasts exist but phase start missing |
| **Bulk Import Progress** | Playlist bulk import progress | ❌ Not broadcasting | 🟡 Medium | No progress updates during CSV import |

### 🔍 DETAILED FINDINGS

#### 1. Track Enrichment Progress ✅
**Current:** Broadcasting individual track enrichment + batch completion
```typescript
// server/routes.ts:1688
broadcastEnrichmentUpdate({
  type: 'track_enriched',
  trackId: track.id,
  trackName: track.trackName,
  artistName: track.artistName,
});
```
**Status:** ✅ Working well

---

#### 2. Job Status Updates ❌
**Current:** NO broadcasts when job status changes
**Missing broadcasts:**
- `enrichment_job_started` - When worker claims a job
- `enrichment_job_completed` - When job finishes
- `enrichment_job_failed` - When job fails

**Where to add:**
```typescript
// server/enrichment/worker.ts - claimNextJob()
// Add: broadcast('job_status_changed', { jobId, status: 'running' })

// server/enrichment/worker.ts - processJob() success
// Add: broadcast('job_status_changed', { jobId, status: 'completed' })

// server/enrichment/worker.ts - processJob() error
// Add: broadcast('job_status_changed', { jobId, status: 'failed' })
```

---

#### 3. Track Metadata Updates ✅
**Current:** Broadcasting when tracks are enriched
**Status:** ✅ Covered by `track_enriched` event

---

#### 4. Playlist Metadata Updates ✅
**Current:** Broadcasting when playlist metadata changes
```typescript
// server/routes.ts:2862
broadcast('playlist_updated', {
  playlistId: playlist.playlistId,
  id: playlist.id,
  updates,
});
```
**Status:** ✅ Working

---

#### 5. Activity Log Entries ❌
**Current:** NO broadcasts when activity is logged
**Missing broadcasts:**
- New activity log entries are created silently
- UI must manually poll/refresh to see new activity

**Where to add:**
```typescript
// server/storage.ts:361 - logActivity()
// After: await db.insert(activityHistory).values(activity);
// Add: broadcast('activity_logged', { ...activity })
```

---

#### 6. Enrichment Status Transitions ⚠️
**Current:** PARTIAL - batch complete broadcasts but no individual transitions
**Missing:**
- No broadcast when track changes from `pending` → `enriching`
- No broadcast when track changes from `enriching` → `completed`

**Where to add:**
```typescript
// When marking track as "enriching"
broadcast('track_status_changed', { 
  trackId, 
  oldStatus: 'pending', 
  newStatus: 'enriching' 
});

// When marking track as "completed"
broadcast('track_status_changed', { 
  trackId, 
  oldStatus: 'enriching', 
  newStatus: 'completed' 
});
```

---

#### 7. Live Follower Counts ❌
**Current:** NO real-time follower updates
**Opportunity:** Could poll Spotify API periodically and broadcast changes
**Priority:** 🟢 Low (not frequently changing data)

---

#### 8. Live Analytics ❌
**Current:** Analytics fetched on-demand, not pushed
**Opportunity:** Could cache and periodically refresh, broadcasting updates
**Priority:** 🟢 Low (analytics are typically queried, not monitored)

---

## Recommendations

### 🔴 High Priority - Implement Now
1. **Job Status Broadcasts** - Users need to know when enrichment jobs start/finish
2. **Bulk Import Progress** - Show real-time progress during CSV imports

### 🟡 Medium Priority - Implement Soon
1. **Activity Log Broadcasts** - Real-time activity feed
2. **Enrichment Phase Transitions** - Show when Phase 1→2→3 occurs
3. **Track Status Transitions** - Detailed enrichment status tracking

### 🟢 Low Priority - Nice to Have
1. **Live Follower Counts** - Polling-based updates
2. **Live Analytics** - Cached analytics with periodic refresh

---

## Frontend Handler Gaps

### Missing Frontend Handlers
- `chartmetric_progress` - Event broadcasts but no frontend handler
- `job_status_changed` - Not implemented
- `activity_logged` - Not implemented
- `track_status_changed` - Not implemented
- `bulk_import_progress` - Not implemented

### Recommended Frontend Updates
```typescript
// client/src/hooks/use-websocket.ts
interface UseWebSocketOptions {
  // ... existing handlers
  onJobStatusChanged?: (data: WebSocketMessage) => void;
  onActivityLogged?: (data: WebSocketMessage) => void;
  onTrackStatusChanged?: (data: WebSocketMessage) => void;
  onBulkImportProgress?: (data: WebSocketMessage) => void;
  onChartmetricProgress?: (data: WebSocketMessage) => void; // Missing!
}
```

---

## Architecture Notes

### Current Broadcast Functions
1. **`broadcast(event, data)`** - General-purpose broadcaster (server/websocket.ts:27)
2. **`broadcastEnrichmentUpdate(data)`** - Specialized for enrichment (server/websocket.ts:42)

### Recommendation
- Use `broadcast()` for all new events (simpler, more flexible)
- Keep `broadcastEnrichmentUpdate()` for backward compatibility
- Consider deprecating `broadcastEnrichmentUpdate()` in favor of `broadcast()`

---

## Testing Checklist

- [x] Track enrichment progress broadcasts
- [x] Playlist metadata update broadcasts
- [x] Playlist error broadcasts
- [x] Metric update broadcasts
- [ ] Job status change broadcasts
- [ ] Activity log broadcasts
- [ ] Track status transition broadcasts
- [ ] Bulk import progress broadcasts
- [ ] Chartmetric progress frontend handler

---

## Performance Considerations

### Current Issues
- **Bulk operations** may spam broadcasts (e.g., 100 playlists imported = 100 broadcasts)
- No rate limiting or debouncing
- No batching for bulk operations

### Recommendations
1. **Batch broadcasts** for bulk operations:
   ```typescript
   // Instead of 100 individual broadcasts
   broadcast('bulk_import_progress', { 
     completed: 50, 
     total: 100, 
     playlists: [...] 
   });
   ```

2. **Debounce frequent updates**:
   - Metric updates should be debounced (max 1/second)
   - Track enrichment progress could be batched (every 5 tracks)

3. **Add rate limiting** to prevent broadcast spam
