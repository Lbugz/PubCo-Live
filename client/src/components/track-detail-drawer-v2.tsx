import { useQuery } from "@tanstack/react-query";
import { type PlaylistSnapshot, type ActivityHistory, type Artist, type Tag } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  ExternalLink,
  Music,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  TrendingUp,
  Music2,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  RefreshCw,
  UserPlus,
  AlertCircle,
  Info,
  Disc,
  Building2,
  TrendingDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TrackContactDialog } from "@/components/track-contact-dialog";
import { EnrichmentSourceIndicator } from "./enrichment-source-indicator";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DetailsDrawerV2Props {
  track: PlaylistSnapshot | null;
  open: boolean;
  onClose: () => void;
  onEnrich: (trackId: string) => void;
  onEnrichPhase: (trackId: string, phase: number) => void;
  isEnrichingPhase: boolean;
}

interface FullTrackDetails extends PlaylistSnapshot {
  tags: Tag[];
  activity: ActivityHistory[];
  artists: Artist[];
}

export function TrackDetailDrawerV2({
  track,
  open,
  onClose,
  onEnrich,
  onEnrichPhase,
  isEnrichingPhase,
}: DetailsDrawerV2Props) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichingPhase, setEnrichingPhase] = useState<number | null>(null);

  // Fetch full track details
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
        queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tracks", track?.id, "full"] });
      }
    },
  });

  // Handle enrichment
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

  // Reset enriching state
  const previousTrackId = useRef<string | undefined>();
  useEffect(() => {
    if (!open) {
      setIsEnriching(false);
      setEnrichingPhase(null);
    }
  }, [open]);

  useEffect(() => {
    if (track?.id && track.id !== previousTrackId.current) {
      setIsEnriching(false);
      setEnrichingPhase(null);
      previousTrackId.current = track.id;
    }
  }, [track?.id]);

  // Handle phase enrichment
  const handlePhaseEnrich = async (phase: number) => {
    if (!track) return;
    setEnrichingPhase(phase);
    try {
      await onEnrichPhase(track.id, phase);
      setEnrichingPhase(null);
    } catch (error) {
      console.error(`Phase ${phase} error:`, error);
      setEnrichingPhase(null);
    }
  };

  if (!track) return null;

  const displayTrack = fullTrack || track;
  const artists = fullTrack?.artists || [];

  // Calculate metadata completeness percentage
  const metadataCompleteness = useMemo(() => {
    const fields = [
      displayTrack.isrc,
      displayTrack.songwriter,
      displayTrack.producer,
      displayTrack.publisher,
      displayTrack.label,
      displayTrack.spotifyStreams,
      displayTrack.youtubeViews,
      displayTrack.iswc,
    ];
    const filled = fields.filter(f => f !== null && f !== undefined && f !== '').length;
    return Math.round((filled / fields.length) * 100);
  }, [displayTrack]);

  // Calculate enrichment phase completion
  const enrichmentPhases = useMemo(() => {
    const phases = [
      { id: 1, name: "Spotify API", complete: !!displayTrack.isrc },
      { id: 2, name: "Credits", complete: displayTrack.enrichmentStatus === 'enriched' },
      { id: 3, name: "MusicBrainz", complete: artists.some(a => 'musicbrainzId' in a) },
      { id: 4, name: "Chartmetric", complete: !!displayTrack.chartmetricId },
      { id: 5, name: "MLC", complete: false },
      { id: 6, name: "YouTube", complete: !!displayTrack.youtubeVideoId },
    ];
    const completed = phases.filter(p => p.complete).length;
    return { phases, completed, total: phases.length, percentage: Math.round((completed / phases.length) * 100) };
  }, [displayTrack, artists]);

  // Determine distribution type
  const distributionType = displayTrack.label?.toLowerCase().includes('records') ||
    displayTrack.label?.toLowerCase().includes('entertainment') ||
    displayTrack.label?.toLowerCase().includes('music')
      ? 'Label'
      : displayTrack.label
        ? 'Indie'
        : 'DIY';

  // Extract songwriters and producers
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

  // Social links helper
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
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[680px] p-0">
        <div className="flex flex-col h-full">
          {/* Enhanced Header */}
          <Card className="m-4 rounded-lg border shadow-sm">
            <div className="p-4 space-y-3">
              {/* Header Row */}
              <div className="flex items-start gap-4">
                {/* Album Art */}
                <div className="flex-shrink-0">
                  {displayTrack.albumArt ? (
                    <img
                      src={displayTrack.albumArt}
                      alt={`${displayTrack.trackName} album art`}
                      className="w-20 h-20 rounded-md object-cover shadow-md"
                      loading="eager"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center">
                      <Music className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Title + Artist + Track Summary */}
                <div className="flex-1 min-w-0">
                  <SheetTitle className="font-heading text-xl leading-tight line-clamp-2 mb-1">
                    {displayTrack.trackName}
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground mb-2">
                    {displayTrack.artistName}
                  </p>

                  {/* Track-Level Summary Line */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Disc className="h-3 w-3" />
                      Single
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {distributionType}
                    </span>
                    {displayTrack.spotifyStreams && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          {displayTrack.spotifyStreams.toLocaleString()} streams
                        </span>
                      </>
                    )}
                  </div>

                  {/* Metadata Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {displayTrack.playlistName && (
                      <Badge variant="outline" className="text-xs">
                        {displayTrack.playlistName}
                      </Badge>
                    )}

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {displayTrack.isrc ? (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 font-mono cursor-help"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                              {displayTrack.isrc}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20 cursor-help"
                            >
                              <XCircle className="w-2.5 h-2.5 mr-1" />
                              No ISRC
                            </Badge>
                          )}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            {displayTrack.isrc
                              ? "ISRC recovered from Spotify API. Used to track credits, publishers, and YouTube matches."
                              : "ISRC not yet recovered. Run enrichment to obtain it."}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <Badge variant="outline" className="text-xs">
                      <Info className="w-2.5 h-2.5 mr-1" />
                      {metadataCompleteness}% complete
                    </Badge>

                    {displayTrack.addedAt && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Added {formatDistanceToNow(new Date(displayTrack.addedAt), { addSuffix: true })}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
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
                  className="gap-2"
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
            <div className="space-y-5 py-2 pb-6">
              {/* Track Summary Section */}
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  TRACK SUMMARY
                </h3>
                <Card className="p-4 bg-muted/30">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Songwriters</span>
                      <p className="font-semibold">{songwriterEntries.length || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Label</span>
                      <p className="font-semibold">{displayTrack.label || 'None (DIY)'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Publishing</span>
                      <p className="font-semibold">
                        {displayTrack.publisher ? 'Published' : 'Incomplete'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Enrichment</span>
                      <div className="flex items-center gap-2">
                        <Progress value={enrichmentPhases.percentage} className="h-2 flex-1" />
                        <span className="font-semibold text-xs">{enrichmentPhases.completed}/{enrichmentPhases.total}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </section>

              {/* Songwriters & Producers Tabs */}
              <section>
                <Tabs defaultValue="songwriters" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="songwriters" data-testid="tab-songwriters">
                      <span className="flex items-center gap-2">
                        Songwriters
                        <Badge variant="outline" className="ml-1 px-1.5 py-0 h-5 text-xs">
                          {songwriterEntries.length}
                        </Badge>
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="producers" data-testid="tab-producers">
                      <span className="flex items-center gap-2">
                        Producers
                        <Badge variant="outline" className="ml-1 px-1.5 py-0 h-5 text-xs">
                          {producerEntries.length}
                        </Badge>
                      </span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="songwriters" className="space-y-3 mt-4" data-testid="content-songwriters">
                    {trackLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <Card key={i} className="p-4">
                            <Skeleton className="h-4 w-32 mb-2" />
                            <Skeleton className="h-3 w-24" />
                          </Card>
                        ))}
                      </div>
                    ) : songwriterEntries.length > 0 ? (
                      <Accordion type="multiple" defaultValue={[songwriterEntries[0]?.id ?? ""]} className="space-y-2">
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
                                <div className="flex flex-wrap items-center gap-3 flex-1 text-left">
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
                                  {/* Publishing Info */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">Publisher</span>
                                      <span className="font-medium">{displayTrack.publisher || "—"}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">ISWC</span>
                                      <span className="font-medium font-mono text-xs">{displayTrack.iswc || "—"}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">IPI</span>
                                      <span className="font-medium font-mono text-xs">{displayTrack.ipiNumber || "—"}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground block mb-1">PRO</span>
                                      <span className="font-medium">—</span>
                                    </div>
                                  </div>

                                  {/* Social Links */}
                                  {socialLinks.length > 0 && (
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
                                          >
                                            <link.icon className="h-4 w-4" />
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Contact Button */}
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
                      <Card className="p-10 text-center bg-muted/20">
                        <Music2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
                        <p className="font-semibold text-sm mb-2">No songwriter information yet</p>
                        <p className="text-xs text-muted-foreground mb-4">
                          Run enrichment to discover songwriters and publisher metadata
                        </p>
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-2"
                          onClick={handleEnrich}
                          disabled={isEnriching}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Enrich Now
                        </Button>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="producers" className="space-y-3 mt-4" data-testid="content-producers">
                    {producerEntries.length > 0 ? (
                      <Accordion type="multiple" className="space-y-2">
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
                                <div className="flex flex-wrap items-center gap-3 flex-1 text-left">
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
                                  {socialLinks.length > 0 && (
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
                                          >
                                            <link.icon className="h-4 w-4" />
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    ) : (
                      <Card className="p-10 text-center bg-muted/20">
                        <Music2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
                        <p className="font-semibold text-sm mb-2">No producer information yet</p>
                        <p className="text-xs text-muted-foreground mb-4">
                          Run enrichment to discover producers
                        </p>
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-2"
                          onClick={handleEnrich}
                          disabled={isEnriching}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Enrich Now
                        </Button>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              </section>

              {/* Enhanced Track Analytics */}
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  TRACK ANALYTICS
                </h3>
                <Card className="p-4">
                  <div className="space-y-4">
                    {/* Streaming Metrics with Growth */}
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">Spotify Streams</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold">
                            {displayTrack.spotifyStreams?.toLocaleString() || '—'}
                          </span>
                          {displayTrack.spotifyStreams && displayTrack.spotifyStreams > 10000 && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              +842 (7d)
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">YouTube Views</span>
                        </div>
                        {displayTrack.youtubeViews ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold">
                              {displayTrack.youtubeViews.toLocaleString()}
                            </span>
                            {displayTrack.youtubeVideoId && (
                              <a
                                href={`https://www.youtube.com/watch?v=${displayTrack.youtubeVideoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Youtube className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        ) : displayTrack.enrichmentStatus === 'enriched' ? (
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                No video found
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Search: "{displayTrack.trackName} - {displayTrack.artistName}"
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs mt-2 h-7"
                                onClick={() => handlePhaseEnrich(6)}
                              >
                                Retry Search
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-2xl font-bold text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>

                    {/* Moods & Activities */}
                    {(displayTrack.moods?.length || displayTrack.activities?.length) && (
                      <div className="pt-3 border-t space-y-3">
                        {displayTrack.moods && displayTrack.moods.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground block mb-2">Moods</span>
                            <div className="flex flex-wrap gap-1.5">
                              {displayTrack.moods.slice(0, 6).map((mood, idx) => (
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
                        {displayTrack.activities && displayTrack.activities.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground block mb-2">Activities</span>
                            <div className="flex flex-wrap gap-1.5">
                              {displayTrack.activities.slice(0, 6).map((activity, idx) => (
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
                  </div>
                </Card>
              </section>

              {/* Enhanced Enrichment Pipeline */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    ENRICHMENT STATUS
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {enrichmentPhases.completed} of {enrichmentPhases.total} complete
                  </Badge>
                </div>

                {/* Overall Progress */}
                <Card className="p-3 mb-3 bg-muted/20">
                  <div className="flex items-center gap-3">
                    <Progress value={enrichmentPhases.percentage} className="h-2 flex-1" />
                    <span className="text-sm font-semibold">{enrichmentPhases.percentage}%</span>
                  </div>
                </Card>

                {/* Grouped Phases */}
                <div className="space-y-4">
                  {/* Identity & Metadata */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Identity & Metadata
                    </h4>
                    <div className="space-y-2">
                      {/* Phase 1 */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg border" data-testid="enrichment-phase-1">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          displayTrack.isrc ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-muted"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Spotify API</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {displayTrack.isrc ? `✓ ISRC: ${displayTrack.isrc}` : "Pending ISRC recovery"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePhaseEnrich(1)}
                          disabled={enrichingPhase === 1}
                          className="flex-shrink-0 h-8 w-8"
                        >
                          {enrichingPhase === 1 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Phase 2 */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg border" data-testid="enrichment-phase-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          displayTrack.enrichmentStatus === 'enriched' ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-muted"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Credits Scraping</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {displayTrack.enrichmentStatus === 'enriched'
                              ? `✓ Credits: ${displayTrack.songwriter || 'Found'}`
                              : "Pending credit scraping"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePhaseEnrich(2)}
                          disabled={enrichingPhase === 2}
                          className="flex-shrink-0 h-8 w-8"
                        >
                          {enrichingPhase === 2 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Phase 3 */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg border" data-testid="enrichment-phase-3">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          artists.some(a => 'musicbrainzId' in a) ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-muted"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">MusicBrainz</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {artists.some(a => 'musicbrainzId' in a)
                              ? `✓ Links found for ${artists.filter(a => 'musicbrainzId' in a).length} artist(s)`
                              : "Pending artist social links"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePhaseEnrich(3)}
                          disabled={enrichingPhase === 3}
                          className="flex-shrink-0 h-8 w-8"
                        >
                          {enrichingPhase === 3 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Market & Publishing Signals */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Market & Publishing
                    </h4>
                    <div className="space-y-2">
                      {/* Phase 4 - Chartmetric */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg border" data-testid="enrichment-phase-4">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          displayTrack.chartmetricId ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-muted"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Chartmetric</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {displayTrack.chartmetricId
                              ? "✓ Analytics linked"
                              : "Pending analytics lookup"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePhaseEnrich(4)}
                          disabled={enrichingPhase === 4}
                          className="flex-shrink-0 h-8 w-8"
                        >
                          {enrichingPhase === 4 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Phase 5 - MLC */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg border" data-testid="enrichment-phase-5">
                        <div className="h-2 w-2 rounded-full flex-shrink-0 bg-muted" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">MLC Lookup</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Pending publisher notification
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePhaseEnrich(5)}
                          disabled={enrichingPhase === 5}
                          className="flex-shrink-0 h-8 w-8"
                        >
                          {enrichingPhase === 5 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Media Signals */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Media Signals
                    </h4>
                    <div className="space-y-2">
                      {/* Phase 6 - YouTube */}
                      <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg border" data-testid="enrichment-phase-6">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          displayTrack.youtubeVideoId ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-muted"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">YouTube Enrichment</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {displayTrack.youtubeVideoId
                              ? "✓ Video found"
                              : displayTrack.enrichmentStatus === 'enriched'
                                ? "⚠ No video found"
                                : "Pending video search"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePhaseEnrich(6)}
                          disabled={enrichingPhase === 6}
                          className="flex-shrink-0 h-8 w-8"
                        >
                          {enrichingPhase === 6 ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
