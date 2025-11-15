import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, LayoutGrid, LayoutList, Kanban, BarChart3, RefreshCw, Sparkles, FileText, ChevronDown, Music2, Users, Music, Target, TrendingUp, Activity, Search, Filter, Loader2, X, Eye, EyeOff } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { useMobile } from "@/hooks/use-mobile";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { StatsCard } from "@/components/stats-card";
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
import { TagManager } from "@/components/tag-manager";
import { PlaylistManager } from "@/components/playlist-manager";
import { PageContainer } from "@/components/layout/page-container";
import { ActivityPanel, type EnrichmentJob } from "@/components/activity-panel";
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
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

type ViewMode = "table" | "card" | "kanban";

const filterOptions = [
  { id: "has-isrc", label: "Has ISRC", section: "ISRC Code" },
  { id: "no-isrc", label: "No ISRC", section: "ISRC Code" },
  { id: "has-credits", label: "Has Credits", section: "Credits Data" },
  { id: "no-credits", label: "No Credits", section: "Credits Data" },
  { id: "has-publisher", label: "Has Publisher", section: "Publisher Info" },
  { id: "no-publisher", label: "No Publisher", section: "Publisher Info" },
  { id: "has-songwriter", label: "Has Songwriter", section: "Songwriter Info" },
  { id: "no-songwriter", label: "No Songwriter", section: "Songwriter Info" },
  { id: "has-email", label: "Has Contact Email", section: "Contact Info" },
  { id: "no-email", label: "No Contact Email", section: "Contact Info" },
];

