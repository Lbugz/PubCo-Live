import { memo, useRef, useMemo } from "react";
import { ExternalLink, Music, CheckCircle2, XCircle, Cloud, Database, Sparkles, FileText, MoreVertical, Tag as TagIcon, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { type PlaylistSnapshot, type Tag } from "@shared/schema";
import { cn } from "@/lib/utils";
import { TrackActionsDropdown } from "./track-actions-dropdown";
import { SongwriterDisplay } from "./songwriter-display";
import { useQuery } from "@tanstack/react-query";
import { getTagColorClass } from "./tag-manager";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiRequest } from "@/lib/queryClient";

interface TrackTableProps {
  tracks: PlaylistSnapshot[];
  isLoading?: boolean;
  selectedTrackIds?: Set<string>;
  onToggleSelection?: (trackId: string) => void;
  onToggleSelectAll?: () => void;
  onEnrich?: (trackId: string) => void;
  onRowClick?: (track: PlaylistSnapshot) => void;
}

function getScoreBadgeVariant(score: number): "high" | "medium" | "low" {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function getScoreLabel(score: number): string {
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

function TrackTags({ trackId, tags }: { trackId: string; tags?: Tag[] }) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className={`${getTagColorClass(tag.color)} text-xs`}
          data-testid={`badge-track-tag-${trackId}-${tag.id}`}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}

export const TrackTable = memo(function TrackTable({ 
  tracks, 
  isLoading, 
  selectedTrackIds = new Set(), 
  onToggleSelection, 
  onToggleSelectAll,
  onEnrich, 
  onRowClick 
}: TrackTableProps) {
  const allSelected = tracks.length > 0 && tracks.every(track => selectedTrackIds.has(track.id));
  const someSelected = !allSelected && tracks.some(track => selectedTrackIds.has(track.id));
  
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 5,
  });

  // Batch fetch tags for all tracks
  const trackIds = useMemo(() => tracks.map(t => t.id), [tracks]);
  
  const { data: tagsMap = {} } = useQuery<Record<string, Tag[]>>({
    queryKey: ["/api/tracks/tags/batch", trackIds],
    queryFn: async () => {
      if (trackIds.length === 0) return {};
      const response = await apiRequest("POST", "/api/tracks/tags/batch", { trackIds });
      return response; // apiRequest already parses JSON
    },
    enabled: trackIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <Card className="glass-panel p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Music className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold font-heading mb-2" data-testid="text-empty-state-title">No tracks found</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Try adjusting your filters or select a different week to view publishing leads.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="relative">
      {/* Sticky Header - Desktop Only */}
      <div className="hidden lg:grid lg:grid-cols-[auto_2fr_2fr_2fr_2fr_2fr_1fr_auto] gap-4 px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider glass-header sticky top-0 z-10 rounded-t-lg">
        <div className="flex items-center">
          {onToggleSelectAll && (
            <Checkbox
              checked={someSelected ? "indeterminate" : allSelected}
              onCheckedChange={onToggleSelectAll}
              onClick={(e) => e.stopPropagation()}
              data-testid="checkbox-select-all"
              aria-label="Select all tracks"
            />
          )}
        </div>
        <div>Track</div>
        <div>Artist</div>
        <div>Playlist</div>
        <div>Label</div>
        <div>Songwriter</div>
        <div>Score</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Virtualized Track Rows */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{
          height: 'calc(100vh - 300px)',
          minHeight: '400px',
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index];
            const index = virtualRow.index;
            const isSelected = selectedTrackIds.has(track.id);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Card
                  className={cn(
                    "hover-gradient cursor-pointer rounded-none border-x-0 border-t-0",
                    index % 2 === 0 ? "bg-card/50" : "bg-card/30",
                    isSelected && "ring-2 ring-primary bg-primary/5"
                  )}
                  data-testid={`card-track-${track.id}`}
                  onClick={() => onRowClick?.(track)}
                >
              <div className="grid grid-cols-1 lg:grid-cols-[auto_2fr_2fr_2fr_2fr_2fr_1fr_auto] gap-4 p-4 items-center">
                {/* Checkbox Column - Desktop Only */}
                <div 
                  className="hidden lg:flex items-center" 
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {onToggleSelection && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelection(track.id)}
                      data-testid={`checkbox-track-${track.id}`}
                      aria-label={`Select ${track.trackName}`}
                    />
                  )}
                </div>
              <div className="col-span-1 lg:col-span-1 flex items-center gap-3">
                {/* Album Art - Reduced Size */}
                {track.albumArt ? (
                  <img 
                    src={track.albumArt} 
                    alt={`${track.trackName} album art`}
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                    loading="lazy"
                    decoding="async"
                    width="32"
                    height="32"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Music className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" data-testid={`text-track-name-${track.id}`}>{track.trackName}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {track.isrc ? (
                      <Badge 
                        variant="outline" 
                        className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs"
                        data-testid={`badge-has-isrc-${track.id}`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        ISRC
                      </Badge>
                    ) : (
                      <Badge 
                        variant="outline" 
                        className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20 text-xs"
                        data-testid={`badge-no-isrc-${track.id}`}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        No ISRC
                      </Badge>
                    )}
                    {track.dataSource === "scraped" && (
                      <Badge 
                        variant="outline" 
                        className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs"
                        data-testid={`badge-source-scraped-${track.id}`}
                      >
                        <Cloud className="w-3 h-3 mr-1" />
                        Scraped
                      </Badge>
                    )}
                  </div>
                  <TrackTags trackId={track.id} tags={tagsMap[track.id]} />
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <div className="text-sm text-muted-foreground" data-testid={`text-artist-${track.id}`}>
                  {track.artistName}
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <Badge variant="outline" className="font-normal" data-testid={`badge-playlist-${track.id}`}>
                  {track.playlistName}
                </Badge>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <div className="text-sm" data-testid={`text-label-${track.id}`}>
                  {track.label || <span className="text-muted-foreground italic">Unknown</span>}
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <div className="text-sm">
                  <SongwriterDisplay
                    songwriters={track.songwriter}
                    testId={`text-songwriter-${track.id}`}
                  />
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={getScoreBadgeVariant(track.unsignedScore)}
                    className="font-semibold min-w-[4rem] justify-center"
                    data-testid={`badge-score-${track.id}`}
                  >
                    {getScoreLabel(track.unsignedScore)} {track.unsignedScore}
                  </Badge>
                </div>
              </div>
              
              <div className="col-span-1 lg:col-span-1 flex justify-start lg:justify-end gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <TrackActionsDropdown
                  track={track}
                  onEnrich={onEnrich}
                />
              </div>
            </div>
          </Card>
        </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 px-4 text-sm text-muted-foreground">
        <div data-testid="text-results-count">
          Showing {tracks.length} {tracks.length === 1 ? "result" : "results"}
        </div>
      </div>
    </div>
  );
});
