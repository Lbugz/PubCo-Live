import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, ListMusic } from "lucide-react";
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
import { type TrackedPlaylist } from "@shared/schema";

export function PlaylistManager() {
  const [open, setOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
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
        playlistId: playlistId,
        spotifyUrl: `https://open.spotify.com/playlist/${playlistId}`,
      });
      
      const playlist: TrackedPlaylist = await res.json();
      return playlist;
    },
    onSuccess: (data: TrackedPlaylist) => {
      toast({
        title: "Playlist Added!",
        description: `Now tracking "${data.name}"`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
      setPlaylistUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
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
      throw new Error("Failed to fetch playlist info from Spotify");
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
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{playlist.name}</p>
                      <a
                        href={playlist.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline truncate block"
                        data-testid={`link-playlist-${playlist.id}`}
                      >
                        {playlist.spotifyUrl}
                      </a>
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
