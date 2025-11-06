import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Music2, Download, Calendar, TrendingUp, ListMusic, Target, RefreshCw, Sparkles, BarChart3 } from "lucide-react";
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
import { type PlaylistSnapshot, type Tag } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Dashboard() {
  const [selectedWeek, setSelectedWeek] = useState<string>("latest");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scoreRange, setScoreRange] = useState<number[]>([0, 10]);
  const { toast } = useToast();

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

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const { data: spotifyStatus, refetch: refetchSpotifyStatus } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/spotify/status"],
    refetchInterval: 3000, // Poll every 3s to check auth status
  });

  const fetchPlaylistsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/fetch-playlists", {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success!",
        description: `Fetched ${data.tracksAdded} tracks from Spotify for week ${data.week}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch playlists",
        variant: "destructive",
      });
    },
  });

  const enrichMetadataMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/enrich-metadata", {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Enrichment Complete!",
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

  const filteredTracks = tracks?.filter((track) => {
    const matchesPlaylist = selectedPlaylist === "all" || track.playlistName === selectedPlaylist;
    const matchesSearch = 
      searchQuery === "" ||
      track.trackName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artistName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.label?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesScore = track.unsignedScore >= scoreRange[0] && track.unsignedScore <= scoreRange[1];
    return matchesPlaylist && matchesSearch && matchesScore;
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
                <Button
                  onClick={() => fetchPlaylistsMutation.mutate()}
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
                </Button>
              )}
              <Button
                onClick={() => enrichMetadataMutation.mutate()}
                variant="secondary"
                size="default"
                className="gap-2"
                disabled={enrichMetadataMutation.isPending || !tracks || tracks.length === 0}
                data-testid="button-enrich"
              >
                <Sparkles className={`h-4 w-4 ${enrichMetadataMutation.isPending ? "animate-pulse" : ""}`} />
                <span className="hidden md:inline">
                  {enrichMetadataMutation.isPending ? "Enriching..." : "Enrich"}
                </span>
              </Button>
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
                      {playlists?.map((playlist) => (
                        <SelectItem key={playlist} value={playlist} data-testid={`option-playlist-${playlist}`}>
                          {playlist}
                        </SelectItem>
                      ))}
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

          <TrackTable tracks={filteredTracks} isLoading={tracksLoading} />
        </div>
      </main>
    </div>
  );
}
