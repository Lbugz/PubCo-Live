import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { type TrackedPlaylist } from "@shared/schema";
import { Loader2 } from "lucide-react";

interface AddPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaylistsAdded?: (playlistIds: string[]) => void;
}

export function AddPlaylistDialog({ open, onOpenChange, onPlaylistsAdded }: AddPlaylistDialogProps) {
  const [playlistInput, setPlaylistInput] = useState("");
  const { toast } = useToast();

  const extractPlaylistId = (urlOrId: string): string | null => {
    const trimmed = urlOrId.trim();
    const urlMatch = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    if (/^[a-zA-Z0-9]+$/.test(trimmed)) return trimmed;
    return null;
  };

  const addPlaylistsMutation = useMutation({
    mutationFn: async (urls: string[]): Promise<{
      successes: TrackedPlaylist[];
      failures: Array<{ url: string; error: string }>;
    }> => {
      const successes: TrackedPlaylist[] = [];
      const failures: Array<{ url: string; error: string }> = [];
      
      for (const url of urls) {
        try {
          const playlistId = extractPlaylistId(url);
          if (!playlistId) {
            failures.push({ url, error: "Invalid Spotify playlist URL or ID" });
            continue;
          }

          const res = await apiRequest("POST", "/api/tracked-playlists", {
            name: "Untitled Playlist",
            playlistId: playlistId,
            spotifyUrl: `https://open.spotify.com/playlist/${playlistId}`,
          });
          
          const playlist: TrackedPlaylist = await res.json();
          successes.push(playlist);
        } catch (error: any) {
          failures.push({ url, error: error.message || "Failed to add playlist" });
        }
      }
      
      return { successes, failures };
    },
    onSuccess: (result) => {
      const { successes, failures } = result;
      
      // Always invalidate queries to show newly added playlists
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
      
      // Trigger automatic fetch/enrichment for successful additions
      if (successes.length > 0 && onPlaylistsAdded) {
        const spotifyPlaylistIds = successes.map(p => p.playlistId);
        onPlaylistsAdded(spotifyPlaylistIds);
      }
      
      if (successes.length > 0 && failures.length === 0) {
        // All succeeded
        toast({
          title: "Playlists Added!",
          description: `Successfully added ${successes.length} playlist${successes.length > 1 ? 's' : ''}. Fetching tracks...`,
        });
        setPlaylistInput("");
        onOpenChange(false);
      } else if (successes.length > 0 && failures.length > 0) {
        // Partial success - show detailed failure info
        const failedUrls = failures.map(f => `• ${f.url.substring(0, 30)}... - ${f.error}`).join('\n');
        toast({
          title: "Partial Success",
          description: `Added ${successes.length} playlist${successes.length > 1 ? 's' : ''}. ${failures.length} failed:\n${failedUrls.substring(0, 200)}`,
          variant: "default",
        });
      } else {
        // All failed - show detailed error info
        const failedUrls = failures.map(f => `• ${f.url.substring(0, 30)}...: ${f.error}`).join('\n');
        toast({
          title: "All Playlists Failed",
          description: failedUrls.substring(0, 200),
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      // This should rarely happen now since we catch individual errors
      toast({
        title: "Error",
        description: error.message || "Failed to add playlists",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const urls = playlistInput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (urls.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one Spotify playlist URL or ID",
        variant: "destructive",
      });
      return;
    }
    
    addPlaylistsMutation.mutate(urls);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl">Add Spotify Playlist</DialogTitle>
          <DialogDescription className="text-base">
            Enter a Spotify playlist URL or ID to start tracking it
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="playlist-input" className="text-sm font-medium">
              Playlist URL or ID
            </Label>
            <Textarea
              id="playlist-input"
              data-testid="input-playlist-urls"
              placeholder="https://open.spotify.com/playlist/..."
              value={playlistInput}
              onChange={(e) => setPlaylistInput(e.target.value)}
              className="min-h-[120px] resize-none font-mono text-sm"
              disabled={addPlaylistsMutation.isPending}
            />
            <p className="text-sm text-muted-foreground">
              Add multiple playlists by entering one URL or ID per line
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Tracks will be automatically fetched and enriched with songwriter credits, streaming stats, and industry data.
            </p>
          </div>

          <Button
            type="submit"
            disabled={addPlaylistsMutation.isPending}
            className="w-full"
            size="lg"
            data-testid="button-add-playlists"
          >
            {addPlaylistsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding Playlists...
              </>
            ) : (
              "Add Playlist"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
