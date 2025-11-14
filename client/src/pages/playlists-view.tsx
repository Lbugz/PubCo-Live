import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Music2, List, Calendar, Search, Filter, ExternalLink, MoreVertical, Eye, EyeOff, RefreshCw, Plus, LayoutGrid, LayoutList, User2, Users, ChevronDown, UserCheck, Trophy, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { type TrackedPlaylist, type ActivityHistory } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useFetchPlaylistsMutation } from "@/hooks/use-fetch-playlists-mutation";
import { useForm } from "react-hook-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatsCard } from "@/components/stats-card";
import { PlaylistBulkActionsToolbar, type BulkActionMode } from "@/components/playlist-bulk-actions-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { PageContainer } from "@/components/layout/page-container";
import { AddPlaylistDialog } from "@/components/add-playlist-dialog";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function PlaylistsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedPlaylist, setSelectedPlaylist] = useState<TrackedPlaylist | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showMetrics, setShowMetrics] = useState(() => {
    const stored = localStorage.getItem('playlistsMetricsVisible');
    return stored !== null ? stored === 'true' : true;
  });
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Persist metrics visibility to localStorage
  useEffect(() => {
    localStorage.setItem('playlistsMetricsVisible', showMetrics.toString());
  }, [showMetrics]);

  // Fetch playlists mutation
  const fetchPlaylistsMutation = useFetchPlaylistsMutation();

  const { data: playlists = [], isLoading } = useQuery<TrackedPlaylist[]>({
    queryKey: ["/api/tracked-playlists"],
  });

  // Fetch real-time playlist metrics
  const { data: playlistMetrics } = useQuery<{
    totalPlaylists: number;
    uniqueSongwriters: number;
    highImpactPlaylists: number;
    changeSongwriters: number;
    changeHighImpact: number;
  }>({
    queryKey: ["/api/metrics/playlists"],
    staleTime: 60000,
  });

  // WebSocket integration for real-time metric updates
  useWebSocket({
    onMetricUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/playlists"] });
    },
    onMessage: (message) => {
      // Handle playlist_quality_updated to refresh quality metrics in drawer
      if (message.type === 'playlist_quality_updated' && message.playlistId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/playlists', message.playlistId, 'quality'] 
        });
      }

      // Handle playlist_fetch_complete to show toast
      if (message.type === 'playlist_fetch_complete') {
        toast({
          title: "Track data fetched",
          description: `${message.playlistName}: ${message.tracksInserted || 0} new tracks added`,
        });
      }
    },
    onPlaylistError: (data) => {
      // Handle playlist errors (e.g., deleted from Spotify)
      if (data.data?.error) {
        toast({
          title: "Playlist Error",
          description: data.data.error,
          variant: "destructive",
        });
      }

      // Close drawer if the errored playlist is currently selected
      if (selectedPlaylist && data.data?.playlistId === selectedPlaylist.playlistId) {
        setDrawerOpen(false);
        setSelectedPlaylist(null);
      }

      // Refresh playlists to remove deleted playlist
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onPlaylistUpdated: (data) => {
      // Refresh playlist list to show updated metadata (name, artwork, curator, followers)
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });

      // Also refresh individual playlist if it's currently being viewed
      if (data.playlistId) {
        queryClient.invalidateQueries({ queryKey: ["/api/playlists", data.playlistId] });
      }
    },
    // Fix undefined enrichment toast message
    onTrackEnriched: (data) => {
      const enrichedCount = data.tracksEnriched || 0;
      const totalCount = data.totalTracks || 0;
      const phaseLabel = data.phase === 1 ? 'Spotify API' : data.phase === 2 ? 'Credits' : 'MLC';

      toast({
        title: "Track Enriched!",
        description: `${phaseLabel}: ${enrichedCount}/${totalCount} tracks enriched`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/playlist-snapshot"] });
    },
  });

  // Fetch Chartmetric analytics for selected playlist
  const { data: chartmetricAnalytics, isLoading: analyticsLoading } = useQuery<{
    metadata: any;
    stats: {
      followerHistory: Array<{ date: string; followers: number }>;
      currentFollowers?: number;
      followerGrowth?: {
        daily?: number;
        weekly?: number;
        monthly?: number;
      };
      momentum?: string;
      trackCountHistory?: Array<{ date: string; count: number }>;
    };
    chartmetricId: string;
    platform: string;
  }>({
    queryKey: ['/api/tracked-playlists', selectedPlaylist?.id, 'chartmetric-analytics'],
    queryFn: async () => {
      const response = await fetch(`/api/tracked-playlists/${selectedPlaylist!.id}/chartmetric-analytics`);
      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!selectedPlaylist && !!selectedPlaylist.chartmetricUrl && drawerOpen,
  });

  const { data: playlistActivity, isLoading: activityLoading } = useQuery<ActivityHistory[]>({
    queryKey: ['/api/playlists', selectedPlaylist?.id, 'activity'],
    enabled: !!selectedPlaylist?.id && drawerOpen,
  });

  // Fetch quality metrics for selected playlist
  const { data: qualityMetrics, isLoading: qualityLoading, error: qualityError } = useQuery<{
    totalTracks: number;
    enrichedCount: number;
    isrcCount: number;
    avgUnsignedScore: number;
    publishedCount?: number; // Added for MLC phase
  }>({
    queryKey: ['/api/playlists', selectedPlaylist?.id, 'quality'],
    queryFn: async ({ queryKey }) => {
      const [, playlistId] = queryKey as [string, string, string];
      if (!playlistId) {
        return { totalTracks: 0, enrichedCount: 0, isrcCount: 0, avgUnsignedScore: 0, publishedCount: 0 };
      }
      const response = await fetch(`/api/playlists/${playlistId}/quality`);
      if (!response.ok) {
        throw new Error(`Failed to fetch quality metrics: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!selectedPlaylist?.id && drawerOpen,
    retry: 1,
  });

  // Auto-update selectedPlaylist when playlists data changes (with guard to prevent infinite loop)
  useEffect(() => {
    if (selectedPlaylist && playlists.length > 0) {
      const updated = playlists.find(p => p.id === selectedPlaylist.id);
      if (updated && updated !== selectedPlaylist) {
        setSelectedPlaylist(updated);
      }
    }
  }, [playlists, selectedPlaylist?.id]);

  // Clean up orphaned selections when playlists data changes
  useEffect(() => {
    if (selectedPlaylistIds.size > 0) {
      const validIds = new Set(playlists.map(p => p.id));
      const newSelection = new Set<string>();

      selectedPlaylistIds.forEach(id => {
        if (validIds.has(id)) {
          newSelection.add(id);
        }
      });

      // Only update if there were orphaned IDs
      if (newSelection.size !== selectedPlaylistIds.size) {
        setSelectedPlaylistIds(newSelection);
      }
    }
  }, [playlists]);


  const enrichTracksMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const response = await apiRequest("POST", `/api/playlists/${playlistId}/enrich-tracks`, {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Track enrichment complete",
        description: `${data.enrichedCount} tracks enriched with credits, ${data.failedCount} failed`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/playlist-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Enrichment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchPlaylistDataMutation = useMutation({
    mutationFn: async (spotifyPlaylistId: string) => {
      console.log(`[Auto-Fetch] Starting fetch for playlist ID: ${spotifyPlaylistId}`);
      const response = await apiRequest("POST", "/api/fetch-playlists", { 
        mode: 'specific', 
        playlistId: spotifyPlaylistId 
      });
      return await response.json();
    },
    onSuccess: (data: any, spotifyPlaylistId: string) => {
      const playlist = playlists.find(p => p.playlistId === spotifyPlaylistId);
      const totalSkipped = data.completenessResults?.reduce((sum: number, r: any) => sum + (r.skipped || 0), 0) || 0;
      const totalNew = data.tracksAdded || 0;

      console.log(`[Auto-Fetch] Fetch complete: ${totalNew} new tracks, ${totalSkipped} skipped`);

      toast({
        title: "Playlist data fetched successfully",
        description: `${playlist?.name || 'Playlist'}: ${totalNew} new tracks added, ${totalSkipped} duplicates skipped`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/playlist-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onError: (error: Error) => {
      console.error(`[Auto-Fetch] Error:`, error);
      toast({
        title: "Failed to fetch playlist data",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshMetadataMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const response = await apiRequest("POST", `/api/tracked-playlists/${playlistId}/refresh-metadata`, {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Metadata refreshed",
        description: `Updated curator${data.curator ? `: ${data.curator}` : ''} and followers${data.followers ? `: ${data.followers.toLocaleString()}` : ''}`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to refresh metadata",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Selection helpers
  const togglePlaylistSelection = (playlistId: string) => {
    setSelectedPlaylistIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playlistId)) {
        newSet.delete(playlistId);
      } else {
        newSet.add(playlistId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const allFilteredSelected = filteredPlaylists.length > 0 && filteredPlaylists.every(p => selectedPlaylistIds.has(p.id));

    if (allFilteredSelected) {
      // All filtered playlists selected - deselect them (keep other selections)
      const newSet = new Set(selectedPlaylistIds);
      filteredPlaylists.forEach(p => newSet.delete(p.id));
      setSelectedPlaylistIds(newSet);
    } else {
      // Not all filtered playlists selected - select all filtered playlists (keep existing selections)
      const newSet = new Set(selectedPlaylistIds);
      filteredPlaylists.forEach(p => newSet.add(p.id));
      setSelectedPlaylistIds(newSet);
    }
  };

  const clearSelection = () => {
    setSelectedPlaylistIds(new Set());
  };

  // Bulk action handlers
  const handleBulkFetchData = async (mode: BulkActionMode) => {
    const targetPlaylists = mode === "selected" ? selectedFilteredPlaylists : filteredPlaylists;

    if (targetPlaylists.length === 0) {
      toast({
        title: "No playlists to fetch",
        description: "Please select at least one playlist",
        variant: "destructive",
      });
      return;
    }

    setIsBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;

    toast({
      title: "Starting bulk fetch",
      description: `Fetching data for ${targetPlaylists.length} playlist${targetPlaylists.length !== 1 ? 's' : ''}...`,
    });

    try {
      for (const playlist of targetPlaylists) {
        try {
          await fetchPlaylistDataMutation.mutateAsync(playlist.playlistId);
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Failed to fetch playlist ${playlist.name}:`, error);
        }
      }

      // Invalidate queries to refresh UI
      await queryClient.invalidateQueries({ queryKey: ["/api/playlist-snapshot"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });

    } finally {
      setIsBulkProcessing(false);
      clearSelection();

      toast({
        title: "Bulk fetch complete",
        description: `${successCount} succeeded, ${failCount} failed`,
        variant: failCount > 0 ? "destructive" : "default",
      });
    }
  };

  const handleBulkRefreshMetadata = async (mode: BulkActionMode) => {
    const targetPlaylists = mode === "selected" ? selectedFilteredPlaylists : filteredPlaylists;

    if (targetPlaylists.length === 0) {
      toast({
        title: "No playlists to refresh",
        description: "Please select at least one playlist",
        variant: "destructive",
      });
      return;
    }

    setIsBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;

    toast({
      title: "Starting bulk refresh",
      description: `Refreshing metadata for ${targetPlaylists.length} playlist${targetPlaylists.length !== 1 ? 's' : ''}...`,
    });

    try {
      for (const playlist of targetPlaylists) {
        try {
          await refreshMetadataMutation.mutateAsync(playlist.id);
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Failed to refresh playlist ${playlist.name}:`, error);
        }
      }

      // Invalidate queries to refresh UI
      await queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });

    } finally {
      setIsBulkProcessing(false);
      clearSelection();

      toast({
        title: "Bulk refresh complete",
        description: `${successCount} succeeded, ${failCount} failed`,
        variant: failCount > 0 ? "destructive" : "default",
      });
    }
  };

  const handleBulkExport = (mode: BulkActionMode) => {
    const targetPlaylists = mode === "selected" ? selectedFilteredPlaylists : filteredPlaylists;

    if (targetPlaylists.length === 0) {
      toast({
        title: "No playlists to export",
        description: "Please select at least one playlist",
        variant: "destructive",
      });
      return;
    }

    try {
      const headers = [
        "Name", "Curator", "Followers", "Total Tracks", "Source", "Genre",
        "Last Checked", "Status", "Playlist ID", "Playlist URL"
      ];

      const rows = targetPlaylists.map(playlist => [
        playlist.name,
        playlist.curator || "",
        (playlist.followers || 0).toString(),
        (playlist.totalTracks || 0).toString(),
        playlist.source || "unknown",
        playlist.genre || "",
        playlist.lastChecked ? new Date(playlist.lastChecked).toLocaleDateString() : "",
        playlist.status || "unknown",
        playlist.playlistId,
        `https://open.spotify.com/playlist/${playlist.playlistId}`
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mode === "selected" ? "selected" : "filtered"}-playlists-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: `Exported ${targetPlaylists.length} playlist${targetPlaylists.length !== 1 ? 's' : ''} to CSV`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export failed",
        description: "Failed to generate CSV file",
        variant: "destructive",
      });
    }
  };

  // Normalize source value for consistent filtering
  const normalizeSource = (source: string | null) => {
    return source || "unknown";
  };

  // Filter playlists
  const filteredPlaylists = useMemo(() => {
    let filtered = [...playlists];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p => p.name.toLowerCase().includes(query) || 
             p.curator?.toLowerCase().includes(query) ||
             p.genre?.toLowerCase().includes(query)
      );
    }

    // Source filter
    if (sourceFilter !== "all") {
      filtered = filtered.filter(p => normalizeSource(p.source) === sourceFilter);
    }

    return filtered;
  }, [playlists, searchQuery, sourceFilter]);

  // Calculate selected playlists from filtered set
  const selectedFilteredPlaylists = useMemo(() => {
    return filteredPlaylists.filter(p => selectedPlaylistIds.has(p.id));
  }, [filteredPlaylists, selectedPlaylistIds]);

  // Reconcile selections with filtered playlists (strict filter-aligned selection)
  useEffect(() => {
    if (selectedPlaylistIds.size === 0) return;

    const filteredIds = new Set(filteredPlaylists.map(p => p.id));
    const reconciled = new Set<string>();

    selectedPlaylistIds.forEach(id => {
      if (filteredIds.has(id)) {
        reconciled.add(id);
      }
    });

    // Early return if no pruning needed
    if (reconciled.size === selectedPlaylistIds.size) return;

    // Update selection and notify user
    const removedCount = selectedPlaylistIds.size - reconciled.size;
    setSelectedPlaylistIds(reconciled);

    if (removedCount > 0) {
      toast({
        title: "Selections updated",
        description: `${removedCount} hidden playlist${removedCount !== 1 ? 's' : ''} deselected`,
      });
    }
  }, [filteredPlaylists, selectedPlaylistIds, toast]);


  // Get unique sources for filter, including "unknown" for playlists without a source
  const sources = useMemo(() => {
    const uniqueSources = new Set(playlists.map(p => normalizeSource(p.source)));
    return Array.from(uniqueSources).sort();
  }, [playlists]);

  const openDrawer = (playlist: TrackedPlaylist) => {
    setSelectedPlaylist(playlist);
    setDrawerOpen(true);
  };

  const viewTracks = (playlistId: string) => {
    navigate(`/?playlist=${playlistId}`);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Never";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatNumber = (num: number | null) => {
    if (!num) return "—";
    return num.toLocaleString();
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;

    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
      case "paused":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Paused</Badge>;
      case "error":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <PageContainer className="space-y-6 fade-in">

      {/* Header with Add Button */}
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          {/* Fetch Data Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
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
              {playlists.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Fetch Specific Playlist</DropdownMenuLabel>
                  {playlists.map((playlist) => (
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

          <Button 
            variant="gradient" 
            size="default" 
            className="gap-2" 
            data-testid="button-add-playlist"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Playlist
          </Button>

          <AddPlaylistDialog 
            open={addDialogOpen} 
            onOpenChange={setAddDialogOpen}
            onPlaylistsAdded={(spotifyPlaylistIds) => {
              // Trigger automatic fetch/enrichment for each successfully added playlist
              spotifyPlaylistIds.forEach((spotifyPlaylistId, index) => {
                setTimeout(() => {
                  fetchPlaylistDataMutation.mutate(spotifyPlaylistId);
                }, index * 500); // Stagger requests by 500ms to avoid rate limiting
              });
            }}
          />
        </div>
      </div>

      {/* Stats Cards with Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">TOP METRICS</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMetrics(!showMetrics)}
            data-testid="button-toggle-playlist-metrics"
            className="h-8 w-8"
          >
            {showMetrics ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <Collapsible open={showMetrics}>
          <CollapsibleContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 slide-in-right">
              <StatsCard
                title="Total Tracked"
                value={playlistMetrics?.totalPlaylists ?? 0}
                icon={Music2}
                variant="blue"
                tooltip="Total number of Spotify playlists being monitored for unsigned talent discovery"
                testId="stats-total-playlists"
              />
              <StatsCard
                title="Unique Songwriters"
                value={playlistMetrics?.uniqueSongwriters ?? 0}
                icon={UserCheck}
                variant="green"
                tooltip="Total unique songwriters discovered across all tracked playlists this week"
                change={playlistMetrics?.changeSongwriters}
                testId="stats-unique-songwriters"
              />
              <StatsCard
                title="High-Impact Playlists"
                value={playlistMetrics?.highImpactPlaylists ?? 0}
                icon={Trophy}
                variant="gold"
                tooltip="Playlists with average unsigned score of 7 or higher, indicating publishing opportunities"
                change={playlistMetrics?.changeHighImpact}
                testId="stats-high-impact-playlists"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Filters */}
      <Card className="glass-panel backdrop-blur-xl border border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search playlists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-playlist-search"
                />
              </div>
            </div>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-source-filter">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sources.map(source => (
                  <SelectItem key={source} value={source}>
                    {source.charAt(0).toUpperCase() + source.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchQuery || sourceFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSourceFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Toolbar */}
      <PlaylistBulkActionsToolbar
        selectedCount={selectedFilteredPlaylists.length}
        totalFilteredCount={filteredPlaylists.length}
        onFetchData={handleBulkFetchData}
        onRefreshMetadata={handleBulkRefreshMetadata}
        onExport={handleBulkExport}
        onClearSelection={clearSelection}
        isFetching={isBulkProcessing}
        isRefreshing={isBulkProcessing}
      />

      {/* View Toggle and Count */}
      <Card className="glass-panel backdrop-blur-xl border border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {filteredPlaylists.length} Playlist{filteredPlaylists.length !== 1 ? 's' : ''}
            </h2>
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
                variant={viewMode === "cards" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="gap-2"
                data-testid="button-view-cards"
              >
                <LayoutGrid className="h-4 w-4" />
                Cards
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading playlists...</div>
          ) : filteredPlaylists.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {playlists.length === 0 ? "No playlists tracked yet" : "No playlists match your filters"}
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPlaylists.map(playlist => (
                <Card 
                  key={playlist.id} 
                  className="glass-panel hover-elevate cursor-pointer relative"
                  onClick={() => openDrawer(playlist)}
                  data-testid={`card-playlist-${playlist.id}`}
                >
                  {/* Checkbox Overlay */}
                  <div 
                    className="absolute top-3 left-3 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedPlaylistIds.has(playlist.id)}
                      onCheckedChange={() => togglePlaylistSelection(playlist.id)}
                      aria-label={`Select ${playlist.name}`}
                      data-testid={`checkbox-card-${playlist.id}`}
                    />
                  </div>

                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 pl-8">
                        <Avatar className="h-12 w-12 rounded-md">
                          <AvatarImage src={playlist.imageUrl || undefined} alt={playlist.name} />
                          <AvatarFallback className="rounded-md bg-primary/10">
                            <Music2 className="h-5 w-5 text-primary" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{playlist.name}</h3>
                          {playlist.isEditorial === 1 && (
                            <Badge variant="secondary" className="mt-1">Editorial</Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            data-testid={`button-card-actions-${playlist.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            viewTracks(playlist.playlistId);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Tracks
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchPlaylistDataMutation.mutate(playlist.playlistId);
                            }}
                            disabled={fetchPlaylistDataMutation.isPending}
                          >
                            <RefreshCw className={cn("h-4 w-4 mr-2", fetchPlaylistDataMutation.isPending && "animate-spin")} />
                            Fetch Data
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            window.open(playlist.spotifyUrl, "_blank");
                          }}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open in Spotify
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Music2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{formatNumber(playlist.totalTracks)}</span>
                      <span className="text-muted-foreground">tracks</span>
                    </div>
                    {playlist.curator && (
                      <div className="flex items-center gap-2 text-sm">
                        <User2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">{playlist.curator}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{formatNumber(playlist.followers)}</span>
                      <span className="text-muted-foreground">followers</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(playlist.lastChecked)}
                      </span>
                      {getStatusBadge(playlist.status)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={filteredPlaylists.length > 0 && filteredPlaylists.every(p => selectedPlaylistIds.has(p.id))}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all playlists"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Tracks</TableHead>
                  <TableHead>Curator</TableHead>
                  <TableHead className="text-right">Followers</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlaylists.map(playlist => (
                  <TableRow 
                    key={playlist.id} 
                    className="hover-elevate cursor-pointer"
                    onClick={() => openDrawer(playlist)}
                    data-testid={`row-playlist-${playlist.id}`}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedPlaylistIds.has(playlist.id)}
                        onCheckedChange={() => togglePlaylistSelection(playlist.id)}
                        aria-label={`Select ${playlist.name}`}
                        data-testid={`checkbox-playlist-${playlist.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 rounded-md">
                          <AvatarImage src={playlist.imageUrl || undefined} alt={playlist.name} />
                          <AvatarFallback className="rounded-md bg-primary/10">
                            <Music2 className="h-4 w-4 text-primary" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex items-center gap-2">
                          {playlist.name}
                          {playlist.isEditorial === 1 && (
                            <Badge variant="secondary" className="ml-1">Editorial</Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {normalizeSource(playlist.source).charAt(0).toUpperCase() + normalizeSource(playlist.source).slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(playlist.totalTracks)}</TableCell>
                    <TableCell className="text-muted-foreground">{playlist.curator || "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatNumber(playlist.followers)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(playlist.lastChecked)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`button-playlist-actions-${playlist.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            viewTracks(playlist.playlistId);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Tracks
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchPlaylistDataMutation.mutate(playlist.playlistId);
                            }}
                            disabled={fetchPlaylistDataMutation.isPending}
                          >
                            <RefreshCw className={cn("h-4 w-4 mr-2", fetchPlaylistDataMutation.isPending && "animate-spin")} />
                            Fetch Data
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            window.open(playlist.spotifyUrl, "_blank");
                          }}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open in Spotify
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto glass-panel backdrop-blur-xl border-l border-primary/20">
          {selectedPlaylist && (
            <div className="space-y-6">
              {/* Consolidated Top Banner */}
              <div className="relative">
                {/* Large Artwork Hero */}
                <div className="relative h-48 bg-gradient-to-b from-primary/20 to-background rounded-lg overflow-hidden">
                  <Avatar className="h-full w-full rounded-lg">
                    <AvatarImage src={selectedPlaylist.imageUrl || undefined} alt={selectedPlaylist.name} className="object-cover" />
                    <AvatarFallback className="rounded-lg bg-primary/10">
                      <Music2 className="h-16 w-16 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  {/* Dark overlay for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                </div>

                {/* Overlapping Info Card */}
                <Card className="bg-background/95 backdrop-blur-lg border-primary/20 -mt-16 mx-4 relative z-10">
                  <CardContent className="p-4 space-y-4">
                    {/* Title and Badges */}
                    <div>
                      <h2 className="font-bold text-xl mb-2 truncate" data-testid="text-drawer-playlist-name">
                        {selectedPlaylist.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedPlaylist.isEditorial === 1 && (
                          <Badge variant="secondary" data-testid="badge-editorial">Editorial</Badge>
                        )}
                        {getStatusBadge(selectedPlaylist.status)}
                        <Badge variant="outline" data-testid="badge-source">
                          {normalizeSource(selectedPlaylist.source).charAt(0).toUpperCase() + normalizeSource(selectedPlaylist.source).slice(1)}
                        </Badge>
                      </div>
                    </div>

                    {/* Key Stats Row */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Curator</p>
                        <p className="font-semibold truncate" data-testid="text-curator">{selectedPlaylist.curator || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Followers</p>
                        <p className="font-semibold" data-testid="text-followers">{formatNumber(selectedPlaylist.followers)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total Tracks</p>
                        <p className="font-semibold" data-testid="text-total-tracks">{formatNumber(selectedPlaylist.totalTracks)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                        <p className="text-sm font-medium" data-testid="text-last-updated">{formatDate(selectedPlaylist.lastChecked)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Accordion Sections */}
              <Accordion type="multiple" defaultValue={["metadata", "actions"]} className="space-y-3">
                {/* Metadata & Quality Section */}
                <AccordionItem value="metadata" className="border rounded-lg overflow-hidden bg-background/60 backdrop-blur">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate" data-testid="accordion-metadata">
                    <span className="font-medium">Metadata & Quality</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-6">

                    {/* 1. Track Quality Summary */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3">Track Quality Summary</p>
                      {qualityLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-20" />
                          ))}
                        </div>
                      ) : qualityMetrics ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {/* Enriched Count */}
                          <Card className="bg-background/40" data-testid="quality-card-enriched">
                            <CardContent className="p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">Enriched</p>
                              <p className="text-lg font-semibold" data-testid="text-enriched-count">
                                {qualityMetrics.enrichedCount} / {qualityMetrics.totalTracks}
                              </p>
                              {qualityMetrics.totalTracks > 0 && (
                                <Badge variant="secondary" className="mt-1 text-xs" data-testid="badge-enriched-percent">
                                  {Math.round((qualityMetrics.enrichedCount / Math.max(qualityMetrics.totalTracks, 1)) * 100)}%
                                </Badge>
                              )}
                            </CardContent>
                          </Card>

                          {/* ISRC Coverage */}
                          <Card className="bg-background/40" data-testid="quality-card-isrc">
                            <CardContent className="p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">ISRCs</p>
                              <p className="text-lg font-semibold" data-testid="text-isrc-count">
                                {qualityMetrics.isrcCount} / {qualityMetrics.totalTracks}
                              </p>
                              {qualityMetrics.totalTracks > 0 && (
                                <Badge variant="secondary" className="mt-1 text-xs" data-testid="badge-isrc-percent">
                                  {Math.round((qualityMetrics.isrcCount / Math.max(qualityMetrics.totalTracks, 1)) * 100)}%
                                </Badge>
                              )}
                            </CardContent>
                          </Card>

                          {/* Average Unsigned Score */}
                          <Card className="bg-background/40" data-testid="quality-card-score">
                            <CardContent className="p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">Avg Score</p>
                              <p className="text-lg font-semibold" data-testid="text-avg-score">
                                {qualityMetrics.avgUnsignedScore.toFixed(1)} / 10
                              </p>
                              <Badge 
                                variant={
                                  qualityMetrics.avgUnsignedScore >= 7 ? 'default' : 
                                  qualityMetrics.avgUnsignedScore >= 4 ? 'secondary' : 'outline'
                                } 
                                className="mt-1 text-xs"
                                data-testid="badge-score-level"
                              >
                                {qualityMetrics.avgUnsignedScore >= 7 ? 'High' : 
                                 qualityMetrics.avgUnsignedScore >= 4 ? 'Medium' : 'Low'}
                              </Badge>
                            </CardContent>
                          </Card>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Quality metrics unavailable. Fetch playlist data to calculate.</p>
                      )}
                    </div>

                    {/* Enrichment Timeline */}
                    {qualityMetrics && qualityMetrics.totalTracks > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3">Enrichment Pipeline Status</p>
                        <div className="space-y-2">
                          {/* Phase 1: Spotify API */}
                          <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-1">
                            <div className={cn(
                              "h-2 w-2 rounded-full transition-all duration-300",
                              qualityMetrics.isrcCount > 0 ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                            )} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Phase 1: Spotify API</p>
                                {qualityMetrics.isrcCount > 0 && qualityMetrics.totalTracks > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {Math.round((qualityMetrics.isrcCount / qualityMetrics.totalTracks) * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {qualityMetrics.isrcCount > 0 
                                  ? `✓ ${qualityMetrics.isrcCount} tracks with ISRC codes` 
                                  : "Pending ISRC recovery"}
                              </p>
                            </div>
                          </div>

                          {/* Phase 2: Credits Scraping */}
                          <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-2">
                            <div className={cn(
                              "h-2 w-2 rounded-full transition-all duration-300",
                              qualityMetrics.enrichedCount > 0 ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                            )} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Phase 2: Credits Scraping</p>
                                {qualityMetrics.enrichedCount > 0 && qualityMetrics.totalTracks > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {Math.round((qualityMetrics.enrichedCount / qualityMetrics.totalTracks) * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {qualityMetrics.enrichedCount > 0 
                                  ? `✓ ${qualityMetrics.enrichedCount} tracks enriched` 
                                  : "Pending credit scraping"}
                              </p>
                            </div>
                          </div>

                          {/* Phase 3: MusicBrainz Artist Links */}
                          <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-3">
                            <div className={cn(
                              "h-2 w-2 rounded-full transition-all duration-300",
                              "bg-muted animate-pulse"
                            )} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Phase 3: MusicBrainz</p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Pending artist social links
                              </p>
                            </div>
                          </div>

                          {/* Phase 4: Chartmetric Analytics */}
                          <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-4">
                            <div className={cn(
                              "h-2 w-2 rounded-full transition-all duration-300",
                              "bg-muted animate-pulse"
                            )} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Phase 4: Chartmetric</p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Pending analytics data
                              </p>
                            </div>
                          </div>

                          {/* Phase 5: MLC Publisher Lookup */}
                          <div className="flex items-center gap-3 p-3 bg-background/40 rounded-lg transition-all duration-300" data-testid="enrichment-phase-5">
                            <div className={cn(
                              "h-2 w-2 rounded-full transition-all duration-300",
                              (qualityMetrics.publishedCount || 0) > 0 ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted animate-pulse"
                            )} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Phase 5: MLC Lookup</p>
                                {(qualityMetrics.publishedCount || 0) > 0 && qualityMetrics.totalTracks > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {Math.round(((qualityMetrics.publishedCount || 0) / qualityMetrics.totalTracks) * 100)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {(qualityMetrics.publishedCount || 0) > 0 
                                  ? `✓ ${qualityMetrics.publishedCount} tracks verified` 
                                  : "Pending publisher verification"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Chartmetric Insights */}
                    {selectedPlaylist.chartmetricUrl && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3">Chartmetric Insights</p>
                        {analyticsLoading ? (
                          <Skeleton className="h-24" />
                        ) : chartmetricAnalytics?.stats ? (
                          <div className="space-y-3">
                            {/* Current Followers + Momentum */}
                            {chartmetricAnalytics.stats.currentFollowers !== undefined && (
                              <div className="flex items-center justify-between p-3 bg-background/40 rounded-lg" data-testid="chartmetric-followers">
                                <div>
                                  <p className="text-xs text-muted-foreground">Current Followers</p>
                                  <p className="text-xl font-semibold">{chartmetricAnalytics.stats.currentFollowers.toLocaleString()}</p>
                                </div>
                                {chartmetricAnalytics.stats.momentum && (
                                  <Badge variant={
                                    chartmetricAnalytics.stats.momentum === 'hot' ? 'default' :
                                    chartmetricAnalytics.stats.momentum === 'growing' ? 'secondary' :
                                    chartmetricAnalytics.stats.momentum === 'declining' ? 'destructive' :
                                    'outline'
                                  } data-testid="badge-momentum">
                                    {chartmetricAnalytics.stats.momentum === 'hot' && <TrendingUp className="h-3 w-3 mr-1" />}
                                    {chartmetricAnalytics.stats.momentum === 'growing' && <TrendingUp className="h-3 w-3 mr-1" />}
                                    {chartmetricAnalytics.stats.momentum === 'declining' && <TrendingDown className="h-3 w-3 mr-1" />}
                                    {chartmetricAnalytics.stats.momentum === 'stable' && <Minus className="h-3 w-3 mr-1" />}
                                    {chartmetricAnalytics.stats.momentum === 'stable' ? 'Stable' : chartmetricAnalytics.stats.momentum.charAt(0).toUpperCase() + chartmetricAnalytics.stats.momentum.slice(1)}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Follower Growth Deltas */}
                            {chartmetricAnalytics.stats.followerGrowth && (
                              <div className="grid grid-cols-3 gap-2">
                                {chartmetricAnalytics.stats.followerGrowth.daily !== undefined && (
                                  <div className="p-2 bg-background/40 rounded-lg text-center" data-testid="growth-daily">
                                    <p className="text-xs text-muted-foreground mb-1">Daily</p>
                                    <p className={cn("text-sm font-semibold", 
                                      chartmetricAnalytics.stats.followerGrowth.daily > 0 ? "text-green-500" : 
                                      chartmetricAnalytics.stats.followerGrowth.daily < 0 ? "text-red-500" : ""
                                    )}>
                                      {chartmetricAnalytics.stats.followerGrowth.daily > 0 ? "+" : ""}
                                      {chartmetricAnalytics.stats.followerGrowth.daily.toLocaleString()}
                                    </p>
                                  </div>
                                )}
                                {chartmetricAnalytics.stats.followerGrowth.weekly !== undefined && (
                                  <div className="p-2 bg-background/40 rounded-lg text-center" data-testid="growth-weekly">
                                    <p className="text-xs text-muted-foreground mb-1">Weekly</p>
                                    <p className={cn("text-sm font-semibold",
                                      chartmetricAnalytics.stats.followerGrowth.weekly > 0 ? "text-green-500" :
                                      chartmetricAnalytics.stats.followerGrowth.weekly < 0 ? "text-red-500" : ""
                                    )}>
                                      {chartmetricAnalytics.stats.followerGrowth.weekly > 0 ? "+" : ""}
                                      {chartmetricAnalytics.stats.followerGrowth.weekly.toLocaleString()}
                                    </p>
                                  </div>
                                )}
                                {chartmetricAnalytics.stats.followerGrowth.monthly !== undefined && (
                                  <div className="p-2 bg-background/40 rounded-lg text-center" data-testid="growth-monthly">
                                    <p className="text-xs text-muted-foreground mb-1">Monthly</p>
                                    <p className={cn("text-sm font-semibold",
                                      chartmetricAnalytics.stats.followerGrowth.monthly > 0 ? "text-green-500" :
                                      chartmetricAnalytics.stats.followerGrowth.monthly < 0 ? "text-red-500" : ""
                                    )}>
                                      {chartmetricAnalytics.stats.followerGrowth.monthly > 0 ? "+" : ""}
                                      {chartmetricAnalytics.stats.followerGrowth.monthly.toLocaleString()}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Chartmetric analytics unavailable.</p>
                        )}
                      </div>
                    )}

                    {/* 3. Additional Details */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3">Additional Details</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Playlist ID</p>
                          <code className="text-xs bg-muted px-2 py-1 rounded block truncate font-mono" data-testid="code-playlist-id">
                            {selectedPlaylist.playlistId}
                          </code>
                        </div>

                        {selectedPlaylist.genre && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Genre</p>
                            <Badge variant="outline" data-testid="badge-genre">{selectedPlaylist.genre}</Badge>
                          </div>
                        )}

                        {selectedPlaylist.region && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Region</p>
                            <Badge variant="outline" data-testid="badge-region">{selectedPlaylist.region}</Badge>
                          </div>
                        )}

                        {selectedPlaylist.chartmetricUrl && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Chartmetric</p>
                            <a 
                              href={selectedPlaylist.chartmetricUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                              data-testid="link-chartmetric"
                            >
                              View on Chartmetric
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                  </AccordionContent>
                </AccordionItem>

                {/* Actions Section */}
                <AccordionItem value="actions" className="border rounded-lg overflow-hidden bg-background/60 backdrop-blur">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate" data-testid="accordion-actions">
                    <span className="font-medium">Actions</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="flex flex-col gap-2">
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => viewTracks(selectedPlaylist.playlistId)}
                        data-testid="button-drawer-view-tracks"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Tracks
                      </Button>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => fetchPlaylistDataMutation.mutate(selectedPlaylist.playlistId)}
                        disabled={fetchPlaylistDataMutation.isPending}
                        data-testid="button-drawer-fetch-data"
                      >
                        <RefreshCw className={cn("h-4 w-4 mr-2", fetchPlaylistDataMutation.isPending && "animate-spin")} />
                        {fetchPlaylistDataMutation.isPending ? "Fetching..." : "Fetch Data"}
                      </Button>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => refreshMetadataMutation.mutate(selectedPlaylist.id)}
                        disabled={refreshMetadataMutation.isPending}
                        data-testid="button-drawer-refresh-metadata"
                      >
                        <RefreshCw className={cn("h-4 w-4 mr-2", refreshMetadataMutation.isPending && "animate-spin")} />
                        {refreshMetadataMutation.isPending ? "Refreshing..." : "Refresh Metadata"}
                      </Button>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => window.open(selectedPlaylist.spotifyUrl, "_blank")}
                        data-testid="button-drawer-open-spotify"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in Spotify
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>


              </Accordion>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}