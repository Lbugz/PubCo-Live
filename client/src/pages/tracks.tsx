import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, LayoutGrid, LayoutList, Kanban, BarChart3, RefreshCw, Sparkles, FileText, ChevronDown, Music2, Users, Music, Target, TrendingUp, Activity, Search, Filter, Loader2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useNotify } from "@/hooks/useNotify";
import { useWebSocket } from "@/hooks/use-websocket";
import { useMobile } from "@/hooks/use-mobile";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BulkActionsToolbar } from "@/components/bulk-actions-toolbar";
import { TrackTable } from "@/components/track-table";
import { CardView } from "@/components/card-view";
import { KanbanView } from "@/components/kanban-view";
import { DetailsDrawer } from "@/components/details-drawer";
import { TrackDetailDrawerV2 } from "@/components/track-detail-drawer-v2";
import { TagManager } from "@/components/tag-manager";
import { PlaylistManager } from "@/components/playlist-manager";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderControls, type ViewMode } from "@/components/layout/page-header-controls";
import { FilterBar } from "@/components/layout/filter-bar";
import { StickyHeaderContainer } from "@/components/layout/sticky-header-container";
import { type PlaylistSnapshot, type Tag, type TrackedPlaylist } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Tracks() {
  const [location] = useLocation();
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedTrack, setSelectedTrack] = useState<PlaylistSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [playlistManagerOpen, setPlaylistManagerOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [sortField, setSortField] = useState<string>("addedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [useDrawerV2, setUseDrawerV2] = useState(false);
  
  // Advanced filter state
  const [publisherStatus, setPublisherStatus] = useState<string>("all");
  const [labelStatus, setLabelStatus] = useState<string>("all");
  const [enrichmentStatus, setEnrichmentStatus] = useState<string>("all");
  const [creditsStatus, setCreditsStatus] = useState<string>("all");
  const [isrcStatus, setIsrcStatus] = useState<string>("all");
  const [spotifyStreamsRange, setSpotifyStreamsRange] = useState<string>("all");
  
  const notify = useNotify();
  const isMobile = useMobile(768);
  
  // Auto-switch to card view on mobile (from table or kanban)
  useEffect(() => {
    if (isMobile && viewMode !== "card") {
      setViewMode("card");
    }
  }, [isMobile, viewMode]);

  // WebSocket connection for real-time updates
  useWebSocket({
    onTrackEnriched: (data) => {
      console.log('Track enriched via WebSocket:', data);
      // Aggressively refetch tracks to update filter counts in real-time
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      queryClient.refetchQueries({ queryKey: ["/api/tracks"] });
    },
    onJobCompleted: (data) => {
      console.log('Job completed:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      queryClient.refetchQueries({ queryKey: ["/api/tracks"] });
    },
  });

  const clearAllFilters = useCallback(() => {
    setSelectedWeek("all");
    setSelectedPlaylist("all");
    setSearchQuery("");
    setPublisherStatus("all");
    setLabelStatus("all");
    setEnrichmentStatus("all");
    setCreditsStatus("all");
    setIsrcStatus("all");
    setSpotifyStreamsRange("all");
  }, []);

  const toggleTrackSelection = useCallback((trackId: string) => {
    setSelectedTrackIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTrackIds(new Set());
  }, []);

  // Handle playlist query parameter from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const playlistParam = params.get('playlist');
    if (playlistParam) {
      setSelectedPlaylist(playlistParam);
    }
  }, []); // Run only on mount to read initial URL params

  const { data: weeks, isLoading: weeksLoading } = useQuery<string[]>({
    queryKey: ["/api/weeks"],
  });

  const { data: tracks = [], isLoading: tracksLoading } = useQuery<PlaylistSnapshot[]>({
    queryKey: selectedPlaylist !== "all"
      ? ["/api/tracks", "playlist", selectedPlaylist, selectedWeek, sortField, sortDirection, publisherStatus, labelStatus, enrichmentStatus, creditsStatus, isrcStatus, spotifyStreamsRange]
      : ["/api/tracks", selectedWeek, sortField, sortDirection, publisherStatus, labelStatus, enrichmentStatus, creditsStatus, isrcStatus, spotifyStreamsRange],
    queryFn: async ({ queryKey }) => {
      const params = new URLSearchParams();
      params.append("sortField", sortField);
      params.append("sortDirection", sortDirection);
      
      // Add advanced filters
      if (publisherStatus !== "all") params.append("publisherStatus", publisherStatus);
      if (labelStatus !== "all") params.append("labelStatus", labelStatus);
      if (enrichmentStatus !== "all") params.append("enrichmentStatus", enrichmentStatus);
      if (creditsStatus !== "all") params.append("creditsStatus", creditsStatus);
      if (isrcStatus !== "all") params.append("isrcStatus", isrcStatus);
      if (spotifyStreamsRange !== "all") params.append("spotifyStreamsRange", spotifyStreamsRange);
      
      if (queryKey[1] === "playlist") {
        params.append("playlist", queryKey[2] as string);
        const response = await fetch(`/api/tracks?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch tracks by playlist");
        return response.json();
      } else {
        params.append("week", queryKey[1] as string);
        const response = await fetch(`/api/tracks?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch tracks");
        return response.json();
      }
    },
    enabled: !!selectedWeek || selectedPlaylist !== "all",
  });

  const { data: trackedPlaylists = [] } = useQuery<TrackedPlaylist[]>({
    queryKey: ["/api/tracked-playlists"],
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  // Handle selected track query parameter from URL (from contact links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedTrackId = params.get('selected');
    
    if (selectedTrackId && tracks && tracks.length > 0) {
      // Find the track by ID
      const track = tracks.find(t => t.id === selectedTrackId);
      
      if (track) {
        // Open the drawer with this track
        setSelectedTrack(track);
        setDrawerOpen(true);
        
        // Clear the query parameter from URL without triggering reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [tracks]); // Re-run when tracks data is loaded

  const enrichMutation = useMutation({
    mutationFn: async ({ trackId, trackIds }: { trackId?: string; trackIds?: string[] }) => {
      console.log("Starting Phase 2 credits enrichment:", { trackId, trackIds });
      
      // Determine which track IDs to enrich
      const idsToEnrich = trackIds || (trackId ? [trackId] : []);
      
      const response = await apiRequest("POST", "/api/enrich-credits", { 
        trackIds: idsToEnrich,
        limit: 50 
      });
      const data = await response.json();
      console.log("Phase 2 enrichment response:", data);
      return data;
    },
    onSuccess: (data: any) => {
      console.log("Phase 2 enrichment success:", data);
      const enrichedCount = data.tracksEnriched || 0;
      const processedCount = data.tracksProcessed || 0;
      
      notify.success(
        `Enriched ${enrichedCount}/${processedCount} tracks with Spotify credits data`,
        "Credits Enrichment Complete!"
      );
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: (error: any) => {
      console.error("Phase 2 enrichment error:", error);
      notify.error(
        error.message || "Failed to enrich track credits",
        "Error"
      );
    },
  });

  const enrichArtistsMutation = useMutation({
    mutationFn: async ({ limit = 50 }: { limit?: number }) => {
      const response = await apiRequest("POST", "/api/enrich-artists", { limit });
      return await response.json();
    },
    onSuccess: (data: any) => {
      notify.success(
        data.message,
        "Artist Enrichment Complete!"
      );
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: (error: any) => {
      notify.error(
        error.message || "Failed to enrich artists",
        "Error"
      );
    },
  });

  const enrichPhaseMutation = useMutation({
    mutationFn: async ({ trackId, phase }: { trackId: string; phase: number }) => {
      console.log(`Starting Phase ${phase} enrichment for track ${trackId}`);
      
      const response = await apiRequest("POST", "/api/enrich-phase", { 
        trackId,
        phase
      });
      const data = await response.json();
      console.log(`Phase ${phase} enrichment response:`, data);
      return data;
    },
    onSuccess: (data: any, variables) => {
      notify.success(
        `Phase ${variables.phase} enrichment completed`,
        "Success"
      );
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks", variables.trackId, "full"] });
    },
    onError: (error: any, variables) => {
      notify.error(
        error.message || `Phase ${variables.phase} enrichment failed`,
        "Error"
      );
    },
  });

  // Memoize filtered tracks to avoid recomputation on every render
  // Note: Search is still client-side (filters current page only)
  const filteredTracks = useMemo(() => {
    const filtered = tracks?.filter((track) => {
      const matchesSearch = 
        debouncedSearchQuery === "" ||
        track.trackName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        track.artistName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        track.label?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      
      return matchesSearch;
    }) || [];

    return filtered;
  }, [tracks, debouncedSearchQuery]);

  // Sorting is now server-side - no need to sort client-side
  // Just use filteredTracks directly (they're already sorted from backend)
  const sortedTracks = filteredTracks;

  // Handle sorting - updates state which triggers new API call with server-side sort
  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      // New field - start with descending for streams, ascending for text
      setSortField(field);
      setSortDirection(field === "spotifyStreams" ? "desc" : "asc");
    }
  }, [sortField]);

  // toggleSelectAll depends on filteredTracks, so define it after the useMemo
  const toggleSelectAll = useCallback(() => {
    setSelectedTrackIds(prev => {
      const allFilteredSelected = sortedTracks.length > 0 && sortedTracks.every(t => prev.has(t.id));
      
      const newSet = new Set(prev);
      if (allFilteredSelected) {
        // All filtered tracks selected - deselect them (keep other selections)
        sortedTracks.forEach(t => newSet.delete(t.id));
      } else {
        // Not all filtered tracks selected - select all filtered tracks (keep existing selections)
        sortedTracks.forEach(t => newSet.add(t.id));
      }
      return newSet;
    });
  }, [sortedTracks]);


  const handleExport = useCallback(async () => {
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
  }, [selectedWeek]);

  const handleOpenPlaylistManager = useCallback(() => {
    setPlaylistManagerOpen(true);
  }, []);

  const handleOpenTagManager = useCallback(() => {
    setTagManagerOpen(true);
  }, []);

  const handleBulkEnrich = useCallback((mode: "selected" | "filtered") => {
    const trackIds = mode === "selected" 
      ? Array.from(selectedTrackIds)
      : filteredTracks.map(t => t.id);
    
    // Call Phase 2 enrichment with all track IDs at once
    enrichMutation.mutate({ trackIds });
    
    notify.info(
      `Started Phase 2 credits enrichment for ${trackIds.length} ${mode === "selected" ? "selected" : "filtered"} tracks`,
      "Enriching tracks"
    );
  }, [selectedTrackIds, filteredTracks, enrichMutation, notify]);

  const handleBulkExport = useCallback(async (mode: "selected" | "filtered") => {
    try {
      const exportTracks = mode === "selected"
        ? tracks?.filter(t => selectedTrackIds.has(t.id)) || []
        : filteredTracks;
      
      const headers = [
        "Track Name", "Artist", "Album", "ISRC", "Playlist", "Label", 
        "Publisher", "Songwriter", "Composer", "Producer",
        "Instagram", "Twitter", "TikTok", "Email", "Notes"
      ];
      
      const rows = exportTracks.map(track => [
        track.trackName,
        track.artistName,
        "",
        track.isrc || "",
        track.playlistName,
        track.label || "",
        track.publisher || "",
        track.songwriter || "",
        "",
        "",
        track.instagram || "",
        track.twitter || "",
        track.tiktok || "",
        track.email || "",
        track.contactNotes || ""
      ]);
      
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mode === "selected" ? "selected" : "filtered"}-pub-leads-${selectedWeek}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      notify.success(
        `Exported ${exportTracks.length} ${mode === "selected" ? "selected" : "filtered"} tracks`,
        "Export successful"
      );
    } catch (error) {
      console.error("Export failed:", error);
      notify.error(
        "Failed to export tracks",
        "Export failed"
      );
    }
  }, [tracks, selectedTrackIds, filteredTracks, selectedWeek, notify]);

  const handleBulkTag = useCallback((mode: "selected" | "filtered") => {
    const count = mode === "selected" ? selectedTrackIds.size : filteredTracks.length;
    notify.info(
      `Bulk tagging ${count} ${mode === "selected" ? "selected" : "filtered"} tracks coming soon`,
      "Bulk tagging"
    );
  }, [selectedTrackIds, filteredTracks, notify]);

  const handleEnrichTrack = useCallback((trackId: string) => {
    enrichMutation.mutate({ trackId });
  }, [enrichMutation]);

  const enrichArtistsButton = useMemo(() => (
    <Button
      onClick={() => enrichArtistsMutation.mutate({ limit: 50 })}
      variant="outline"
      size="default"
      className="gap-2"
      disabled={enrichArtistsMutation.isPending || !tracks || tracks.length === 0}
      data-testid="button-enrich-artists"
    >
      <Users className={`h-4 w-4 ${enrichArtistsMutation.isPending ? "animate-pulse" : ""}`} />
      <span className="hidden md:inline">
        {enrichArtistsMutation.isPending ? "Enriching Data..." : "Enrich Data"}
      </span>
    </Button>
  ), [enrichArtistsMutation.isPending, tracks]);

  const exportButton = useMemo(() => (
    <Button
      onClick={handleExport}
      variant="gradient"
      size="default"
      className="gap-2"
      disabled={!tracks || tracks.length === 0}
      data-testid="button-export"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Export</span>
    </Button>
  ), [tracks, handleExport]);

  const compareButton = useMemo(() => (
    <Button variant="outline" size="default" className="gap-2" asChild data-testid="button-comparison">
      <Link href="/comparison">
        <BarChart3 className="h-4 w-4" />
        <span className="hidden lg:inline">Compare</span>
      </Link>
    </Button>
  ), []);

  return (
    <div className="min-h-screen bg-background">
      <PageContainer>
        <div className="space-y-6 fade-in">
          {/* Sticky Header: Filters */}
          <StickyHeaderContainer className="pb-4 border-b">
          {/* Filters Row */}
          <FilterBar>
            <FilterBar.FiltersGroup>
              {/* Search Bar */}
              <FilterBar.Search
                placeholder="Search tracks, artists, labels..."
                value={searchQuery}
                onChange={setSearchQuery}
                testId="input-search"
              />
            </FilterBar.FiltersGroup>

            <FilterBar.Actions>
              {/* Advanced Filters */}
              <FilterBar.AdvancedFilters testId="button-advanced-filters">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Date Range</label>
                    <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                      <SelectTrigger className="w-full" data-testid="select-week">
                        <SelectValue placeholder="All Dates" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Dates</SelectItem>
                        {weeks?.map((week) => (
                          <SelectItem key={week} value={week}>
                            {week}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Playlist</label>
                    <Select value={selectedPlaylist} onValueChange={setSelectedPlaylist}>
                      <SelectTrigger className="w-full" data-testid="select-playlist">
                        <SelectValue placeholder="All Playlists" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Playlists</SelectItem>
                        {trackedPlaylists.map((playlist) => (
                          <SelectItem key={playlist.playlistId} value={playlist.playlistId}>
                            {playlist.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Publisher Status</label>
                    <Select value={publisherStatus} onValueChange={setPublisherStatus}>
                      <SelectTrigger className="w-full" data-testid="select-publisher-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="has_publisher">Has Publisher</SelectItem>
                        <SelectItem value="no_publisher">No Publisher</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Label Status</label>
                    <Select value={labelStatus} onValueChange={setLabelStatus}>
                      <SelectTrigger className="w-full" data-testid="select-label-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="has_label">Has Label</SelectItem>
                        <SelectItem value="no_label">No Label</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Enrichment Status</label>
                    <Select value={enrichmentStatus} onValueChange={setEnrichmentStatus}>
                      <SelectTrigger className="w-full" data-testid="select-enrichment-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="fully_enriched">Fully Enriched</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Credits Status</label>
                    <Select value={creditsStatus} onValueChange={setCreditsStatus}>
                      <SelectTrigger className="w-full" data-testid="select-credits-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="has_credits">Has Credits</SelectItem>
                        <SelectItem value="needs_credits">Needs Credits</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">ISRC Status</label>
                    <Select value={isrcStatus} onValueChange={setIsrcStatus}>
                      <SelectTrigger className="w-full" data-testid="select-isrc-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="has_isrc">Has ISRC</SelectItem>
                        <SelectItem value="no_isrc">No ISRC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Spotify Streams</label>
                    <Select value={spotifyStreamsRange} onValueChange={setSpotifyStreamsRange}>
                      <SelectTrigger className="w-full" data-testid="select-spotify-streams">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="0-100k">0 - 100K</SelectItem>
                        <SelectItem value="100k-1m">100K - 1M</SelectItem>
                        <SelectItem value="1m-10m">1M - 10M</SelectItem>
                        <SelectItem value="10m+">10M+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(selectedWeek !== "all" || 
                    selectedPlaylist !== "all" || 
                    publisherStatus !== "all" || 
                    labelStatus !== "all" || 
                    enrichmentStatus !== "all" || 
                    creditsStatus !== "all" || 
                    isrcStatus !== "all" || 
                    spotifyStreamsRange !== "all") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAllFilters}
                      className="w-full gap-2"
                      data-testid="button-clear-filters"
                    >
                      <X className="h-4 w-4" />
                      Clear Filters
                    </Button>
                  )}
                </div>
              </FilterBar.AdvancedFilters>
            </FilterBar.Actions>

            <FilterBar.Actions>
              <Button
                onClick={() => setUseDrawerV2(!useDrawerV2)}
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-toggle-drawer-version"
                title={`Switch to ${useDrawerV2 ? 'V1' : 'V2'} Drawer`}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Drawer {useDrawerV2 ? 'V2' : 'V1'}
                </span>
              </Button>
              <Button
                onClick={() => enrichArtistsMutation.mutate({ limit: 50 })}
                variant="gradient"
                size="sm"
                className="gap-2"
                disabled={enrichArtistsMutation.isPending || !tracks || tracks.length === 0}
                data-testid="button-enrich-artists"
              >
                <Users className={`h-4 w-4 ${enrichArtistsMutation.isPending ? "animate-pulse" : ""}`} />
                <span className="hidden sm:inline">
                  {enrichArtistsMutation.isPending ? "Enriching..." : "Enrich Data"}
                </span>
              </Button>
            </FilterBar.Actions>
          </FilterBar>
          </StickyHeaderContainer>

          {/* View Switcher */}
          <PageHeaderControls
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            availableViews={["table", "card", "kanban"]}
            count={filteredTracks.length}
            countLabel={filteredTracks.length === 1 ? "track" : "tracks"}
            className="slide-in-right"
          />

          {/* Bulk Actions Toolbar */}
          <BulkActionsToolbar
            selectedCount={selectedTrackIds.size}
            totalFilteredCount={filteredTracks.length}
            onEnrich={handleBulkEnrich}
            onExport={handleBulkExport}
            onTag={handleBulkTag}
            onClearSelection={clearSelection}
            isEnriching={enrichMutation.isPending}
          />

          {/* View Content */}
          {viewMode === "table" && (
            <TrackTable 
              tracks={sortedTracks} 
              isLoading={tracksLoading}
              selectedTrackIds={selectedTrackIds}
              onToggleSelection={toggleTrackSelection}
              onToggleSelectAll={toggleSelectAll}
              onEnrich={handleEnrichTrack}
              onRowClick={(track) => {
                setSelectedTrack(track);
                setDrawerOpen(true);
              }}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          )}

          {viewMode === "card" && (
            <CardView
              tracks={sortedTracks}
              isLoading={tracksLoading}
              selectedTrackIds={selectedTrackIds}
              onToggleSelection={toggleTrackSelection}
              onToggleSelectAll={toggleSelectAll}
              onTrackClick={(track) => {
                setSelectedTrack(track);
                setDrawerOpen(true);
              }}
              onEnrich={handleEnrichTrack}
            />
          )}

          {viewMode === "kanban" && (
            <KanbanView
              tracks={sortedTracks}
              selectedTrackIds={selectedTrackIds}
              onToggleSelection={toggleTrackSelection}
              onToggleSelectAll={toggleSelectAll}
              isLoading={tracksLoading}
              onTrackClick={(track) => {
                setSelectedTrack(track);
                setDrawerOpen(true);
              }}
              onEnrich={handleEnrichTrack}
            />
          )}

        </div>
      </PageContainer>

      {useDrawerV2 ? (
        <TrackDetailDrawerV2
          track={selectedTrack}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onEnrich={handleEnrichTrack}
          onEnrichPhase={(trackId: string, phase: number) => {
            console.log("[Tracks] onEnrichPhase called (V2)", { trackId, phase });
            return enrichPhaseMutation.mutateAsync({ trackId, phase });
          }}
          isEnrichingPhase={enrichPhaseMutation.isPending}
        />
      ) : (
        <DetailsDrawer
          track={selectedTrack}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onEnrich={handleEnrichTrack}
          onEnrichPhase={(trackId: string, phase: number) => {
            console.log("[Tracks] onEnrichPhase called (V1)", { trackId, phase });
            return enrichPhaseMutation.mutateAsync({ trackId, phase });
          }}
          isEnrichingPhase={enrichPhaseMutation.isPending}
        />
      )}
    </div>
  );
}
