import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Music2, Download, Calendar, TrendingUp, ListMusic, Target, RefreshCw, Sparkles, BarChart3, FileText, ChevronDown, Filter, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { StatsCard } from "@/components/stats-card";
import { TrackTable } from "@/components/track-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { TagManager } from "@/components/tag-manager";
import { PlaylistManager } from "@/components/playlist-manager";
import { TrackSidePanel } from "@/components/track-side-panel";
import { type PlaylistSnapshot, type Tag, type TrackedPlaylist } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

type FilterKey = 'hasIsrc' | 'noIsrc' | 'hasCredits' | 'noCredits' | 'hasPublisher' | 'noPublisher' | 'hasSongwriter' | 'noSongwriter';

export default function Dashboard() {
  const [selectedWeek, setSelectedWeek] = useState<string>("latest");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scoreRange, setScoreRange] = useState<number[]>([0, 10]);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<PlaylistSnapshot | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const { toast } = useToast();

  const toggleFilter = (filter: FilterKey) => {
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  };

  const { data: weeks, isLoading: weeksLoading } = useQuery<string[]>({
    queryKey: ["/api/weeks"],
  });

  const { data: tracks, isLoading: tracksLoading } = useQuery<PlaylistSnapshot[]>({
    queryKey: selectedTag !== "all" 
      ? ["/api/tracks", "tag", selectedTag]
      : ["/api/tracks", selectedWeek],
    queryFn: async ({ queryKey }) => {
      if (queryKey[1] === "tag") {
        const response = await fetch(`/api/tracks?tagId=${queryKey[2]}`);
        if (!response.ok) throw new Error("Failed to fetch tracks by tag");
        return response.json();
      } else {
        const response = await fetch(`/api/tracks?week=${queryKey[1]}`);
        if (!response.ok) throw new Error("Failed to fetch tracks");
        return response.json();
      }
    },
    enabled: !!selectedWeek || selectedTag !== "all",
  });

  const { data: playlists } = useQuery<string[]>({
    queryKey: ["/api/playlists"],
  });

  const { data: trackedPlaylists = [] } = useQuery<TrackedPlaylist[]>({
    queryKey: ["/api/tracked-playlists"],
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const { data: spotifyStatus, refetch: refetchSpotifyStatus } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/spotify/status"],
    refetchInterval: 3000, // Poll every 3s to check auth status
  });

  const fetchPlaylistsMutation = useMutation({
    mutationFn: async ({ mode = 'all', playlistId }: { mode?: string; playlistId?: string }) => {
      console.log("Starting fetch playlists mutation...", { mode, playlistId });
      const response = await apiRequest("POST", "/api/fetch-playlists", { mode, playlistId });
      const data = await response.json();
      console.log("Fetch playlists response:", data);
      return data;
    },
    onSuccess: (data: any) => {
      console.log("Fetch playlists success:", data);
      const totalSkipped = data.completenessResults?.reduce((sum: number, r: any) => sum + (r.skipped || 0), 0) || 0;
      toast({
        title: "Success!",
        description: `Fetched ${data.tracksAdded} new tracks from Spotify for week ${data.week}${totalSkipped > 0 ? ` (${totalSkipped} duplicates skipped)` : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onError: (error: any) => {
      console.error("Fetch playlists error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch playlists",
        variant: "destructive",
      });
    },
  });

  const enrichMetadataMutation = useMutation({
    mutationFn: async ({ mode = 'all', trackId, playlistName, limit = 50 }: { mode?: string; trackId?: string; playlistName?: string; limit?: number }) => {
      const response = await apiRequest("POST", "/api/enrich-metadata", { mode, trackId, playlistName, limit });
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "MusicBrainz Enrichment Complete!",
        description: `Enriched ${data.enrichedCount} of ${data.totalProcessed} tracks with publisher/songwriter data`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enrich metadata",
        variant: "destructive",
      });
    },
  });

  const enrichCreditsMutation = useMutation({
    mutationFn: async ({ mode = 'all', trackId, playlistName, limit = 10 }: { mode?: string; trackId?: string; playlistName?: string; limit?: number }) => {
      console.log("Starting credits enrichment mutation...", { mode, trackId, playlistName });
      const response = await apiRequest("POST", "/api/enrich-credits", { mode, trackId, playlistName, limit });
      const data = await response.json();
      console.log("Credits enrichment response:", data);
      return data;
    },
    onSuccess: (data: any) => {
      console.log("Credits enrichment success:", data);
      toast({
        title: "Spotify Credits Enrichment Complete!",
        description: `Enriched ${data.enrichedCount} of ${data.totalProcessed} tracks (${data.failedCount} failed)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: (error: any) => {
      console.error("Credits enrichment error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to enrich credits",
        variant: "destructive",
      });
    },
  });

  const filteredTracks = tracks?.filter((track) => {
    const matchesPlaylist = selectedPlaylist === "all" || track.playlistName === selectedPlaylist;
    const matchesSearch = 
      searchQuery === "" ||
      track.trackName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artistName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.label?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesScore = track.unsignedScore >= scoreRange[0] && track.unsignedScore <= scoreRange[1];
    
    // Advanced filters
    let matchesAdvancedFilters = true;
    if (activeFilters.length > 0) {
      const hasIsrc = !!track.isrc;
      const hasCredits = !!track.publisher || !!track.songwriter;
      const hasPublisher = !!track.publisher;
      const hasSongwriter = !!track.songwriter;
      
      const filterMatches = {
        hasIsrc,
        noIsrc: !hasIsrc,
        hasCredits,
        noCredits: !hasCredits,
        hasPublisher,
        noPublisher: !hasPublisher,
        hasSongwriter,
        noSongwriter: !hasSongwriter,
      };
      
      matchesAdvancedFilters = activeFilters.every(filter => filterMatches[filter]);
    }
    
    return matchesPlaylist && matchesSearch && matchesScore && matchesAdvancedFilters;
  }) || [];

  const highPotentialCount = tracks?.filter(t => t.unsignedScore >= 7).length || 0;
  const mediumPotentialCount = tracks?.filter(t => t.unsignedScore >= 4 && t.unsignedScore < 7).length || 0;
  const avgScore = tracks?.length 
    ? (tracks.reduce((sum, t) => sum + t.unsignedScore, 0) / tracks.length).toFixed(1)
    : "0.0";

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/export?week=${selectedWeek}&format=csv`, {
        method: "GET",
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pub-leads-${selectedWeek}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Music2 className="h-7 w-7 text-primary" data-testid="icon-logo" />
              <h1 className="text-xl font-bold" data-testid="text-app-title">AI Pub Feed</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span data-testid="text-current-week">
                  {weeksLoading ? "Loading..." : weeks?.[0] ? `Week of ${weeks[0]}` : "No data"}
                </span>
              </div>
              {!spotifyStatus?.authenticated ? (
                <Button
                  onClick={() => window.open("/api/spotify/auth", "_blank")}
                  variant="default"
                  size="default"
                  className="gap-2"
                  data-testid="button-authorize-spotify"
                >
                  <Music2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Authorize Spotify</span>
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      size="default"
                      className="gap-2"
                      disabled={fetchPlaylistsMutation.isPending}
                      data-testid="button-fetch-data"
                    >
                      <RefreshCw className={`h-4 w-4 ${fetchPlaylistsMutation.isPending ? "animate-spin" : ""}`} />
                      <span className="hidden sm:inline">
                        {fetchPlaylistsMutation.isPending ? "Fetching..." : "Fetch Data"}
                      </span>
                      {!fetchPlaylistsMutation.isPending && <ChevronDown className="h-3 w-3 ml-1" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Fetch Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => fetchPlaylistsMutation.mutate({ mode: 'all' })} data-testid="menu-fetch-all">
                      Fetch All Playlists
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fetchPlaylistsMutation.mutate({ mode: 'editorial' })} data-testid="menu-fetch-editorial">
                      Fetch Editorial Playlists Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fetchPlaylistsMutation.mutate({ mode: 'non-editorial' })} data-testid="menu-fetch-non-editorial">
                      Fetch Non-Editorial Playlists Only
                    </DropdownMenuItem>
                    {trackedPlaylists.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Fetch Specific Playlist</DropdownMenuLabel>
                        {trackedPlaylists.map((playlist) => (
                          <DropdownMenuItem 
                            key={playlist.id} 
                            onClick={() => fetchPlaylistsMutation.mutate({ mode: 'specific', playlistId: playlist.id })}
                            data-testid={`menu-fetch-playlist-${playlist.id}`}
                          >
                            {playlist.name}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="default"
                    className="gap-2"
                    disabled={enrichMetadataMutation.isPending || !tracks || tracks.length === 0}
                    data-testid="button-enrich-musicbrainz"
                  >
                    <Sparkles className={`h-4 w-4 ${enrichMetadataMutation.isPending ? "animate-pulse" : ""}`} />
                    <span className="hidden md:inline">
                      {enrichMetadataMutation.isPending ? "Enriching..." : "Enrich (MB)"}
                    </span>
                    {!enrichMetadataMutation.isPending && <ChevronDown className="h-3 w-3 ml-1" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>MusicBrainz Enrich Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => enrichMetadataMutation.mutate({ mode: 'all' })} data-testid="menu-enrich-mb-all">
                    Enrich All Unenriched Tracks
                  </DropdownMenuItem>
                  {playlists && playlists.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Enrich by Playlist</DropdownMenuLabel>
                      {playlists.map((playlist) => (
                        <DropdownMenuItem 
                          key={playlist} 
                          onClick={() => enrichMetadataMutation.mutate({ mode: 'playlist', playlistName: playlist })}
                          data-testid={`menu-enrich-mb-playlist-${playlist}`}
                        >
                          {playlist}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="default"
                    className="gap-2"
                    disabled={enrichCreditsMutation.isPending || !tracks || tracks.length === 0}
                    data-testid="button-enrich-credits"
                  >
                    <FileText className={`h-4 w-4 ${enrichCreditsMutation.isPending ? "animate-pulse" : ""}`} />
                    <span className="hidden md:inline">
                      {enrichCreditsMutation.isPending ? "Scraping..." : "Enrich (Credits)"}
                    </span>
                    {!enrichCreditsMutation.isPending && <ChevronDown className="h-3 w-3 ml-1" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Spotify Credits Enrich Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => enrichCreditsMutation.mutate({ mode: 'all' })} data-testid="menu-enrich-credits-all">
                    Enrich All Unenriched Tracks
                  </DropdownMenuItem>
                  {playlists && playlists.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Enrich by Playlist</DropdownMenuLabel>
                      {playlists.map((playlist) => (
                        <DropdownMenuItem 
                          key={playlist} 
                          onClick={() => enrichCreditsMutation.mutate({ mode: 'playlist', playlistName: playlist })}
                          data-testid={`menu-enrich-credits-playlist-${playlist}`}
                        >
                          {playlist}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={handleExport}
                variant="outline"
                size="default"
                className="gap-2"
                disabled={!tracks || tracks.length === 0}
                data-testid="button-export"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <PlaylistManager />
              <TagManager />
              <Button variant="outline" size="sm" className="gap-2" asChild data-testid="button-comparison">
                <Link href="/comparison">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden lg:inline">Compare</span>
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tracksLoading ? (
              <>
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </>
            ) : (
              <>
                <StatsCard
                  title="Total Tracks"
                  value={tracks?.length || 0}
                  icon={ListMusic}
                  testId="stat-total-tracks"
                />
                <StatsCard
                  title="High Potential"
                  value={highPotentialCount}
                  subtitle="Score 7-10"
                  icon={Target}
                  variant="success"
                  testId="stat-high-potential"
                />
                <StatsCard
                  title="Medium Potential"
                  value={mediumPotentialCount}
                  subtitle="Score 4-6"
                  icon={TrendingUp}
                  variant="warning"
                  testId="stat-medium-potential"
                />
                <StatsCard
                  title="Avg Score"
                  value={avgScore}
                  subtitle="Out of 10"
                  icon={Music2}
                  testId="stat-avg-score"
                />
              </>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
                <div className="w-full sm:w-48">
                  <Select value={selectedWeek} onValueChange={setSelectedWeek} disabled={weeksLoading}>
                    <SelectTrigger data-testid="select-week">
                      <SelectValue placeholder="Select week" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest" data-testid="option-week-latest">Latest Week</SelectItem>
                      {weeks?.map((week) => (
                        <SelectItem key={week} value={week} data-testid={`option-week-${week}`}>
                          {week}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-48">
                  <Select value={selectedPlaylist} onValueChange={setSelectedPlaylist}>
                    <SelectTrigger data-testid="select-playlist">
                      <SelectValue placeholder="All playlists" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="option-playlist-all">All Playlists</SelectItem>
                      {playlists?.map((playlist) => {
                        const trackedPlaylist = trackedPlaylists.find(p => p.name === playlist);
                        const totalTracks = trackedPlaylist?.totalTracks;
                        return (
                          <SelectItem key={playlist} value={playlist} data-testid={`option-playlist-${playlist}`}>
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="truncate">{playlist}</span>
                              {(totalTracks !== null && totalTracks !== undefined) && (
                                <Badge variant="secondary" className="ml-auto text-xs shrink-0">
                                  {totalTracks}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-48">
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger data-testid="select-tag">
                      <SelectValue placeholder="All tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="option-tag-all">All Tags</SelectItem>
                      {tags?.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id} data-testid={`option-tag-${tag.id}`}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Input
                  placeholder="Search tracks, artists, labels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64"
                  data-testid="input-search"
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-open-filters">
                    <Filter className="h-4 w-4" />
                    Completeness Filters
                    {activeFilters.length > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                        {activeFilters.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Filter by Completeness</h4>
                      {activeFilters.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto py-1 px-2 text-xs"
                          onClick={() => setActiveFilters([])}
                          data-testid="button-clear-filters"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">ISRC Code</div>
                        <div className="flex gap-2">
                          <Button
                            variant={activeFilters.includes('hasIsrc') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('hasIsrc')}
                            data-testid="filter-has-isrc"
                          >
                            Has ISRC
                          </Button>
                          <Button
                            variant={activeFilters.includes('noIsrc') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('noIsrc')}
                            data-testid="filter-no-isrc"
                          >
                            No ISRC
                          </Button>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Credits Data</div>
                        <div className="flex gap-2">
                          <Button
                            variant={activeFilters.includes('hasCredits') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('hasCredits')}
                            data-testid="filter-has-credits"
                          >
                            Has Credits
                          </Button>
                          <Button
                            variant={activeFilters.includes('noCredits') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('noCredits')}
                            data-testid="filter-no-credits"
                          >
                            No Credits
                          </Button>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Publisher Info</div>
                        <div className="flex gap-2">
                          <Button
                            variant={activeFilters.includes('hasPublisher') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('hasPublisher')}
                            data-testid="filter-has-publisher"
                          >
                            Has Publisher
                          </Button>
                          <Button
                            variant={activeFilters.includes('noPublisher') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('noPublisher')}
                            data-testid="filter-no-publisher"
                          >
                            No Publisher
                          </Button>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Songwriter Info</div>
                        <div className="flex gap-2">
                          <Button
                            variant={activeFilters.includes('hasSongwriter') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('hasSongwriter')}
                            data-testid="filter-has-songwriter"
                          >
                            Has Songwriter
                          </Button>
                          <Button
                            variant={activeFilters.includes('noSongwriter') ? "default" : "outline"}
                            size="sm"
                            className="flex-1"
                            onClick={() => toggleFilter('noSongwriter')}
                            data-testid="filter-no-songwriter"
                          >
                            No Songwriter
                          </Button>
                        </div>
                      </div>
                    </div>

                    {activeFilters.length > 0 && (
                      <div className="pt-2 text-xs text-muted-foreground">
                        Showing tracks matching all {activeFilters.length} active filter{activeFilters.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium whitespace-nowrap">Score: {scoreRange[0]}-{scoreRange[1]}</span>
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={scoreRange}
                  onValueChange={setScoreRange}
                  className="w-32"
                  data-testid="slider-score-range"
                />
              </div>
            </div>
          </div>

          <TrackTable 
            tracks={filteredTracks} 
            isLoading={tracksLoading}
            onEnrichMB={(trackId) => enrichMetadataMutation.mutate({ mode: 'track', trackId })}
            onEnrichCredits={(trackId) => enrichCreditsMutation.mutate({ mode: 'track', trackId })}
            onRowClick={(track) => {
              setSelectedTrack(track);
              setSidePanelOpen(true);
            }}
          />
        </div>
      </main>

      <TrackSidePanel
        track={selectedTrack}
        open={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        onEnrichMB={(trackId) => {
          enrichMetadataMutation.mutate({ mode: 'track', trackId });
          setSidePanelOpen(false);
        }}
        onEnrichCredits={(trackId) => {
          enrichCreditsMutation.mutate({ mode: 'track', trackId });
          setSidePanelOpen(false);
        }}
      />
    </div>
  );
}
