import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Music2, List, Calendar, Search, Filter, ExternalLink, MoreVertical, Eye, RefreshCw, Plus, LayoutGrid, LayoutList, User2, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type TrackedPlaylist } from "@shared/schema";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function PlaylistsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedPlaylist, setSelectedPlaylist] = useState<TrackedPlaylist | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newPlaylistUrl, setNewPlaylistUrl] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: playlists = [], isLoading } = useQuery<TrackedPlaylist[]>({
    queryKey: ["/api/tracked-playlists"],
  });

  // Auto-update selectedPlaylist when playlists data changes
  useEffect(() => {
    if (selectedPlaylist && playlists.length > 0) {
      const updated = playlists.find(p => p.id === selectedPlaylist.id);
      if (updated) {
        setSelectedPlaylist(updated);
      }
    }
  }, [playlists, selectedPlaylist?.id]);

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
      
      toast({
        title: "Playlist data fetched successfully",
        description: `${playlist?.name || 'Playlist'}: ${totalNew} new tracks added, ${totalSkipped} duplicates skipped`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/playlist-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
      
      // Auto-trigger enrichment after successful fetch
      if (playlist && totalNew > 0) {
        console.log(`Auto-triggering enrichment for playlist ${playlist.id}...`);
        toast({
          title: "Starting track enrichment",
          description: "Fetching songwriters and publishers...",
        });
        enrichTracksMutation.mutate(playlist.playlistId);
      }
    },
    onError: (error: Error) => {
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

  const addPlaylistMutation = useMutation({
    mutationFn: async (url: string): Promise<TrackedPlaylist> => {
      const playlistId = extractPlaylistId(url);
      if (!playlistId) {
        throw new Error("Invalid Spotify playlist URL or ID");
      }

      const playlistData = await fetchPlaylistInfo(playlistId);
      
      const res = await apiRequest("POST", "/api/tracked-playlists", {
        name: playlistData.name,
        playlistId: playlistData.foundViaSearch ? playlistData.id : playlistId,
        spotifyUrl: `https://open.spotify.com/playlist/${playlistData.foundViaSearch ? playlistData.id : playlistId}`,
      });
      
      const playlist: TrackedPlaylist = await res.json();
      return playlist;
    },
    onSuccess: (data: TrackedPlaylist) => {
      const totalTracksInfo = data.totalTracks ? ` (${data.totalTracks} tracks)` : '';
      toast({
        title: "Playlist Added!",
        description: `Now tracking "${data.name}"${totalTracksInfo}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
      setNewPlaylistUrl("");
      setAddDialogOpen(false);
    },
    onError: (error: any) => {
      const isRestricted = error.message?.includes("region-restricted") || error.message?.includes("editorial-only");
      
      toast({
        title: isRestricted ? "Playlist Restricted" : "Error",
        description: error.message || "Failed to add playlist",
        variant: "destructive",
      });
    },
  });

  const extractPlaylistId = (urlOrId: string): string | null => {
    const trimmed = urlOrId.trim();
    
    const urlMatch = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    if (/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return trimmed;
    }
    
    return null;
  };

  const fetchPlaylistInfo = async (playlistId: string) => {
    const response = await fetch(`/api/spotify/playlist/${playlistId}`);
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to fetch playlist info from Spotify");
    }
    return response.json();
  };

  const handleAddPlaylist = () => {
    if (!newPlaylistUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Spotify playlist URL or ID",
        variant: "destructive",
      });
      return;
    }
    addPlaylistMutation.mutate(newPlaylistUrl);
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

  // Calculate stats
  const stats = useMemo(() => {
    const total = playlists.length;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentFetches = playlists.filter(p => {
      if (!p.lastChecked) return false;
      return new Date(p.lastChecked) >= sevenDaysAgo;
    }).length;
    
    const topPlaylist = playlists.reduce((max, p) => 
      (p.totalTracks || 0) > (max?.totalTracks || 0) ? p : max
    , playlists[0] || null);
    
    const totalFollowers = playlists.reduce((sum, p) => sum + (p.followers || 0), 0);
    const avgFollowers = playlists.length > 0 
      ? Math.round(totalFollowers / playlists.length) 
      : 0;
    const error = playlists.filter(p => p.status === "error").length;

    return { total, recentFetches, topPlaylist, avgFollowers, error };
  }, [playlists]);

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
    <div className="p-8 space-y-6 fade-in">

      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Playlists</h1>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="gradient" size="default" className="gap-2" data-testid="button-add-playlist">
              <Plus className="h-4 w-4" />
              Add Playlist
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel">
            <DialogHeader>
              <DialogTitle>Add Spotify Playlist</DialogTitle>
              <DialogDescription>
                Enter a Spotify playlist URL or ID to start tracking it
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="playlist-url">Playlist URL or ID</Label>
                <Input
                  id="playlist-url"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={newPlaylistUrl}
                  onChange={(e) => setNewPlaylistUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPlaylist();
                    }
                  }}
                  data-testid="input-new-playlist-url"
                />
              </div>
              <Button 
                onClick={handleAddPlaylist} 
                disabled={addPlaylistMutation.isPending}
                className="w-full"
                data-testid="button-submit-add-playlist"
              >
                {addPlaylistMutation.isPending ? "Adding..." : "Add Playlist"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 slide-in-right">
        <StatsCard
          title="Total Playlists"
          value={stats.total}
          icon={Music2}
          variant="default"
          testId="stats-total-playlists"
        />
        <StatsCard
          title="Recent Fetches"
          value={stats.recentFetches}
          subtitle="Last 7 days"
          icon={RefreshCw}
          variant="success"
          testId="stats-recent-fetches"
        />
        <StatsCard
          title="Top Playlist"
          value={stats.topPlaylist ? stats.topPlaylist.name.substring(0, 20) + (stats.topPlaylist.name.length > 20 ? '...' : '') : '—'}
          subtitle={stats.topPlaylist ? `${(stats.topPlaylist.totalTracks || 0).toLocaleString()} tracks` : ''}
          icon={List}
          variant="default"
          testId="stats-top-playlist"
        />
        <StatsCard
          title="Avg Followers"
          value={stats.avgFollowers > 1000 ? `${(stats.avgFollowers / 1000).toFixed(1)}K` : stats.avgFollowers.toLocaleString()}
          subtitle="Per playlist"
          icon={Filter}
          variant="warning"
          testId="stats-avg-followers"
        />
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
                  className="glass-panel hover-elevate cursor-pointer"
                  onClick={() => openDrawer(playlist)}
                  data-testid={`card-playlist-${playlist.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-md bg-primary/10">
                          <Music2 className="h-5 w-5 text-primary" />
                        </div>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Tracks</TableHead>
                  <TableHead>Curator</TableHead>
                  <TableHead className="text-right">Followers</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Status</TableHead>
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
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4 text-primary" />
                        {playlist.name}
                        {playlist.isEditorial === 1 && (
                          <Badge variant="secondary" className="ml-1">Editorial</Badge>
                        )}
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
                    <TableCell>{getStatusBadge(playlist.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="icon"
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
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Music2 className="h-5 w-5 text-primary" />
                  {selectedPlaylist.name}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Status */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
                  {getStatusBadge(selectedPlaylist.status)}
                </div>

                {/* Metadata */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Metadata</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Tracks</p>
                      <p className="font-medium">{formatNumber(selectedPlaylist.totalTracks)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tracks in DB</p>
                      <p className="font-medium">{formatNumber((selectedPlaylist as any).tracksInDb)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Fetch Count</p>
                      <p className="font-medium">{formatNumber(selectedPlaylist.lastFetchCount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Followers</p>
                      <p className="font-medium">{formatNumber(selectedPlaylist.followers)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Source</p>
                      <p className="font-medium">
                        {normalizeSource(selectedPlaylist.source).charAt(0).toUpperCase() + normalizeSource(selectedPlaylist.source).slice(1)}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs text-muted-foreground">Last Fetched</p>
                    <p className="font-medium">
                      {selectedPlaylist.lastChecked ? formatDate(selectedPlaylist.lastChecked) : 'Never'}
                    </p>
                  </div>

                  {selectedPlaylist.curator && (
                    <div>
                      <p className="text-xs text-muted-foreground">Curator</p>
                      <p className="font-medium">{selectedPlaylist.curator}</p>
                    </div>
                  )}

                  {selectedPlaylist.genre && (
                    <div>
                      <p className="text-xs text-muted-foreground">Genre</p>
                      <Badge variant="outline">{selectedPlaylist.genre}</Badge>
                    </div>
                  )}

                  {selectedPlaylist.region && (
                    <div>
                      <p className="text-xs text-muted-foreground">Region</p>
                      <Badge variant="outline">{selectedPlaylist.region}</Badge>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-muted-foreground">Last Updated</p>
                    <p className="font-medium">{formatDate(selectedPlaylist.lastChecked)}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Fetch Method</p>
                    <Badge 
                      variant={
                        selectedPlaylist.fetchMethod === 'network-capture' ? 'default' :
                        selectedPlaylist.fetchMethod === 'dom-capture' ? 'outline' :
                        'secondary'
                      }
                    >
                      {
                        selectedPlaylist.fetchMethod === 'network-capture' ? 'Network Capture' :
                        selectedPlaylist.fetchMethod === 'dom-capture' ? 'DOM Capture' :
                        selectedPlaylist.fetchMethod === 'scraping' ? 'Basic Scraping' :
                        'API'
                      }
                    </Badge>
                  </div>

                  {selectedPlaylist.isEditorial === 1 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <Badge variant="secondary">Editorial Playlist</Badge>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Actions</h3>
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
                </div>

                {/* Playlist ID */}
                <div>
                  <p className="text-xs text-muted-foreground">Playlist ID</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{selectedPlaylist.playlistId}</code>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
