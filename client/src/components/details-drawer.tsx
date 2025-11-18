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
import { EnrichmentSourceIndicator } from "./enrichment-source-indicator";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import { useState, useEffect, useRef } from "react";

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

  // Reset enriching state when drawer closes
  useEffect(() => {
    if (!open) {
      setIsEnriching(false);
    }
  }, [open]);

  // Reset enriching state only when switching to a different track
  const previousTrackId = useRef<string | undefined>();
  useEffect(() => {
    if (track?.id && track.id !== previousTrackId.current) {
      setIsEnriching(false);
      previousTrackId.current = track.id;
    }
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

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[640px] p-0">
        <div className="flex flex-col h-full">
          {/* Hero Header Block */}
          <Card className="m-4 rounded-lg backdrop-blur-md bg-background/80 border shadow-sm">
            <div className="p-4">
              {/* Header Row: Album Art + Title/Artist + Close */}
              <div className="flex items-start gap-4 mb-3">
                {/* Album Art */}
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

                {/* Title + Artist */}
                <div className="flex-1 min-w-0">
                  <SheetTitle className="font-heading text-lg leading-tight line-clamp-1">
                    {displayTrack.trackName}
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                    {displayTrack.artistName}
                  </p>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {displayTrack.label && (
                      <Badge variant="outline" className="text-xs">
                        Label: {displayTrack.label}
                      </Badge>
                    )}

                    {displayTrack.playlistName && (
                      <Badge variant="outline" className="text-xs">
                        {displayTrack.playlistName}
                      </Badge>
                    )}

                    {displayTrack.isrc ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 font-mono"
                        data-testid={`badge-isrc-${displayTrack.id}`}
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        {displayTrack.isrc}
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
                        API
                      </Badge>
                    )}

                    {displayTrack.addedAt && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Added {formatDistanceToNow(new Date(displayTrack.addedAt), { addSuffix: true })}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex gap-2 overflow-x-auto">
                <Button
                  variant="default"
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

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-shrink-0"
                  asChild
                  data-testid="action-open-spotify"
                >
                  <a href={displayTrack.spotifyUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Spotify
                  </a>
                </Button>
              </div>
            </div>
          </Card>

          <ScrollArea className="flex-1 px-4">
            {(() => {
              // Merge songwriter string with artists array
              const songwriterNames = displayTrack.songwriter
                ?.split(",")
                .map((name) => name.trim())
                .filter((name) => name && name !== "-" && name !== "—" && name !== "unknown")
                ?? [];
              const songwriterRefs = new Map(artists.map((artist) => [artist.name.trim().toLowerCase(), artist]));
              const songwriterEntries = songwriterNames.length 
                ? songwriterNames.map((name) => {
                    const artist = songwriterRefs.get(name.toLowerCase());
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
                <div className="space-y-6 py-2">
                  {/* Songwriters & Producers Tabs */}
                  <Tabs defaultValue="songwriters" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="songwriters" data-testid="tab-songwriters">
                        Songwriters ({songwriterEntries.length})
                      </TabsTrigger>
                      <TabsTrigger value="producers" data-testid="tab-producers">
                        Producers ({(() => {
                          const producerNames = displayTrack.producer
                            ?.split(",")
                            .map((name) => name.trim().toLowerCase())
                            .filter((name) => name && name !== "-" && name !== "—" && name !== "unknown") ?? [];
                          return producerNames.length;
                        })()})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="songwriters" className="space-y-4 mt-4"  data-testid="content-songwriters">
                    
                    {trackLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <Card key={i} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-5 w-16" />
                              </div>
                              <Skeleton className="h-4 w-4" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : songwriterEntries.length > 0 ? (
                      <Accordion type="multiple" defaultValue={[songwriterEntries[0]?.id ?? ""]} className="space-y-3">
                        {songwriterEntries.map((entry) => {
                          const socialLinks = getSocialLinks(entry);
                          const isEnriched = 'musicbrainzId' in entry;
                          
                          return (
                            <AccordionItem 
                              key={entry.id} 
                              value={entry.id}
                              className="border rounded-lg"
                              data-testid={`accordion-songwriter-${entry.id}`}
                            >
                              <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate">
                                <div className="flex flex-col gap-1 flex-1 text-left">
                                  <span className="font-semibold">{entry.name}</span>
                                  <EnrichmentSourceIndicator
                                    mlc={{ searched: false, found: false }}
                                    musicbrainz={{ searched: isEnriched, found: isEnriched }}
                                    chartmetric={{ searched: false, found: false }}
                                  />
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-4 pb-4 pt-2">
                                <div className="space-y-4">
                                  {/* Publishing Info - 2 Column Grid */}
                                  <div className="grid grid-cols-2 gap-4">
                                    {/* Publisher */}
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">Publisher</span>
                                      <span className="font-medium">{displayTrack.publisher || "—"}</span>
                                    </div>
                                    
                                    {/* ISWC */}
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">ISWC</span>
                                      <span className="font-medium font-mono text-xs">{displayTrack.iswc || "—"}</span>
                                    </div>
                                    
                                    {/* Administrators */}
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">Administrators</span>
                                      <span className="font-medium">{displayTrack.administrators || "—"}</span>
                                    </div>
                                    
                                    {/* IPI Number */}
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">IPI</span>
                                      <span className="font-medium font-mono text-xs">{displayTrack.ipiNumber || "—"}</span>
                                    </div>
                                  </div>

                                  {/* Social Links */}
                                  {socialLinks.length > 0 ? (
                                    <div>
                                      <span className="text-xs text-muted-foreground block mb-2">Socials</span>
                                      <div className="flex gap-2">
                                        {socialLinks.map((link) => (
                                          <Button
                                            key={link.name}
                                            variant="outline"
                                            size="icon"
                                            className={cn("h-8 w-8", link.color)}
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
                                    <p className="text-xs text-muted-foreground italic">No social links found</p>
                                  ) : (
                                    <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400 border-amber-500/20">
                                      Enrich to discover socials
                                    </Badge>
                                  )}

                                  {/* Notes Display */}
                                  {displayTrack.contactNotes && (
                                    <div>
                                      <span className="text-xs text-muted-foreground block mb-1">Notes</span>
                                      <p className="text-sm italic">"{displayTrack.contactNotes}"</p>
                                    </div>
                                  )}

                                  {/* Tags Display */}
                                  {fullTrack?.tags && fullTrack.tags.length > 0 && (
                                    <div>
                                      <span className="text-xs text-muted-foreground block mb-2">Tags</span>
                                      <div className="flex flex-wrap gap-1">
                                        {fullTrack.tags.map((tag) => (
                                          <Badge 
                                            key={tag.id} 
                                            variant="outline" 
                                            className="text-xs"
                                            style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color, color: tag.color }}
                                          >
                                            {tag.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Add Contact Info Button */}
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
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    ) : (
                      <Card className="p-8 text-center rounded-lg">
                        <Music2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No songwriter information available yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Enrich this track to discover songwriters</p>
                      </Card>
                    )}
                    </TabsContent>

                    <TabsContent value="producers" className="space-y-4 mt-4" data-testid="content-producers">
                    
                    {trackLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <Card key={i} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-5 w-16" />
                              </div>
                              <Skeleton className="h-4 w-4" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (() => {
                      const producerNames = displayTrack.producer
                        ?.split(",")
                        .map((name) => name.trim().toLowerCase())
                        .filter((name) => name && name !== "-" && name !== "—" && name !== "unknown")
                        ?? [];
                      const producerRefs = new Map(artists.map((artist) => [artist.name.trim().toLowerCase(), artist]));
                      const producerEntries = producerNames.length 
                        ? producerNames.map((name) => {
                            const artist = producerRefs.get(name);
                            return artist ?? { id: `unmatched-${name}`, name, role: "Producer" as const };
                          })
                        : [];

                      return producerEntries.length > 0 ? (
                        <Accordion type="multiple" defaultValue={[producerEntries[0]?.id ?? ""]} className="space-y-3">
                          {producerEntries.map((entry) => {
                            const socialLinks = getSocialLinks(entry);
                            const isEnriched = 'musicbrainzId' in entry;
                            
                            return (
                              <AccordionItem 
                                key={entry.id} 
                                value={entry.id}
                                className="border rounded-lg"
                                data-testid={`accordion-producer-${entry.id}`}
                              >
                                <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate">
                                  <div className="flex flex-col gap-1 flex-1 text-left">
                                    <span className="font-semibold">{entry.name}</span>
                                    <EnrichmentSourceIndicator
                                      mlc={{ searched: false, found: false }}
                                      musicbrainz={{ searched: isEnriched, found: isEnriched }}
                                      chartmetric={{ searched: false, found: false }}
                                    />
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 pb-4 pt-2">
                                  <div className="space-y-4">
                                    {/* Publishing Info - 2 Column Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                      {/* Publisher */}
                                      <div className="text-sm">
                                        <span className="text-muted-foreground block mb-1">Publisher</span>
                                        <span className="font-medium">{displayTrack.publisher || "—"}</span>
                                      </div>
                                      
                                      {/* ISWC */}
                                      <div className="text-sm">
                                        <span className="text-muted-foreground block mb-1">ISWC</span>
                                        <span className="font-medium font-mono text-xs">{displayTrack.iswc || "—"}</span>
                                      </div>
                                      
                                      {/* Administrators */}
                                      <div className="text-sm">
                                        <span className="text-muted-foreground block mb-1">Administrators</span>
                                        <span className="font-medium">{displayTrack.administrators || "—"}</span>
                                      </div>
                                      
                                      {/* IPI Number */}
                                      <div className="text-sm">
                                        <span className="text-muted-foreground block mb-1">IPI</span>
                                        <span className="font-medium font-mono text-xs">{displayTrack.ipiNumber || "—"}</span>
                                      </div>
                                    </div>

                                    {/* Social Links */}
                                    {socialLinks.length > 0 ? (
                                      <div>
                                        <span className="text-xs text-muted-foreground block mb-2">Socials</span>
                                        <div className="flex gap-2">
                                          {socialLinks.map((link) => (
                                            <Button
                                              key={link.name}
                                              variant="outline"
                                              size="icon"
                                              className={cn("h-8 w-8", link.color)}
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
                                      <p className="text-xs text-muted-foreground italic">No social links found</p>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400 border-amber-500/20">
                                        Enrich to discover socials
                                      </Badge>
                                    )}

                                    {/* Notes Display */}
                                    {displayTrack.contactNotes && (
                                      <div>
                                        <span className="text-xs text-muted-foreground block mb-1">Notes</span>
                                        <p className="text-sm italic">"{displayTrack.contactNotes}"</p>
                                      </div>
                                    )}

                                    {/* Tags Display */}
                                    {fullTrack?.tags && fullTrack.tags.length > 0 && (
                                      <div>
                                        <span className="text-xs text-muted-foreground block mb-2">Tags</span>
                                        <div className="flex flex-wrap gap-1">
                                          {fullTrack.tags.map((tag) => (
                                            <Badge 
                                              key={tag.id} 
                                              variant="outline" 
                                              className="text-xs"
                                              style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color, color: tag.color }}
                                            >
                                              {tag.name}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Add Contact Info Button */}
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
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      ) : (
                        <Card className="p-8 text-center rounded-lg">
                          <Music2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No producer information available yet</p>
                          <p className="text-xs text-muted-foreground mt-1">Enrich this track to discover producers</p>
                        </Card>
                      );
                    })()}
                    </TabsContent>
                  </Tabs>

                  {/* Track Analytics Section */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold font-heading flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      TRACK ANALYTICS
                    </h3>
                    <Card className="p-4 rounded-lg">
                      {isEnriching ? (
                        <div>
                          <Skeleton className="h-4 w-24 mb-2" />
                          <Skeleton className="h-6 w-20" />
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm">
                          {/* Streaming Metrics */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-muted-foreground block mb-1">Spotify Streams</span>
                              <span className="font-semibold text-lg">
                                {displayTrack.spotifyStreams ? displayTrack.spotifyStreams.toLocaleString() : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block mb-1">YouTube Views</span>
                              <span className="font-semibold text-lg">
                                {displayTrack.youtubeViews ? displayTrack.youtubeViews.toLocaleString() : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Moods */}
                          {displayTrack.moods && displayTrack.moods.length > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground block mb-2">Moods</span>
                              <div className="flex flex-wrap gap-1">
                                {displayTrack.moods.slice(0, 5).map((mood, idx) => (
                                  <Badge 
                                    key={idx} 
                                    variant="outline" 
                                    className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
                                  >
                                    {mood}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Activities */}
                          {displayTrack.activities && displayTrack.activities.length > 0 && (
                            <div>
                              <span className="text-xs text-muted-foreground block mb-2">Activities</span>
                              <div className="flex flex-wrap gap-1">
                                {displayTrack.activities.slice(0, 5).map((activity, idx) => (
                                  <Badge 
                                    key={idx} 
                                    variant="outline" 
                                    className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                                  >
                                    {activity}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  </section>

                  {/* Enrichment Timeline */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold font-heading flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      ENRICHMENT PIPELINE STATUS
                    </h3>
                    <div className="space-y-2">
                      {/* Phase 1: Spotify API (ISRC Recovery) */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-1">
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all duration-300",
                          displayTrack.isrc ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Phase 1: Spotify API</p>
                            {displayTrack.isrc && (
                              <Badge variant="secondary" className="text-xs">Complete</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {displayTrack.isrc 
                              ? `✓ ISRC recovered: ${displayTrack.isrc}` 
                              : "Pending ISRC recovery"}
                          </p>
                        </div>
                      </div>

                      {/* Phase 2: Credits Scraping */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all duration-300",
                          displayTrack.enrichmentStatus === 'enriched' ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Phase 2: Credits Scraping</p>
                            {displayTrack.enrichmentStatus === 'enriched' && (
                              <Badge variant="secondary" className="text-xs">Complete</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {displayTrack.enrichmentStatus === 'enriched'
                              ? `✓ Credits found: ${displayTrack.songwriter || 'Unknown'}` 
                              : isEnriching 
                                ? "⟳ Scraping credits data..." 
                                : "Pending credit scraping"}
                          </p>
                        </div>
                      </div>

                      {/* Phase 3: MusicBrainz Artist Links */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-3">
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all duration-300",
                          artists.length > 0 && artists.some(a => 'musicbrainzId' in a) 
                            ? "bg-green-500 shadow-lg shadow-green-500/50" 
                            : "bg-muted animate-pulse"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Phase 3: MusicBrainz</p>
                            {artists.length > 0 && artists.some(a => 'musicbrainzId' in a) && (
                              <Badge variant="secondary" className="text-xs">Complete</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {artists.length > 0 && artists.some(a => 'musicbrainzId' in a)
                              ? `✓ Artist links found for ${artists.filter(a => 'musicbrainzId' in a).length} artist(s)` 
                              : "Pending artist social links"}
                          </p>
                        </div>
                      </div>

                      {/* Phase 4: Chartmetric Analytics */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-4">
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all duration-300",
                          displayTrack.chartmetricStatus === 'success' ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Phase 4: Chartmetric</p>
                            {displayTrack.chartmetricStatus === 'success' && (
                              <Badge variant="secondary" className="text-xs">Complete</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {displayTrack.chartmetricStatus === 'success'
                              ? `✓ Analytics: ${displayTrack.spotifyStreams?.toLocaleString() || 'N/A'} streams, ${displayTrack.trackStage || 'stage unknown'}` 
                              : displayTrack.chartmetricStatus === 'not_found'
                                ? "✓ Not found in Chartmetric"
                                : "Pending analytics data"}
                          </p>
                        </div>
                      </div>

                      {/* Phase 5: MLC Publisher Lookup */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-5">
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all duration-300",
                          displayTrack.publisherStatus === 'published' ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Phase 5: MLC Lookup</p>
                            {displayTrack.publisherStatus === 'published' && (
                              <Badge variant="secondary" className="text-xs">Complete</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {displayTrack.publisherStatus === 'published'
                              ? `✓ Publisher verified: ${displayTrack.publisher || 'Unknown'}` 
                              : displayTrack.publisherStatus === 'unsigned'
                                ? "✓ Unsigned artist confirmed"
                                : "Pending publisher verification"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              );
            })()}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
