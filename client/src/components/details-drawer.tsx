import { useQuery } from "@tanstack/react-query";
import { type PlaylistSnapshot, type ActivityHistory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Sparkles,
  Tag as TagIcon,
  UserPlus,
  ExternalLink,
  X,
  Clock,
  Music,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { TrackTagPopover } from "@/components/track-tag-popover";
import { TrackContactDialog } from "@/components/track-contact-dialog";
import { PublisherStatusBadge } from "./publisher-status-badge";
import { SongwriterDisplay } from "./songwriter-display";
import { SongwriterPanel } from "./songwriter-panel";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";

interface DetailsDrawerProps {
  track: PlaylistSnapshot | null;
  open: boolean;
  onClose: () => void;
  onEnrich: (trackId: string) => void;
}

export function DetailsDrawer({
  track,
  open,
  onClose,
  onEnrich,
}: DetailsDrawerProps) {
  const [isEnriching, setIsEnriching] = useState(false);

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityHistory[]>({
    queryKey: ["/api/tracks", track?.id, "activity"],
    enabled: !!track?.id && open,
  });

  // Listen for WebSocket updates
  useWebSocket({
    onTrackEnriched: (data) => {
      if (data.trackId === track?.id) {
        setIsEnriching(false);
        // Invalidate all queries for this track to refresh data
        queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tracks", track?.id, "activity"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tracks", track?.id, "artists"] });
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

  if (!track) return null;

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 7) return "High";
    if (score >= 4) return "Medium";
    return "Low";
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[540px] p-0 glass-panel">
        <div className="flex flex-col h-full">
          {/* Hero Section with Album Art and Close Button */}
          <div className="relative">
            {track.albumArt ? (
              <div className="relative h-72 overflow-hidden">
                <img 
                  src={track.albumArt} 
                  alt={`${track.trackName} album art`}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
              </div>
            ) : (
              <div className="relative h-72 bg-muted flex items-center justify-center">
                <Music className="w-24 h-24 text-muted-foreground/30" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
              </div>
            )}
            
            {/* Close Button Overlay */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm hover:bg-background/90"
              data-testid="button-close-drawer"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Track Info Header - Overlaps Album Art */}
          <SheetHeader className="px-6 -mt-16 relative z-10">
            <div className="flex items-end gap-4">
              {/* Radial Score Indicator */}
              <div className="flex-shrink-0">
                <div className="relative w-24 h-24">
                  <svg className="transform -rotate-90 w-24 h-24">
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-muted/20"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${(track.unsignedScore / 10) * 264} 264`}
                      className={cn(
                        track.unsignedScore >= 7 ? "text-green-500" :
                        track.unsignedScore >= 4 ? "text-yellow-500" :
                        "text-red-500"
                      )}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center bg-card rounded-full w-20 h-20 flex items-center justify-center border-2 border-border">
                      <div>
                        <div className="text-2xl font-bold">{track.unsignedScore}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Track Title and Artist */}
              <div className="flex-1 min-w-0 pb-2">
                <SheetTitle className="font-heading text-2xl leading-tight">
                  {track.trackName}
                </SheetTitle>
                <p className="text-base text-muted-foreground mt-2">
                  {track.artistName}
                </p>
              </div>
            </div>

            {/* Metadata Badges */}
            <div className="flex flex-wrap gap-2 mt-6 pb-4">
              {track.publisherStatus && (
                <PublisherStatusBadge status={track.publisherStatus} showIcon />
              )}

              {track.isrc ? (
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Has ISRC
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  No ISRC
                </Badge>
              )}

              {track.dataSource === "scraped" ? (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                >
                  Scraped
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                >
                  API
                </Badge>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Track Details */}
              <div>
                <h3 className="text-sm font-semibold font-heading mb-3">Track Details</h3>
                {isEnriching ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Playlist:</span>
                      <span className="font-medium">{track.playlistName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Label:</span>
                      <span className="font-medium">
                        {track.label || <span className="italic">Unknown</span>}
                      </span>
                    </div>
                    {track.publisher && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Publisher:</span>
                        <span className="font-medium">{track.publisher}</span>
                      </div>
                    )}
                    {track.songwriter && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Songwriter:</span>
                        <div className="font-medium">
                          <SongwriterDisplay songwriters={track.songwriter} />
                        </div>
                      </div>
                    )}
                    {track.isrc && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ISRC:</span>
                        <span className="font-mono text-xs">{track.isrc}</span>
                      </div>
                    )}
                    {track.addedAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Added:</span>
                        <span className="text-xs">
                          {formatDistanceToNow(new Date(track.addedAt), { addSuffix: true })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold font-heading mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleEnrich}
                    disabled={isEnriching}
                    data-testid="action-enrich"
                  >
                    {isEnriching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enriching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Enrich Data
                      </>
                    )}
                  </Button>

                  <TrackTagPopover trackId={track.id} asChild={false}>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      data-testid="action-add-tags"
                    >
                      <TagIcon className="h-4 w-4" />
                      Add Tags
                    </Button>
                  </TrackTagPopover>

                  <TrackContactDialog track={track} asChild={false}>
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

              {/* Songwriters & Social Links */}
              <div>
                <h3 className="text-sm font-semibold font-heading mb-3">Songwriters & Social Links</h3>
                <SongwriterPanel trackId={track.id} />
              </div>

              <Separator />

              {/* Activity History */}
              <div>
                <h3 className="text-sm font-semibold font-heading mb-3">Activity History</h3>
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
