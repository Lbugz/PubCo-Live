import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Database, Trash2, AlertTriangle, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface DataCounts {
  playlists: number;
  tracks: number;
  songwriters: number;
  tags: number;
  activities: number;
}

interface TrackedPlaylist {
  id: string;
  name: string;
  playlistId: string;
  totalTracks: number | null;
}

export default function SettingsDatabase() {
  const { toast } = useToast();
  const [selectedPlaylists, setSelectedPlaylists] = useState<Record<string, { deleteSongwriters: boolean }>>({});
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const { data: counts, isLoading: countsLoading } = useQuery<DataCounts>({
    queryKey: ['/api/data/counts'],
  });

  const { data: playlists, isLoading: playlistsLoading } = useQuery<TrackedPlaylist[]>({
    queryKey: ['/api/tracked-playlists'],
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest('/api/data/all', 'DELETE'),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "All data has been deleted successfully",
      });
      queryClient.invalidateQueries();
      setDeleteAllOpen(false);
      setConfirmText("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete all data",
        variant: "destructive",
      });
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: ({ playlistId, deleteSongwriters }: { playlistId: string; deleteSongwriters: boolean }) =>
      apiRequest(`/api/playlists/${playlistId}/cascade`, 'DELETE', { deleteSongwriters }),
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: data.message || "Playlist deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tracked-playlists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/data/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracks'] });
      setSelectedPlaylists({});
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete playlist",
        variant: "destructive",
      });
    },
  });

  const handleToggleSongwriterDelete = (playlistId: string) => {
    setSelectedPlaylists(prev => {
      const current = prev[playlistId] || { deleteSongwriters: false };
      return {
        ...prev,
        [playlistId]: { deleteSongwriters: !current.deleteSongwriters }
      };
    });
  };

  const handleDeletePlaylist = (playlist: TrackedPlaylist) => {
    const options = selectedPlaylists[playlist.playlistId] || { deleteSongwriters: false };
    deletePlaylistMutation.mutate({
      playlistId: playlist.playlistId,
      deleteSongwriters: options.deleteSongwriters
    });
  };

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2">Database & Storage</h1>
      <p className="text-muted-foreground mb-6">
        Manage database content and perform bulk operations
      </p>

      {/* Data Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Playlists</CardDescription>
            <CardTitle className="text-3xl">
              {countsLoading ? "..." : counts?.playlists.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Tracks</CardDescription>
            <CardTitle className="text-3xl">
              {countsLoading ? "..." : counts?.tracks.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Songwriters</CardDescription>
            <CardTitle className="text-3xl">
              {countsLoading ? "..." : counts?.songwriters.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Tags</CardDescription>
            <CardTitle className="text-3xl">
              {countsLoading ? "..." : counts?.tags.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Activities</CardDescription>
            <CardTitle className="text-3xl">
              {countsLoading ? "..." : counts?.activities.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Individual Playlist Deletion */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="h-5 w-5" />
            Delete Individual Playlists
          </CardTitle>
          <CardDescription>
            Remove specific playlists and optionally their associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {playlistsLoading ? (
            <p className="text-muted-foreground">Loading playlists...</p>
          ) : !playlists || playlists.length === 0 ? (
            <p className="text-muted-foreground">No tracked playlists found</p>
          ) : (
            <div className="space-y-3">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                  data-testid={`playlist-item-${playlist.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">{playlist.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {playlist.totalTracks !== null
                        ? `${playlist.totalTracks} tracks`
                        : "Track count unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedPlaylists[playlist.playlistId]?.deleteSongwriters || false}
                        onCheckedChange={() => handleToggleSongwriterDelete(playlist.playlistId)}
                        data-testid={`checkbox-delete-songwriters-${playlist.id}`}
                      />
                      Delete associated songwriters
                    </label>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          data-testid={`button-delete-playlist-${playlist.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Playlist?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete all tracks from "{playlist.name}".
                            {selectedPlaylists[playlist.playlistId]?.deleteSongwriters && (
                              <span className="block mt-2 text-destructive font-medium">
                                ⚠️ Songwriters linked only to this playlist will also be deleted.
                              </span>
                            )}
                            <span className="block mt-2">This action cannot be undone.</span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeletePlaylist(playlist)}
                            className="bg-destructive hover:bg-destructive/90"
                            data-testid="button-confirm-delete"
                          >
                            Delete Playlist
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible operations that affect all data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start justify-between p-4 rounded-lg border border-destructive/50 bg-destructive/5">
              <div>
                <p className="font-medium mb-1">Delete All Data</p>
                <p className="text-sm text-muted-foreground">
                  Permanently removes all playlists, tracks, songwriters, tags, and activities.
                  This cannot be undone.
                </p>
              </div>
              <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-delete-all-data">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Delete All Data?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-4">
                      <p>
                        This will permanently delete:
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>{counts?.playlists || 0} playlists</li>
                        <li>{counts?.tracks || 0} tracks</li>
                        <li>{counts?.songwriters || 0} songwriters</li>
                        <li>{counts?.tags || 0} tags</li>
                        <li>{counts?.activities || 0} activity records</li>
                      </ul>
                      <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4">
                        <p className="text-destructive font-semibold mb-2">
                          ⚠️ This action cannot be undone!
                        </p>
                        <p className="text-sm">
                          Type <Badge variant="destructive" className="mx-1">DELETE ALL</Badge> to confirm:
                        </p>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          className="w-full mt-2 px-3 py-2 border rounded-md"
                          placeholder="DELETE ALL"
                          data-testid="input-confirm-delete-all"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onClick={() => setConfirmText("")}
                      data-testid="button-cancel-delete-all"
                    >
                      Cancel
                    </AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={() => deleteAllMutation.mutate()}
                      disabled={confirmText !== "DELETE ALL" || deleteAllMutation.isPending}
                      data-testid="button-confirm-delete-all"
                    >
                      {deleteAllMutation.isPending ? "Deleting..." : "Delete All Data"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
