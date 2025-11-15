import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export interface EnrichmentJob {
  jobId: string;
  playlistName?: string;
  trackCount: number;
  enrichedCount: number;
  phase: number;
  status: 'running' | 'success' | 'error';
  errorMessage?: string;
  startTime: number;
  completedAt?: number;
}

interface ActivityPanelProps {
  jobs: EnrichmentJob[];
  onDismiss?: (jobId: string) => void;
  className?: string;
}

const phaseNames = {
  1: 'Spotify API',
  2: 'Credits scraping',
  3: 'MLC lookup',
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function ActivityPanel({ jobs, onDismiss, className }: ActivityPanelProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const hasRunningJobs = jobs.some(job => job.status === 'running');

  // Update current time every second to refresh elapsed times, but only if there are running jobs
  useEffect(() => {
    if (!hasRunningJobs) return;
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [hasRunningJobs]);

  if (jobs.length === 0) return null;

  return (
    <div className={cn("fixed bottom-4 right-4 w-96 z-50 space-y-2", className)}>
      {jobs.map((job) => {
        const progress = job.trackCount > 0 
          ? Math.round((job.enrichedCount / job.trackCount) * 100)
          : 0;
        const isComplete = job.status === 'success' || job.status === 'error';
        // Use completedAt for finished jobs to freeze elapsed time, currentTime for running jobs
        const elapsed = isComplete && job.completedAt 
          ? job.completedAt - job.startTime 
          : currentTime - job.startTime;
        
        return (
          <Card 
            key={job.jobId} 
            className={cn(
              "shadow-lg",
              job.status === 'success' && "border-l-4 border-l-green-500",
              job.status === 'error' && "border-l-4 border-l-destructive"
            )}
            data-testid={`activity-job-${job.jobId}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <CardTitle className="text-sm font-medium">
                    {job.playlistName || 'Enrichment Job'}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {job.status === 'running' && (
                      <Badge variant="info" className="text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Phase {job.phase}/3
                      </Badge>
                    )}
                    {job.status === 'success' && (
                      <Badge variant="success" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    )}
                    {job.status === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </div>
                </div>
                {onDismiss && isComplete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 -mt-1"
                    onClick={() => onDismiss(job.jobId)}
                    data-testid={`button-dismiss-${job.jobId}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {job.status === 'running' && (
                <>
                  <Progress value={progress} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{job.enrichedCount}/{job.trackCount} tracks</span>
                    <span>{phaseNames[job.phase as keyof typeof phaseNames]}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Elapsed: {formatDuration(elapsed)}
                  </div>
                </>
              )}
              {job.status === 'success' && (
                <p className="text-sm text-muted-foreground">
                  {job.enrichedCount} tracks enriched · {formatDuration(elapsed)}
                </p>
              )}
              {job.status === 'error' && (
                <p className="text-sm text-destructive">
                  {job.errorMessage || 'An error occurred during enrichment'}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
