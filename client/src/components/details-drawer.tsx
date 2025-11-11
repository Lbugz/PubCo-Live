import { useQuery } from "@tanstack/react-query";
import { type PlaylistSnapshot, type ActivityHistory, type Artist, type Tag } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  BarChart3,
  TrendingUp,
  Eye,
  Users,
  Music2,
  Smile,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
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

  if (!track) return null;

  // Use fullTrack data if available, otherwise fall back to track prop
  const displayTrack = fullTrack || track;
  const activity = fullTrack?.activity || [];
  const artists = fullTrack?.artists || [];

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
      <SheetContent className="w-full sm:max-w-[640px] p-0 glass-panel">
        <div className="flex flex-col h-full">
          {/* Compact Header */}
          <div className="p-4 border-b">
            <div className="flex items-start gap-4">
              {/* Album Art Thumbnail */}
              <div className="flex-shrink-0">
                {displayTrack.albumArt ? (
                  <img 
                    src={displayTrack.albumArt} 
                    alt={`${displayTrack.trackName} album art`}
                    className="w-16 h-16 rounded-md object-cover"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center">
                    <Music className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Title, Artist, and Metadata */}
              <div className="flex-1 min-w-0">
                {/* Title and Artist on same line */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="font-heading text-lg leading-tight line-clamp-1">
                      {displayTrack.trackName}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                      {displayTrack.artistName}
                    </p>
                  </div>

                  {/* Close Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="flex-shrink-0"
                    data-testid="button-close-drawer"
                    aria-label="Close drawer"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Condensed Metadata Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {/* Mini Score Badge */}
                  <Badge 
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold",
                      displayTrack.unsignedScore >= 7 ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" :
                      displayTrack.unsignedScore >= 4 ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" :
                      "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                    )}
                  >
                    Score: {displayTrack.unsignedScore}/10
                  </Badge>

                  {displayTrack.label && (
                    <Badge variant="outline" className="text-xs">
                      {displayTrack.label}
                    </Badge>
                  )}

                  {displayTrack.isrc ? (
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                      ISRC
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
                    >
                      <XCircle className="w-2.5 h-2.5 mr-1" />
                      No ISRC
                    </Badge>
                  )}

                  {displayTrack.dataSource === "scraped" && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                    >
                      Scraped
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Action Toolbar */}
          <div className="sticky top-0 z-20 backdrop-blur-md bg-background/80 border-b px-4 py-2">
            <div className="flex gap-2 overflow-x-auto">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 flex-shrink-0"
                onClick={handleEnrich}
                disabled={isEnriching}
                data-testid="action-enrich"
              >
                {isEnriching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enriching...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Enrich
                  </>
                )}
              </Button>

              <TrackTagPopover trackId={displayTrack.id} asChild={false}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-shrink-0"
                  data-testid="action-add-tags"
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  Tags
                </Button>
              </TrackTagPopover>

              <TrackContactDialog track={displayTrack} asChild={false}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-shrink-0"
                  data-testid="action-contact-artist"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Contact
                </Button>
              </TrackContactDialog>

              <Button
                variant="outline"
                size="sm"
                className="gap-2 flex-shrink-0"
                asChild
                data-testid="action-open-spotify"
              >
                <a href={displayTrack.spotifyUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Spotify
                </a>
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {(() => {
              // Merge songwriter string with artists array
              const songwriterNames = displayTrack.songwriter?.split(",").map((name) => name.trim().toLowerCase()).filter(Boolean) ?? [];
              const songwriterRefs = new Map(artists.map((artist) => [artist.name.trim().toLowerCase(), artist]));
              const songwriterEntries = songwriterNames.length 
                ? songwriterNames.map((name) => {
                    const artist = songwriterRefs.get(name);
                    return artist ?? { id: `unmatched-${name}`, name, role: "Songwriter" as const };
                  })
                : artists;

              // Helper to get social links from an artist
              const getSocialLinks = (artist: Artist | any) => {
                if (!('instagram' in artist)) return [];
                const links = [];
                if (artist.instagram) links.push({ name: "Instagram", url: artist.instagram, icon: Instagram, color: "text-pink-600 dark:text-pink-400" });
                if (artist.twitter) links.push({ name: "Twitter", url: artist.twitter, icon: Twitter, color: "text-blue-500 dark:text-blue-400" });
                if (artist.facebook) links.push({ name: "Facebook", url: artist.facebook, icon: Facebook, color: "text-blue-600 dark:text-blue-400" });
                if (artist.youtube) links.push({ name: "YouTube", url: artist.youtube, icon: Youtube, color: "text-red-600 dark:text-red-400" });
                return links;
              };

              return (
                <div className="p-4 flex flex-col lg:flex-row gap-6 lg:items-start">
                  {/* Left Column (60%) - Songwriter Tabs */}
                  <section className="flex-1 lg:w-[60%] space-y-4">
                    <h3 className="text-sm font-semibold font-heading">Songwriters & Relationships</h3>
                    
                    {trackLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <Card key={i} className="p-4">
                            <div className="flex items-start gap-3">
                              <Skeleton className="h-10 w-10 rounded-full" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-48" />
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : songwriterEntries.length > 0 ? (
                      <Tabs defaultValue={songwriterEntries[0]?.id ?? ""} className="space-y-4">
                        <TabsList className="w-full overflow-x-auto flex justify-start">
                          {songwriterEntries.map((entry) => (
                            <TabsTrigger 
                              key={entry.id} 
                              value={entry.id}
                              data-testid={`tab-songwriter-${entry.id}`}
                            >
                              {entry.name}
                            </TabsTrigger>
                          ))}
                        </TabsList>

                        {songwriterEntries.map((entry) => {
                          const socialLinks = getSocialLinks(entry);
                          const isEnriched = 'musicbrainzId' in entry;
                          
                          return (
                            <TabsContent key={entry.id} value={entry.id} className="space-y-4">
                              <Card className="p-4" data-testid={`card-songwriter-${entry.id}`}>
                                {/* Songwriter Name & Role */}
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <h4 className="font-semibold text-lg">{entry.name}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    {'role' in entry ? entry.role : "Songwriter"}
                                  </Badge>
                                </div>

                                {/* Analytics Badges */}
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                  <Badge 
                                    variant="outline"
                                    className={cn(
                                      "text-xs",
                                      displayTrack.unsignedScore >= 7 ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" :
                                      displayTrack.unsignedScore >= 4 ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" :
                                      "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                                    )}
                                  >
                                    Score: {displayTrack.unsignedScore}/10
                                  </Badge>

                                  {displayTrack.streamingVelocity && (
                                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                                      {(() => {
                                        const velocityNum = typeof displayTrack.streamingVelocity === 'number' 
                                          ? displayTrack.streamingVelocity 
                                          : parseFloat(displayTrack.streamingVelocity);
                                        if (!isNaN(velocityNum)) {
                                          return `${velocityNum >= 0 ? '+' : ''}${velocityNum}%`;
                                        }
                                        return displayTrack.streamingVelocity;
                                      })()} Velocity
                                    </Badge>
                                  )}

                                  {displayTrack.trackStage && (
                                    <Badge variant="outline" className="text-xs">
                                      {displayTrack.trackStage}
                                    </Badge>
                                  )}

                                  {isEnriched && (
                                    <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                                      <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                                      Verified
                                    </Badge>
                                  )}
                                </div>

                                {/* Moods & Activities */}
                                {displayTrack.moods && displayTrack.moods.length > 0 && (
                                  <div className="space-y-2 mb-4">
                                    <span className="text-xs text-muted-foreground">Moods (Sync):</span>
                                    <div className="flex flex-wrap gap-1">
                                      {displayTrack.moods.slice(0, 5).map((mood, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20">
                                          {mood}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {displayTrack.activities && displayTrack.activities.length > 0 && (
                                  <div className="space-y-2 mb-4">
                                    <span className="text-xs text-muted-foreground">Activities (Sync):</span>
                                    <div className="flex flex-wrap gap-1">
                                      {displayTrack.activities.slice(0, 5).map((activity, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                                          {activity}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <Separator className="my-4" />

                                {/* Social Links */}
                                {socialLinks.length > 0 ? (
                                  <div className="space-y-2 mb-4">
                                    <span className="text-xs text-muted-foreground">Social Profiles:</span>
                                    <div className="flex flex-wrap gap-2">
                                      {socialLinks.map((link) => (
                                        <Button
                                          key={link.name}
                                          variant="ghost"
                                          size="icon"
                                          className={link.color}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(link.url, '_blank', 'noopener,noreferrer');
                                          }}
                                          data-testid={`link-${link.name.toLowerCase()}-${entry.id}`}
                                          title={link.name}
                                        >
                                          <link.icon className="h-4 w-4" />
                                        </Button>
                                      ))}
                                    </div>
                                  </div>
                                ) : isEnriched ? (
                                  <Badge variant="outline" className="text-xs text-muted-foreground mb-4">
                                    No social links found
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400 border-amber-500/20 mb-4">
                                    Enrich to discover socials
                                  </Badge>
                                )}

                                {/* Contact CTA */}
                                <TrackContactDialog track={displayTrack} asChild={false}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full gap-2"
                                    data-testid={`button-contact-${entry.id}`}
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    Add Contact Info
                                  </Button>
                                </TrackContactDialog>
                              </Card>
                            </TabsContent>
                          );
                        })}
                      </Tabs>
                    ) : (
                      <Card className="p-8 text-center">
                        <Music2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No songwriter information available yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Enrich this track to discover songwriters</p>
                      </Card>
                    )}
                  </section>

                  {/* Right Column (40%) */}
                  <aside className="flex-1 lg:w-[40%] space-y-4">
                    {/* Track Info Card */}
                    <Card className="p-4">
                      <h3 className="text-sm font-semibold font-heading mb-3">Track Info</h3>
                      {isEnriching ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex justify-between">
                              <Skeleton className="h-3 w-20" />
                              <Skeleton className="h-3 w-28" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Playlist:</span>
                            <span className="font-medium text-right">{displayTrack.playlistName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Label:</span>
                            <span className="font-medium text-right">
                              {displayTrack.label || <span className="italic">Unknown</span>}
                            </span>
                          </div>
                          {displayTrack.addedAt && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Added:</span>
                              <span className="text-right">
                                {formatDistanceToNow(new Date(displayTrack.addedAt), { addSuffix: true })}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>

                    {/* Analytics Summary Card */}
                    {displayTrack.chartmetricStatus === "success" && (
                      <Card className="p-4">
                        <h3 className="text-sm font-semibold font-heading mb-3 flex items-center gap-2">
                          <BarChart3 className="h-3.5 w-3.5" />
                          Analytics
                        </h3>
                        <div className="space-y-2 text-xs">
                          {displayTrack.spotifyStreams !== null && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Music className="h-3 w-3" />
                                Spotify:
                              </span>
                              <span className="font-medium">{displayTrack.spotifyStreams.toLocaleString()}</span>
                            </div>
                          )}
                          {displayTrack.youtubeViews !== null && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Eye className="h-3 w-3" />
                                YouTube:
                              </span>
                              <span className="font-medium">{displayTrack.youtubeViews.toLocaleString()}</span>
                            </div>
                          )}
                          {displayTrack.playlistFollowers !== null && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Users className="h-3 w-3" />
                                Playlist:
                              </span>
                              <span className="font-medium">{displayTrack.playlistFollowers.toLocaleString()}</span>
                            </div>
                          )}
                          {displayTrack.composerName && (
                            <div className="flex justify-between items-start">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Music2 className="h-3 w-3" />
                                Composer:
                              </span>
                              <span className="font-medium text-right">{displayTrack.composerName}</span>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}

                    {/* Activity Accordion */}
                    {activity && activity.length > 0 && (
                      <Accordion type="single" collapsible defaultValue="">
                        <AccordionItem value="activity">
                          <AccordionTrigger className="text-sm font-semibold font-heading py-3 px-4 hover:no-underline hover-elevate">
                            <span className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5" />
                              Activity History ({activity.length})
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4">
                            <div className="space-y-3">
                              {activity.slice(0, 5).map((item) => (
                                <div key={item.id} className="flex gap-2 text-xs">
                                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium leading-snug">{item.eventDescription}</p>
                                    <p className="text-muted-foreground mt-0.5">
                                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                              {activity.length > 5 && (
                                <p className="text-xs text-muted-foreground text-center pt-2">
                                  +{activity.length - 5} more events
                                </p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                  </aside>
                </div>
              );
            })()}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
