import { type PlaylistSnapshot } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrackActionsDropdown } from "./track-actions-dropdown";

interface KanbanViewProps {
  tracks: PlaylistSnapshot[];
  isLoading?: boolean;
  onTrackClick?: (track: PlaylistSnapshot) => void;
  onEnrichMB?: (trackId: string) => void;
  onEnrichCredits?: (trackId: string) => void;
}

export function KanbanView({
  tracks,
  isLoading,
  onTrackClick,
  onEnrichMB,
  onEnrichCredits,
}: KanbanViewProps) {
  // Group tracks by score category
  const highPotentialTracks = tracks.filter((t) => t.unsignedScore >= 7);
  const mediumPotentialTracks = tracks.filter((t) => t.unsignedScore >= 4 && t.unsignedScore < 7);
  const lowPotentialTracks = tracks.filter((t) => t.unsignedScore < 4);

  const renderTrackCard = (track: PlaylistSnapshot) => (
    <Card
      key={track.id}
      className={cn(
        "glass-panel p-4 mb-3 cursor-pointer interactive-scale hover-gradient",
        "transition-all duration-200"
      )}
      onClick={() => onTrackClick?.(track)}
      data-testid={`kanban-card-${track.id}`}
    >
      <div className="space-y-3">
        {/* Header */}
        <div>
          <h4 className="font-semibold text-sm mb-1">{track.trackName}</h4>
          <p className="text-xs text-muted-foreground">{track.artistName}</p>
        </div>

        {/* Score Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Score: {track.unsignedScore}
          </Badge>
          {track.isrc ? (
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs"
            >
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
              ISRC
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20 text-xs"
            >
              <XCircle className="w-2.5 h-2.5 mr-1" />
              No ISRC
            </Badge>
          )}
        </div>

        {/* Info */}
        <div className="text-xs space-y-1">
          <div className="text-muted-foreground truncate">{track.playlistName}</div>
          {track.label && (
            <div>
              <span className="text-muted-foreground">Label:</span> {track.label}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-2 border-t" onClick={(e) => e.stopPropagation()}>
          <TrackActionsDropdown
            track={track}
            onEnrichMB={onEnrichMB}
            onEnrichCredits={onEnrichCredits}
          />
        </div>
      </div>
    </Card>
  );

  const renderColumn = (
    title: string,
    count: number,
    tracks: PlaylistSnapshot[],
    variant: "high" | "medium" | "low"
  ) => (
    <div className="flex-1 min-w-[280px]">
      <div className="glass-panel p-4 rounded-lg h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold">{title}</h3>
          <Badge variant={variant} className="font-semibold">
            {count}
          </Badge>
        </div>
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-3">
            {tracks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tracks in this category
              </p>
            ) : (
              tracks.map(renderTrackCard)
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 min-w-[280px]">
            <Card className="glass-panel p-4 h-[600px] animate-pulse">
              <div className="space-y-3">
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="h-32 bg-muted rounded" />
                <div className="h-32 bg-muted rounded" />
              </div>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {renderColumn("High Potential", highPotentialTracks.length, highPotentialTracks, "high")}
      {renderColumn("Medium Potential", mediumPotentialTracks.length, mediumPotentialTracks, "medium")}
      {renderColumn("Low Potential", lowPotentialTracks.length, lowPotentialTracks, "low")}
    </div>
  );
}
