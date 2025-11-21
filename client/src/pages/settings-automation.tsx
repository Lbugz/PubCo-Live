import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Play, Loader2 } from "lucide-react";

export default function SettingsAutomation() {
  const { toast } = useToast();

  const runPlaylistUpdateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/jobs/run-playlist-update", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to start playlist update");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Playlist Update Started",
        description: "The playlist update job is now running. Check the logs for progress.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start playlist update",
        variant: "destructive",
      });
    },
  });

  const runPerformanceSnapshotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/jobs/run-performance-snapshot", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to start performance snapshot");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Performance Snapshot Queued",
        description: data.message || "Enrichment jobs queued to refresh streaming data. Snapshots will be captured automatically when complete.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to queue performance snapshot",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Automation</h1>
      <p className="text-muted-foreground mb-6">
        Configure automation rules and schedules
      </p>
      
      <div className="space-y-4">
        <Card className="glass-panel p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Scheduled Jobs</h3>
              <p className="text-sm text-muted-foreground">
                Manually trigger scheduled automation jobs
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium mb-1">All Playlists Weekly Update</h4>
                  <p className="text-sm text-muted-foreground">
                    Scrapes and updates 4-5 playlists that haven't been updated in the last 7 days
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scheduled: Every 15 minutes on Fridays 10:00-12:00 UTC
                  </p>
                </div>
                <Button
                  onClick={() => runPlaylistUpdateMutation.mutate()}
                  disabled={runPlaylistUpdateMutation.isPending}
                  size="sm"
                  className="ml-4"
                  data-testid="button-run-playlist-update"
                >
                  {runPlaylistUpdateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Now
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Weekly Performance Snapshots</h4>
                  <p className="text-sm text-muted-foreground">
                    Captures Spotify streams and YouTube views for all contacts and tracks
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scheduled: Thursdays at 11:59 PM EST (Friday 4:59 AM UTC)
                  </p>
                </div>
                <Button
                  onClick={() => runPerformanceSnapshotMutation.mutate()}
                  disabled={runPerformanceSnapshotMutation.isPending}
                  size="sm"
                  className="ml-4"
                  data-testid="button-run-performance-snapshot"
                >
                  {runPerformanceSnapshotMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Now
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Failed Enrichment Retry</h4>
                  <p className="text-sm text-muted-foreground">
                    Retries failed or incomplete track enrichments (up to 100 tracks per day)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scheduled: Daily at 2:00 AM
                  </p>
                </div>
                <Button
                  disabled
                  size="sm"
                  variant="secondary"
                  className="ml-4"
                  data-testid="button-run-enrichment-retry"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Coming Soon
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
