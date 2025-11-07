import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Music2, Download, Calendar, LayoutGrid, LayoutList, Kanban, BarChart3, RefreshCw, Sparkles, FileText, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UnifiedControlPanel } from "@/components/unified-control-panel";
import { TrackTable } from "@/components/track-table";
import { CardView } from "@/components/card-view";
import { KanbanView } from "@/components/kanban-view";
import { DetailsDrawer } from "@/components/details-drawer";
import { ThemeToggle } from "@/components/theme-toggle";
import { TagManager } from "@/components/tag-manager";
import { PlaylistManager } from "@/components/playlist-manager";
import { type PlaylistSnapshot, type Tag, type TrackedPlaylist } from "@shared/schema";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ViewMode = "table" | "card" | "kanban";

export default function Dashboard() {
  const [selectedWeek, setSelectedWeek] = useState<string>("latest");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 10]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<PlaylistSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const { toast } = useToast();

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  };

  const clearFilters = () => {
    setActiveFilters([]);
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
      
      const filterMatches: Record<string, boolean> = {
        "has-isrc": hasIsrc,
        "no-isrc": !hasIsrc,
        "has-credits": hasCredits,
        "no-credits": !hasCredits,
        "has-publisher": hasPublisher,
        "no-publisher": !hasPublisher,
        "has-songwriter": hasSongwriter,
        "no-songwriter": !hasSongwriter,
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
              {!spotifyStatus?.authenticated && (
                <Button
                  onClick={() => window.open("/api/spotify/auth", "_blank")}
                  variant="gradient"
                  size="default"
                  className="gap-2"
                  data-testid="button-authorize-spotify"
                >
                  <Music2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Authorize Spotify</span>
                </Button>
              )}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Unified Control Panel */}
          <UnifiedControlPanel
            totalTracks={tracks?.length || 0}
            highPotential={highPotentialCount}
            mediumPotential={mediumPotentialCount}
            avgScore={parseFloat(avgScore)}
            fetchDataButton={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="gradient"
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
                <DropdownMenuContent align="start" className="w-56">
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
            }
            enrichMBButton={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
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
                <DropdownMenuContent align="start" className="w-56">
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
            }
            enrichCreditsButton={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
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
                <DropdownMenuContent align="start" className="w-56">
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
            }
            exportButton={
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
            }
            playlistManagerButton={<PlaylistManager />}
            tagManagerButton={<TagManager />}
            compareButton={
              <Button variant="outline" size="default" className="gap-2" asChild data-testid="button-comparison">
                <Link href="/comparison">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden lg:inline">Compare</span>
                </Link>
              </Button>
            }
            weeks={weeks || []}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            playlists={playlists || []}
            selectedPlaylist={selectedPlaylist}
            onPlaylistChange={setSelectedPlaylist}
            tags={tags}
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            scoreRange={scoreRange}
            onScoreRangeChange={setScoreRange}
            activeFilters={activeFilters}
            onFilterToggle={toggleFilter}
            onClearFilters={clearFilters}
          />

          {/* View Switcher */}
          <div className="flex items-center justify-between glass-panel p-3 rounded-lg">
            <div className="flex gap-2">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="gap-2"
                data-testid="button-view-table"
              >
                <LayoutList className="h-4 w-4" />
                Table
              </Button>
              <Button
                variant={viewMode === "card" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("card")}
                className="gap-2"
                data-testid="button-view-card"
              >
                <LayoutGrid className="h-4 w-4" />
                Card
              </Button>
              <Button
                variant={viewMode === "kanban" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("kanban")}
                className="gap-2"
                data-testid="button-view-kanban"
              >
                <Kanban className="h-4 w-4" />
                Kanban
              </Button>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="text-results-count">
              {filteredTracks.length} {filteredTracks.length === 1 ? "result" : "results"}
            </div>
          </div>

          {/* View Content */}
          {viewMode === "table" && (
            <TrackTable 
              tracks={filteredTracks} 
              isLoading={tracksLoading}
              onEnrichMB={(trackId) => enrichMetadataMutation.mutate({ mode: 'track', trackId })}
              onEnrichCredits={(trackId) => enrichCreditsMutation.mutate({ mode: 'track', trackId })}
              onRowClick={(track) => {
                setSelectedTrack(track);
                setDrawerOpen(true);
              }}
            />
          )}

          {viewMode === "card" && (
            <CardView
              tracks={filteredTracks}
              isLoading={tracksLoading}
              onTrackClick={(track) => {
                setSelectedTrack(track);
                setDrawerOpen(true);
              }}
              onEnrichMB={(trackId) => enrichMetadataMutation.mutate({ mode: 'track', trackId })}
              onEnrichCredits={(trackId) => enrichCreditsMutation.mutate({ mode: 'track', trackId })}
            />
          )}

          {viewMode === "kanban" && (
            <KanbanView
              tracks={filteredTracks}
              isLoading={tracksLoading}
              onTrackClick={(track) => {
                setSelectedTrack(track);
                setDrawerOpen(true);
              }}
              onEnrichMB={(trackId) => enrichMetadataMutation.mutate({ mode: 'track', trackId })}
              onEnrichCredits={(trackId) => enrichCreditsMutation.mutate({ mode: 'track', trackId })}
            />
          )}
        </div>
      </main>

      <DetailsDrawer
        track={selectedTrack}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEnrichMB={(trackId) => {
          enrichMetadataMutation.mutate({ mode: 'track', trackId });
        }}
        onEnrichCredits={(trackId) => {
          enrichCreditsMutation.mutate({ mode: 'track', trackId });
        }}
      />
    </div>
  );
}
