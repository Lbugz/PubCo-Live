import { useQuery } from "@tanstack/react-query";
import { type PlaylistSnapshot, type ActivityHistory, type Artist, type Tag } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Database,
  Sparkles,
  Tag as TagIcon,
  UserPlus,
  ExternalLink,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { SongwriterDisplay } from "./songwriter-display";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { DetailDrawerHeader, StatsGrid, ActionRail, DrawerSection } from "@/components/details/detail-primitives";

interface DetailsDrawerProps {
  track: PlaylistSnapshot | null;
  open: boolean;
  onClose: () => void;
  onEnrich: (trackId: string) => void;
}

interface FullTrackDetails extends PlaylistSnapshot {
  tags: Tag[];
  activity: ActivityHistory[];
  artists: Artist[];
}

export function DetailsDrawer({
  track,
  open,
  onClose,
  onEnrich,
}: DetailsDrawerProps) {
  const [isEnriching, setIsEnriching] = useState(false);

  // Fetch full track details immediately on open
  const { data: fullTrack, isLoading: trackLoading } = useQuery<FullTrackDetails>({
    queryKey: ["/api/tracks", track?.id, "full"],
    enabled: !!track?.id && open,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Listen for WebSocket updates
  useWebSocket({
    onTrackEnriched: (data) => {
      if (data.trackId === track?.id) {
        setIsEnriching(false);
        // Invalidate queries to refetch complete data
        queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tracks", track?.id, "full"] });
      }
    },
  });

  // Handle enrichment button click
  const handleEnrich = async () => {
    if (track) {
      setIsEnriching(true);
      try {
        await onEnrich(track.id);
      } catch (error) {
        console.error('Enrichment error:', error);
        setIsEnriching(false);
      }
    }
  };

  // Reset enriching state when drawer closes or track changes
  useEffect(() => {
    if (!open) {
      setIsEnriching(false);
    }
  }, [open]);

  // Reset enriching state when track changes
  useEffect(() => {
    setIsEnriching(false);
  }, [track?.id]);

  // Auto-reset enriching state if track is already enriched
  useEffect(() => {
    const currentTrack = fullTrack || track;
    if (currentTrack?.enrichmentStatus === 'enriched' && isEnriching) {
      setIsEnriching(false);
    }
  }, [fullTrack?.enrichmentStatus, track?.enrichmentStatus, isEnriching]);

  if (!track) return null;

  // Use fullTrack data if available, otherwise fall back to track prop
  const displayTrack = fullTrack || track;
  const activity = fullTrack?.activity || [];
  const artists = fullTrack?.artists || [];

  const getScoreBadgeVariant = (score: number | null) => {
    if (score === null) return "outline";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  };

  const getScoreLabel = (score: number | null) => {
    if (score === null) return "Pending";
    if (score >= 7) return "High";
    if (score >= 4) return "Medium";
    return "Low";
  };

  const scoreBadgeVariant = displayTrack.unsignedScore !== null && displayTrack.unsignedScore >= 7 ? "high" : 
    displayTrack.unsignedScore !== null && displayTrack.unsignedScore >= 4 ? "medium" : "low";

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[640px] p-6">
        <div className="space-y-6">
          {/* Unified Header */}
          <DetailDrawerHeader
            title={displayTrack.trackName}
            subtitle="Track"
            description={displayTrack.artistName}
            badges={[
              ...(displayTrack.unsignedScore !== null ? [{ 
                label: `${getScoreLabel(displayTrack.unsignedScore)} ${displayTrack.unsignedScore}`, 
                variant: scoreBadgeVariant as any
              }] : [{ label: "Pending", variant: "outline" as const }]),
              ...(displayTrack.isrc ? [{ label: "ISRC", variant: "secondary" as const }] : []),
            ]}
            imageUrl={displayTrack.albumArt || undefined}
            fallback={displayTrack.trackName.slice(0, 2).toUpperCase()}
            meta={[
              { label: "Playlist", value: displayTrack.playlistName || "—" },
              { label: "Data source", value: displayTrack.dataSource === 'api' ? 'API' : 'Scraped' },
            ]}
          />

          {/* Stats Grid */}
          <StatsGrid
            stats={[
              ...(displayTrack.label ? [{ label: "Label", value: displayTrack.label }] : []),
              ...(displayTrack.publisher ? [{ label: "Publisher", value: displayTrack.publisher }] : []),
              ...(displayTrack.songwriter ? [{ label: "Songwriter", value: displayTrack.songwriter }] : []),
              ...(displayTrack.isrc ? [{ label: "ISRC", value: displayTrack.isrc }] : []),
            ].slice(0, 4)} 
          />

          {/* Action Rail */}
          <ActionRail
            primaryAction={{
              label: isEnriching ? "Enriching..." : "Enrich Data",
              icon: Sparkles,
              onClick: isEnriching ? undefined : handleEnrich
            }}
            secondaryActions={[
              {
                label: "Open in Spotify",
                icon: ExternalLink,
                onClick: () => window.open(displayTrack.spotifyUrl, "_blank"),
                subtle: true
              },
            ]}
          />

          {/* Activity Section */}
          {activity && activity.length > 0 && (
            <DrawerSection title="Activity History">
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.eventDescription}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Songwriter Display */}
          {displayTrack.songwriter && (
            <SongwriterDisplay songwriters={displayTrack.songwriter} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
