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
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { TrackTagPopover } from "@/components/track-tag-popover";
import { TrackContactDialog } from "@/components/track-contact-dialog";
import { PublisherStatusBadge } from "./publisher-status-badge";
import { SongwriterDisplay } from "./songwriter-display";
import { cn } from "@/lib/utils";

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
  const { data: activity, isLoading: activityLoading } = useQuery<ActivityHistory[]>({
    queryKey: ["/api/tracks", track?.id, "activity"],
    enabled: !!track?.id && open,
  });

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
          <SheetHeader className="px-6 py-4 glass-header sticky top-0 z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <SheetTitle className="font-heading text-xl">
                  {track.trackName}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {track.artistName}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="shrink-0"
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Score and Metadata Badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge
                variant={getScoreBadgeVariant(track.unsignedScore)}
                className="font-semibold"
              >
                {getScoreLabel(track.unsignedScore)} Score: {track.unsignedScore}
              </Badge>

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
                      <span className="font-medium">{track.songwriter}</span>
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
                        {formatDistanceToNow(parseISO(track.addedAt), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold font-heading mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => onEnrich(track.id)}
                    data-testid="action-enrich"
                  >
                    <Sparkles className="h-4 w-4" />
                    Enrich Data
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
                            {formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })}
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