export default function Dashboard() {
  const [location] = useLocation();
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 10]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<PlaylistSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [playlistManagerOpen, setPlaylistManagerOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [recentEnrichments, setRecentEnrichments] = useState<Array<{ trackName: string; artistName: string; timestamp: number }>>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState<{ message: string; progress?: number } | null>(null);
  const [activeJobs, setActiveJobs] = useState<EnrichmentJob[]>([]);
  const [showMetrics, setShowMetrics] = useState(() => {
    const stored = localStorage.getItem('tracksMetricsVisible');
    return stored !== null ? stored === 'true' : true;
  });
  const { toast} = useToast();
  const isMobile = useMobile(768);
  
  // Persist metrics visibility to localStorage
  useEffect(() => {
    localStorage.setItem('tracksMetricsVisible', showMetrics.toString());
  }, [showMetrics]);
  
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
      // Invalidate tracks query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      
      // Add to recent enrichments (no toast needed - will be shown in Activity Panel)
      setRecentEnrichments(prev => [
        { trackName: data.trackName || '', artistName: data.artistName || '', timestamp: Date.now() },
        ...prev.slice(0, 4) // Keep last 5 enrichments
      ]);
    },
    onEnrichmentProgress: (data) => {
      console.log('Enrichment progress:', data);
      setEnrichmentProgress({
        message: data.message || 'Processing...',
        progress: data.enrichedCount && data.totalCount 
          ? Math.round((data.enrichedCount / data.totalCount) * 100)
          : undefined
      });
      // Update active job progress
      if (data.jobId) {
        setActiveJobs(prev => prev.map(job => 
          job.jobId === data.jobId 
            ? { ...job, enrichedCount: data.enrichedCount || 0 }
            : job
        ));
      }
    },
    onJobStarted: (data) => {
      console.log('Job started:', data);
      setActiveJobs(prev => [...prev, { 
        jobId: data.jobId || '', 
        playlistName: data.playlistName,
        trackCount: data.trackCount || 0, 
        enrichedCount: 0,
        phase: 1,
        status: 'running',
        startTime: Date.now(),
      }]);
      toast({
        title: "Enrichment started",
        description: `${data.trackCount} tracks · All phases queued`,
        variant: "info",
      });
    },
    onJobCompleted: (data) => {
      console.log('Job completed:', data);
      setActiveJobs(prev => prev.map(job => 
        job.jobId === data.jobId
          ? { ...job, status: data.success ? 'success' : 'error', enrichedCount: data.tracksEnriched || job.trackCount }
          : job
      ));
      setEnrichmentProgress(null);
      toast({
        title: data.success ? "Enrichment complete" : "Enrichment completed with errors",
        description: `${data.tracksEnriched} tracks enriched${data.errors ? ` · ${data.errors} errors` : ''}`,
        variant: data.success ? "success" : "warning",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onJobFailed: (data) => {
      console.log('Job failed:', data);
      setActiveJobs(prev => prev.map(job => 
        job.jobId === data.jobId
          ? { ...job, status: 'error', errorMessage: data.error }
          : job
      ));
      setEnrichmentProgress(null);
      toast({
        title: "Enrichment failed",
        description: data.error || "Unknown error occurred",
        variant: "destructive",
      });
    },
    onPhaseStarted: (data) => {
      console.log('Phase started:', data);
      setActiveJobs(prev => prev.map(job => 
        job.jobId === data.jobId ? { ...job, phase: data.phase || 1 } : job
      ));
    },
    onMessage: (message) => {
      // Handle metric_update events from WebSocket
      if (message.type === 'metric_update') {
        console.log('Metrics updated via WebSocket');
        // Invalidate metrics queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: ["/api/metrics/tracks"] });
      }
    },
  });

  // Auto-clear enrichment notifications after 10 seconds
  useEffect(() => {
    if (recentEnrichments.length === 0) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      setRecentEnrichments(prev => 
        prev.filter(item => now - item.timestamp < 10000)
      );
    }, 1000);
    
    return () => clearInterval(timer);
  }, [recentEnrichments.length]);

  const toggleFilter = useCallback((filter: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters([]);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedWeek("all");
    setSelectedPlaylist("all");
    setSelectedTag("all");
    setSearchQuery("");
    setScoreRange([0, 10]);
    setActiveFilters([]);
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

  const { data: tracksData, isLoading: tracksLoading } = useQuery<{ tracks: PlaylistSnapshot[]; total: number; hasMore: boolean } | PlaylistSnapshot[]>({
    queryKey: selectedTag !== "all" 
      ? ["/api/tracks", "tag", selectedTag]
      : selectedPlaylist !== "all"
      ? ["/api/tracks", "playlist", selectedPlaylist, selectedWeek]
      : ["/api/tracks", selectedWeek],
    queryFn: async ({ queryKey }) => {
      if (queryKey[1] === "tag") {
        const response = await fetch(`/api/tracks?tagId=${queryKey[2]}`);
        if (!response.ok) throw new Error("Failed to fetch tracks by tag");
        return response.json();
      } else if (queryKey[1] === "playlist") {
        const response = await fetch(`/api/tracks?playlist=${queryKey[2]}`);
        if (!response.ok) throw new Error("Failed to fetch tracks by playlist");
        return response.json();
      } else {
        const response = await fetch(`/api/tracks?week=${queryKey[1]}`);
        if (!response.ok) throw new Error("Failed to fetch tracks");
        return response.json();
      }
    },
    enabled: !!selectedWeek || selectedTag !== "all" || selectedPlaylist !== "all",
  });

  // Extract tracks array from paginated response (supports both old and new format)
  const tracks = useMemo(() => {
    if (!tracksData) return [];
    if (Array.isArray(tracksData)) return tracksData; // Old format
    return tracksData.tracks; // New paginated format
  }, [tracksData]);

  const { data: trackedPlaylists = [] } = useQuery<TrackedPlaylist[]>({
    queryKey: ["/api/tracked-playlists"],
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  // Fetch metrics with weekly trends
  const { data: trackMetrics } = useQuery<{
    dealReady: number;
    avgScore: number;
    enrichedPercent: number;
    changeDealReady: number;
    changeAvgScore: number;
    changeEnriched: number;
  }>({
    queryKey: ["/api/metrics/tracks"],
    staleTime: 60000, // 60 seconds - aligned with backend cache TTL
  });

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
      
      toast({
        title: "Credits Enrichment Complete!",
        description: `Enriched ${enrichedCount}/${processedCount} tracks with Spotify credits data`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: (error: any) => {
      console.error("Phase 2 enrichment error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to enrich track credits",
        variant: "destructive",
      });
    },
  });

  const enrichArtistsMutation = useMutation({
    mutationFn: async ({ limit = 50 }: { limit?: number }) => {
      const response = await apiRequest("POST", "/api/enrich-artists", { limit });
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Artist Enrichment Complete!",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to enrich artists",
        variant: "destructive",
      });
    },
  });

  // Memoize filtered tracks and stats to avoid recomputation on every render
  const { filteredTracks, highPotentialCount, mediumPotentialCount, avgScore } = useMemo(() => {
    const filtered = tracks?.filter((track) => {
      const matchesSearch = 
        debouncedSearchQuery === "" ||
        track.trackName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        track.artistName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        track.label?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      const matchesScore = track.unsignedScore >= scoreRange[0] && track.unsignedScore <= scoreRange[1];
      
      // Advanced filters
      let matchesAdvancedFilters = true;
      if (activeFilters.length > 0) {
        const hasIsrc = !!track.isrc;
        const hasCredits = !!track.publisher || !!track.songwriter;
        const hasPublisher = !!track.publisher;
        const hasSongwriter = !!track.songwriter;
        const hasEmail = !!track.email;
        
        const filterMatches: Record<string, boolean> = {
          "has-isrc": hasIsrc,
          "no-isrc": !hasIsrc,
          "has-credits": hasCredits,
          "no-credits": !hasCredits,
          "has-publisher": hasPublisher,
          "no-publisher": !hasPublisher,
          "has-songwriter": hasSongwriter,
          "no-songwriter": !hasSongwriter,
          "has-email": hasEmail,
          "no-email": !hasEmail,
        };
        
        matchesAdvancedFilters = activeFilters.every(filter => filterMatches[filter]);
      }
      
      return matchesSearch && matchesScore && matchesAdvancedFilters;
    }) || [];

    // Calculate stats based on filtered tracks in a single pass
    const highPotential = filtered.filter(t => t.unsignedScore >= 7).length;
    const mediumPotential = filtered.filter(t => t.unsignedScore >= 4 && t.unsignedScore < 7).length;
    const average = filtered.length 
      ? (filtered.reduce((sum, t) => sum + t.unsignedScore, 0) / filtered.length)
      : 0;

    return {
      filteredTracks: filtered,
      highPotentialCount: highPotential,
      mediumPotentialCount: mediumPotential,
      avgScore: average,
    };
  }, [tracks, debouncedSearchQuery, scoreRange, activeFilters]);

  // toggleSelectAll depends on filteredTracks, so define it after the useMemo
  const toggleSelectAll = useCallback(() => {
    setSelectedTrackIds(prev => {
      const allFilteredSelected = filteredTracks.length > 0 && filteredTracks.every(t => prev.has(t.id));
      
      const newSet = new Set(prev);
      if (allFilteredSelected) {
        // All filtered tracks selected - deselect them (keep other selections)
        filteredTracks.forEach(t => newSet.delete(t.id));
      } else {
        // Not all filtered tracks selected - select all filtered tracks (keep existing selections)
        filteredTracks.forEach(t => newSet.add(t.id));
      }
      return newSet;
    });
  }, [filteredTracks]);

  // Check if any filter is active
  const hasActiveFilters = 
    selectedWeek !== "all" || 
    selectedPlaylist !== "all" || 
    selectedTag !== "all" || 
    searchQuery !== "" || 
    activeFilters.length > 0 ||
    (scoreRange[0] !== 0 || scoreRange[1] !== 10);

  const filterSections = filterOptions.reduce((acc, filter) => {
    if (!acc[filter.section]) acc[filter.section] = [];
    acc[filter.section].push(filter);
    return acc;
  }, {} as Record<string, typeof filterOptions>);

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
    
    toast({
      title: "Enriching tracks",
      description: `Started Phase 2 credits enrichment for ${trackIds.length} ${mode === "selected" ? "selected" : "filtered"} tracks`,
    });
  }, [selectedTrackIds, filteredTracks, enrichMutation, toast]);

  const handleBulkExport = useCallback(async (mode: "selected" | "filtered") => {
    try {
      const exportTracks = mode === "selected"
        ? tracks?.filter(t => selectedTrackIds.has(t.id)) || []
        : filteredTracks;
      
      const headers = [
        "Track Name", "Artist", "Album", "ISRC", "Playlist", "Label", 
        "Publisher", "Songwriter", "Composer", "Producer", "Score",
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
        track.unsignedScore.toString(),
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
      
      toast({
        title: "Export successful",
        description: `Exported ${exportTracks.length} ${mode === "selected" ? "selected" : "filtered"} tracks`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export failed",
        description: "Failed to export tracks",
        variant: "destructive",
      });
    }
  }, [tracks, selectedTrackIds, filteredTracks, selectedWeek, toast]);

  const handleBulkTag = useCallback((mode: "selected" | "filtered") => {
    const count = mode === "selected" ? selectedTrackIds.size : filteredTracks.length;
    toast({
      title: "Bulk tagging",
      description: `Bulk tagging ${count} ${mode === "selected" ? "selected" : "filtered"} tracks coming soon`,
    });
  }, [selectedTrackIds, filteredTracks, toast]);

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
      {/* Persistent Active Jobs Indicator in Header */}
      {activeJobs.length > 0 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-2xl w-full px-4">
          <Card className="glass-panel backdrop-blur-xl border-primary/20 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {activeJobs.length} {activeJobs.length === 1 ? 'Job' : 'Jobs'} Active
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Processing {activeJobs.reduce((sum, job) => sum + job.trackCount, 0)} tracks • Phase {Math.max(...activeJobs.map(j => j.phase))}/5
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveJobs([])}
                  data-testid="button-dismiss-active-jobs"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Enrichment Progress Notification */}
      {enrichmentProgress && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <Card className="glass-panel backdrop-blur-xl border-primary/20 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <Loader2 className="h-5 w-5 animate-spin text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">{enrichmentProgress.message}</p>
                    {enrichmentProgress.progress !== undefined && (
                      <div className="space-y-1">
                        <Progress value={enrichmentProgress.progress} className="h-2" />
                        <p className="text-xs text-muted-foreground">{enrichmentProgress.progress}% complete</p>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEnrichmentProgress(null)}
                  data-testid="button-dismiss-enrichment-progress"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Live Enrichment Indicator */}
      {recentEnrichments.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
          {recentEnrichments.map((enrichment, idx) => (
            <div
              key={enrichment.timestamp}
              className="bg-card border border-border rounded-md p-3 shadow-lg animate-in slide-in-from-right"
              style={{
                animationDelay: `${idx * 50}ms`,
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {enrichment.trackName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {enrichment.artistName}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PageContainer>
        <div className="space-y-6 fade-in">
          {/* Header with Enrich Data Button */}
          <div className="flex items-center justify-end">
            <Button
              onClick={() => enrichArtistsMutation.mutate({ limit: 50 })}
              variant="gradient"
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
          </div>

          {/* Enhanced Stats Cards with Trends and Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">TOP METRICS</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMetrics(!showMetrics)}
                data-testid="button-toggle-track-metrics"
                className="h-8 w-8"
              >
                {showMetrics ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Collapsible open={showMetrics}>
              <CollapsibleContent>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <StatsCard
                    title="Deal-Ready Tracks"
                    value={trackMetrics?.dealReady?.toLocaleString() || "0"}
                    icon={Target}
                    variant="green"
                    tooltip="Tracks with contact info (email) and high unsigned score (7+). Click to filter the table below."
                    change={trackMetrics?.changeDealReady}
                    onClick={() => {
                      setActiveFilters(['has-email']);
                      setScoreRange([7, 10]);
                      toast({
                        title: "Filtered to deal-ready tracks",
                        description: "Showing tracks with score 7+ and contact email",
                      });
                    }}
                    testId="stats-deal-ready"
                  />
                  <StatsCard
                    title="Avg Unsigned Score"
                    value={trackMetrics?.avgScore?.toFixed(1) || "0.0"}
                    icon={Activity}
                    variant="default"
                    tooltip="Average unsigned score across all tracks in the current week"
                    change={trackMetrics?.changeAvgScore}
                    testId="stats-avg-score"
                  />
                  <StatsCard
                    title="Enriched Tracks"
                    value={`${trackMetrics?.enrichedPercent?.toFixed(0) || "0"}%`}
                    icon={Sparkles}
                    variant="blue"
                    tooltip="Percentage of tracks that have been enriched with songwriter/publisher metadata"
                    change={trackMetrics?.changeEnriched}
                    testId="stats-enriched"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Filters Row */}
          <Card className="glass-panel backdrop-blur-xl border border-primary/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3">
                {/* Week Filter */}
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger className="flex-1 md:w-[160px]" data-testid="select-week">
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

                {/* Playlist Filter */}
                <Select value={selectedPlaylist} onValueChange={setSelectedPlaylist}>
                  <SelectTrigger className="flex-1 md:w-[160px]" data-testid="select-playlist">
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

                {/* Tag Filter */}
                <Select value={selectedTag} onValueChange={setSelectedTag}>
                  <SelectTrigger className="flex-1 md:w-[160px]" data-testid="select-tag">
                    <SelectValue placeholder="All Tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Search Bar */}
                <div className="relative flex-1 md:min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search tracks, artists, labels..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>

                {/* Completeness Filters Popover */}
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="default"
                      className="gap-2"
                      data-testid="button-completeness-filters"
                    >
                      <Filter className="h-4 w-4" />
                      Completeness Filters
                      {activeFilters.length > 0 && (
                        <Badge variant="default" className="ml-1 px-1.5 py-0">
                          {activeFilters.length}
                        </Badge>
                      )}
                      <ChevronDown className={`h-3 w-3 ${filtersOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 glass-panel" align="end">
                    <div className="space-y-4">
                      {/* Score Range Filter */}
                      <div>
                        <h4 className="text-sm font-medium mb-3">Score Range</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium whitespace-nowrap">
                            {scoreRange[0]} - {scoreRange[1]}
                          </span>
                          <Slider
                            min={0}
                            max={10}
                            step={1}
                            value={scoreRange}
                            onValueChange={(value) => setScoreRange(value as [number, number])}
                            className="flex-1"
                            data-testid="slider-score-range"
                          />
                        </div>
                      </div>

                      <div className="border-t pt-3" />

                      {/* Data Completeness Filters */}
                      {Object.entries(filterSections).map(([section, filters]) => (
                        <div key={section}>
                          <h4 className="text-sm font-medium mb-2">{section}</h4>
                          <div className="flex flex-wrap gap-2">
                            {filters.map((filter) => (
                              <Button
                                key={filter.id}
                                variant={activeFilters.includes(filter.id) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleFilter(filter.id)}
                                className="text-xs"
                                data-testid={`filter-${filter.id}`}
                              >
                                {filter.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="border-t pt-3 flex justify-between">
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          Clear Selected
                        </Button>
                        <Button variant="outline" size="sm" onClick={clearAllFilters} data-testid="button-clear-all-filters">
                          Clear All Filters
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* View Switcher */}
          <div className="flex items-center justify-between glass-panel backdrop-blur-xl p-3 rounded-lg border border-primary/20 slide-in-right">
            <div className="flex gap-2">
              {/* Table view - hidden on mobile */}
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="gap-2 hidden md:flex"
                data-testid="button-view-table"
              >
                <LayoutList className="h-4 w-4" />
                <span className="hidden lg:inline">Table</span>
              </Button>
              {/* Card view - always visible */}
              <Button
                variant={viewMode === "card" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("card")}
                className="gap-2"
                data-testid="button-view-card"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Card</span>
              </Button>
              {/* Kanban view - hidden on mobile */}
              <Button
                variant={viewMode === "kanban" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("kanban")}
                className="gap-2 hidden md:flex"
                data-testid="button-view-kanban"
              >
                <Kanban className="h-4 w-4" />
                <span className="hidden lg:inline">Kanban</span>
              </Button>
            </div>

            <div className="text-sm text-muted-foreground whitespace-nowrap" data-testid="text-results-count">
              <span className="hidden sm:inline">{filteredTracks.length} {filteredTracks.length === 1 ? "result" : "results"}</span>
              <span className="sm:hidden">{filteredTracks.length}</span>
            </div>
          </div>

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
              tracks={filteredTracks} 
              isLoading={tracksLoading}
              selectedTrackIds={selectedTrackIds}
              onToggleSelection={toggleTrackSelection}
              onToggleSelectAll={toggleSelectAll}
              onEnrich={handleEnrichTrack}
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
              tracks={filteredTracks}
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

      <DetailsDrawer
        track={selectedTrack}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEnrich={handleEnrichTrack}
      />

      <ActivityPanel 
        jobs={activeJobs}
        onDismiss={(jobId) => setActiveJobs(prev => prev.filter(job => job.jobId !== jobId))}
      />
    </div>
  );
}
