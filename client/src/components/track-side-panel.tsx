import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type PlaylistSnapshot, type ActivityHistory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Database, Sparkles, Tag as TagIcon, UserPlus, ExternalLink, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TrackTagPopover } from "@/components/track-tag-popover";
import { TrackContactDialog } from "@/components/track-contact-dialog";
import { PublisherStatusBadge } from "./publisher-status-badge";
import { SongwriterDisplay } from "./songwriter-display";
import { DetailDrawerHeader, StatsGrid, ActionRail, DrawerSection } from "@/components/details/detail-primitives";

interface TrackSidePanelProps {
  track: PlaylistSnapshot | null;
  open: boolean;
  onClose: () => void;
  onEnrich: (trackId: string) => void;
}

export function TrackSidePanel({ track, open, onClose, onEnrich }: TrackSidePanelProps) {
  const { toast } = useToast();

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityHistory[]>({
    queryKey: ["/api/tracks", track?.id, "activity"],
    enabled: !!track?.id && open,
  });

  const aiInsightsMutation = useMutation({
    mutationFn: async (trackId: string) => {
      const response = await fetch(`/api/tracks/${trackId}/ai-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to generate AI insights");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "AI Insights Generated",
        description: "AI analysis completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks", track?.id, "activity"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate AI insights",
        variant: "destructive",
      });
    },
  });

  if (!track) return null;

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 8) return "default";
    if (score >= 5) return "secondary";
    return "outline";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 8) return "High";
    if (score >= 5) return "Medium";
    return "Low";
  };

  const scoreBadgeVariant = track.unsignedScore !== null && track.unsignedScore >= 7 ? "high" : 
    track.unsignedScore !== null && track.unsignedScore >= 4 ? "medium" : "low";

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[540px] p-6">
        <div className="space-y-6">
          {/* Unified Header */}
          <DetailDrawerHeader
            title={track.trackName}
            subtitle="Track"
            description={track.artistName}
            badges={[
              ...(track.unsignedScore !== null ? [{ 
                label: `${getScoreLabel(track.unsignedScore)} ${track.unsignedScore}`, 
                variant: scoreBadgeVariant as any
              }] : []),
              ...(track.isrc ? [{ label: "ISRC", variant: "secondary" as const }] : []),
            ]}
            imageUrl={track.albumArt || undefined}
            fallback={track.trackName.slice(0, 2).toUpperCase()}
            meta={[
              { label: "Playlist", value: track.playlistName || "—" },
              { label: "Data source", value: track.dataSource === 'api' ? 'API' : 'Scraped' },
            ]}
          />

          {/* Stats Grid */}
          <StatsGrid
            stats={[
              ...(track.label ? [{ label: "Label", value: track.label }] : []),
              ...(track.publisher ? [{ label: "Publisher", value: track.publisher }] : []),
              ...(track.songwriter ? [{ label: "Songwriter", value: track.songwriter }] : []),
              ...(track.isrc ? [{ label: "ISRC", value: track.isrc }] : []),
            ].slice(0, 4)} 
          />

          {/* Action Rail */}
          <ActionRail
            primaryAction={{
              label: "Enrich Data",
              icon: Sparkles,
              onClick: () => onEnrich(track.id)
            }}
            secondaryActions={[
              {
                label: "Generate AI Insights",
                icon: Database,
                onClick: () => aiInsightsMutation.mutate(track.id)
              },
              {
                label: "Add Tags",
                icon: TagIcon,
                onClick: () => {} // Handled by TrackTagPopover
              },
              {
                label: "Open in Spotify",
                icon: ExternalLink,
                onClick: () => window.open(track.spotifyUrl, "_blank"),
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
          {track.songwriter && (
            <SongwriterDisplay songwriters={track.songwriter} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
