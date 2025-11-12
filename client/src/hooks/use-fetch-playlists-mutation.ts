import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useFetchPlaylistsMutation() {
  const { toast } = useToast();

  const fetchPlaylistsMutation = useMutation({
    mutationFn: async ({ mode = 'all', playlistId }: { mode?: string; playlistId?: string }) => {
      console.log("Starting fetch playlists mutation...", { mode, playlistId });
      const response = await apiRequest("POST", "/api/fetch-playlists", { mode, playlistId });
      return await response.json();
    },
    onSuccess: (data: any) => {
      console.log("Fetch playlists mutation success:", data);
      
      const totalTracks = data.completenessResults?.reduce(
        (sum: number, r: any) => sum + (r.fetchCount || 0), 
        0
      ) || 0;
      const totalSkipped = data.completenessResults?.reduce(
        (sum: number, r: any) => sum + (r.skipped || 0), 
        0
      ) || 0;

      toast({
        title: "Playlist data fetched successfully",
        description: data.completenessResults
          ?.map((r: any) => `${r.name}: ${r.fetchCount} new tracks added, ${r.skipped} duplicates skipped`)
          .join('\n') || `${totalTracks} tracks fetched`,
      });

      // Invalidate all related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["/api/playlist-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/playlists"] });
    },
    onError: (error: Error) => {
      console.error("Fetch playlists mutation error:", error);
      toast({
        title: "Fetch failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return fetchPlaylistsMutation;
}
