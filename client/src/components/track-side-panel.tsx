import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type PlaylistSnapshot, type ActivityHistory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Database, Sparkles, Tag as TagIcon, UserPlus, ExternalLink, X, Clock, Music } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TrackTagPopover } from "@/components/track-tag-popover";
import { TrackContactDialog } from "@/components/track-contact-dialog";

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

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[540px] p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg font-semibold truncate">{track.trackName}</SheetTitle>
                <SheetDescription className="text-sm mt-1">{track.artistName}</SheetDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getScoreBadgeVariant(track.unsignedScore)} className="whitespace-nowrap">
                  {getScoreLabel(track.unsignedScore)} {track.unsignedScore}
                </Badge>
                {!track.isrc && (
                  <Badge variant="outline" className="text-xs">No ISRC</Badge>
                )}
                {track.isrc && (
                  <Badge variant="secondary" className="text-xs">ISRC</Badge>
                )}
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Track Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Playlist</span>
                    <span className="font-medium text-right">{track.playlistName}</span>
                  </div>
                  {track.label && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Label</span>
                      <span className="font-medium text-right">{track.label}</span>
                    </div>
                  )}
                  {track.publisher && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Publisher</span>
                      <span className="font-medium text-right">{track.publisher}</span>
                    </div>
                  )}
                  {track.songwriter && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Songwriter</span>
                      <span className="font-medium text-right">{track.songwriter}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data Source</span>
                    <Badge variant="outline" className="text-xs">
                      {track.dataSource === 'api' ? 'API' : 'Scraped'}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-3">Quick Actions</h3>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => onEnrich(track.id)}
                    data-testid="action-enrich"
                  >
                    <Sparkles className="h-4 w-4" />
                    Enrich Data
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => aiInsightsMutation.mutate(track.id)}
                    disabled={aiInsightsMutation.isPending}
                    data-testid="action-ai-insights"
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiInsightsMutation.isPending ? "Generating..." : "Generate AI Insights"}
                  </Button>
                  
                  <TrackTagPopover trackId={track.id} asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      data-testid="action-add-tags"
                    >
                      <TagIcon className="h-4 w-4" />
                      Add Tags
                    </Button>
                  </TrackTagPopover>
                  
                  <TrackContactDialog track={track} asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      data-testid="action-contact-artist"
                    >
                      <UserPlus className="h-4 w-4" />
                      Contact Artist
                    </Button>
                  </TrackContactDialog>
                  
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    asChild
                    data-testid="action-open-spotify"
                  >
                    <a href={track.spotifyUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open in Spotify
                    </a>
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-3">Activity History</h3>
                {activityLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activity && activity.length > 0 ? (
                  <div className="space-y-4">
                    {activity.map((item) => (
                      <div key={item.id} className="flex gap-3">
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
                ) : (
                  <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
