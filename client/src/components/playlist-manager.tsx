import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ListMusic, CheckCircle2, XCircle, HelpCircle, Download, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type TrackedPlaylist } from "@shared/schema";

export function PlaylistManager() {
  const [open, setOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeName, setScrapeName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: playlists = [], isLoading } = useQuery<TrackedPlaylist[]>({
    queryKey: ["/api/tracked-playlists"],
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
      setPlaylistUrl("");
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

  const deletePlaylistMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/tracked-playlists/${id}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Playlist Removed",
        description: "Playlist is no longer being tracked",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove playlist",
        variant: "destructive",
      });
    },
  });

  const scrapePlaylistMutation = useMutation({
    mutationFn: async ({ url, name }: { url: string; name?: string }) => {
      const res = await apiRequest("POST", "/api/scrape-playlist", {
        playlistUrl: url,
        playlistName: name,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Playlist Scraped Successfully!",
        description: `Added ${data.tracksAdded} tracks from "${data.playlistName}"`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      setScrapeUrl("");
      setScrapeName("");
    },
    onError: (error: any) => {
      toast({
        title: "Scraping Failed",
        description: error.message || "Failed to scrape playlist",
        variant: "destructive",
      });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const res = await apiRequest("POST", "/api/playlists/bulk-import", { csvData });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk Import Complete!",
        description: `Successfully added ${data.successful} of ${data.total} playlists`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import playlists",
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
    if (!playlistUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Spotify playlist URL or ID",
        variant: "destructive",
      });
      return;
    }
    addPlaylistMutation.mutate(playlistUrl);
  };

  const handleScrapePlaylist = () => {
    if (!scrapeUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Spotify playlist URL",
        variant: "destructive",
      });
      return;
    }
    scrapePlaylistMutation.mutate({ url: scrapeUrl, name: scrapeName || undefined });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csvData = e.target?.result as string;
      bulkImportMutation.mutate(csvData);
    };
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getCompletenessBadge = (playlist: TrackedPlaylist) => {
    // Show method badge (API or Scraping)
    const methodBadge = playlist.isEditorial === 1 ? (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs">
        Scraping
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs">
        API
      </Badge>
    );

    // Show completeness status
    if (playlist.isComplete === 1 && playlist.totalTracks) {
      return (
        <div className="flex gap-1">
          {methodBadge}
          <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Complete ({playlist.lastFetchCount}/{playlist.totalTracks})
          </Badge>
        </div>
      );
    } else if (playlist.lastFetchCount && playlist.lastFetchCount > 0) {
      const totalInfo = playlist.totalTracks ? `/${playlist.totalTracks}` : '';
      return (
        <div className="flex gap-1">
          {methodBadge}
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 text-xs">
            <HelpCircle className="w-3 h-3 mr-1" />
            Partial ({playlist.lastFetchCount}{totalInfo})
          </Badge>
        </div>
      );
    } else {
      return (
        <div className="flex gap-1">
          {methodBadge}
          <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20 text-xs">
            Not Fetched
          </Badge>
        </div>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-manage-playlists">
          <ListMusic className="w-4 h-4" />
          Manage Playlists
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Tracked Playlists</DialogTitle>
          <DialogDescription>
            Add Spotify playlists to track for publishing leads. Paste a playlist URL or ID below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Bulk Import from CSV</Label>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs">
                Recommended
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a CSV file with playlists (Title, Official Spotify, Saves, Link, Chartmetric columns). All playlists will be added to tracked list.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              data-testid="input-csv-file"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={bulkImportMutation.isPending}
              className="w-full"
              variant="default"
              data-testid="button-upload-csv"
            >
              <Upload className="w-4 h-4 mr-2" />
              {bulkImportMutation.isPending ? "Importing..." : "Upload CSV File"}
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="playlist-url">Spotify Playlist URL or ID</Label>
            <div className="flex gap-2">
              <Input
                id="playlist-url"
                data-testid="input-playlist-url"
                placeholder="https://open.spotify.com/playlist/... or playlist ID"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddPlaylist();
                  }
                }}
              />
              <Button
                onClick={handleAddPlaylist}
                disabled={addPlaylistMutation.isPending}
                data-testid="button-add-playlist"
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Example: https://open.spotify.com/playlist/37i9dQZF1DWWjGdmeTyeJ6
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Fetch via Scraping</Label>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs">
                Fallback Option
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              For playlists that return 404 via API (e.g., editorial playlists like Fresh Finds). Uses web scraping - slower but works for restricted playlists.
            </p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="scrape-url"
                  data-testid="input-scrape-url"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      handleScrapePlaylist();
                    }
                  }}
                />
              </div>
              <Input
                id="scrape-name"
                data-testid="input-scrape-name"
                placeholder="Playlist name (optional, auto-detected if left empty)"
                value={scrapeName}
                onChange={(e) => setScrapeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleScrapePlaylist();
                  }
                }}
              />
              <Button
                onClick={handleScrapePlaylist}
                disabled={scrapePlaylistMutation.isPending}
                className="w-full"
                variant="secondary"
                data-testid="button-scrape-playlist"
              >
                <Download className="w-4 h-4 mr-2" />
                {scrapePlaylistMutation.isPending ? "Scraping..." : "Fetch via Scraping"}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Tracked Playlists ({playlists.length})</Label>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : playlists.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-muted-foreground text-center">
                  No playlists tracked yet. Add your first playlist above!
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {playlists.map((playlist) => (
                  <Card
                    key={playlist.id}
                    className="p-3 flex items-center justify-between gap-3"
                    data-testid={`playlist-${playlist.id}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{playlist.name}</p>
                        {getCompletenessBadge(playlist)}
                      </div>
                      <a
                        href={playlist.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline truncate block"
                        data-testid={`link-playlist-${playlist.id}`}
                      >
                        {playlist.spotifyUrl}
                      </a>
                      {playlist.totalTracks && (
                        <p className="text-xs text-muted-foreground">
                          Total tracks: {playlist.totalTracks}
                          {playlist.lastChecked && ` • Last checked: ${new Date(playlist.lastChecked).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePlaylistMutation.mutate(playlist.id)}
                      disabled={deletePlaylistMutation.isPending}
                      data-testid={`button-delete-${playlist.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
