import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Check, X, CheckCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useWebSocket } from "@/hooks/use-websocket";

interface SystemNotification {
  id: string;
  type: "enrichment_complete" | "automation_complete" | "enrichment_failed";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: {
    playlistId?: string;
    playlistName?: string;
    tracksEnriched?: number;
    error?: string;
  };
}

interface ActiveJob {
  jobId: string;
  playlistName?: string;
  trackCount: number;
  enrichedCount: number;
  phase: number;
  status: 'running' | 'success' | 'error';
  startTime: number;
  completedAt?: number;
  errorMessage?: string;
}

export function NotificationCenter() {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for elapsed time display
  useEffect(() => {
    const hasRunningJobs = activeJobs.some(job => job.status === 'running');
    if (!hasRunningJobs) return;
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeJobs]);

  useWebSocket({
    onConnected: () => {
      console.log('NotificationCenter: WebSocket connected');
    },
    onJobStarted: (data) => {
      console.log('NotificationCenter: Job started', data);
      setActiveJobs(prev => {
        const exists = prev.some(job => job.jobId === data.jobId);
        if (exists) return prev;
        return [...prev, {
          jobId: data.jobId || '',
          playlistName: data.playlistName,
          trackCount: data.trackCount || 0,
          enrichedCount: 0,
          phase: 1,
          status: 'running',
          startTime: Date.now(),
        }];
      });
    },
    onEnrichmentProgress: (data) => {
      console.log('NotificationCenter: Enrichment progress', data);
      if (data.jobId) {
        setActiveJobs(prev => prev.map(job =>
          job.jobId === data.jobId
            ? { ...job, enrichedCount: data.enrichedCount || 0 }
            : job
        ));
      }
    },
    onPhaseStarted: (data) => {
      console.log('NotificationCenter: Phase started', data);
      if (data.jobId) {
        setActiveJobs(prev => prev.map(job =>
          job.jobId === data.jobId
            ? { ...job, phase: data.phase || 1 }
            : job
        ));
      }
    },
    onJobCompleted: (data) => {
      console.log('NotificationCenter: Job completed', data);
      setActiveJobs(prev => prev.map(job =>
        job.jobId === data.jobId
          ? { ...job, status: data.success ? 'success' : 'error', enrichedCount: data.tracksEnriched || job.trackCount, completedAt: Date.now() }
          : job
      ));
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
    onJobFailed: (data) => {
      console.log('NotificationCenter: Job failed', data);
      setActiveJobs(prev => prev.map(job =>
        job.jobId === data.jobId
          ? { ...job, status: 'error', errorMessage: data.error, completedAt: Date.now() }
          : job
      ));
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const { data: notifications = [], isLoading } = useQuery<SystemNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 30000,
  });

  const unreadCount = countData?.count || 0;
  const activeJobsCount = activeJobs.filter(job => job.status === 'running').length;
  const totalBadgeCount = unreadCount + activeJobsCount;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", "/api/notifications"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  const handleClearAll = () => {
    clearAllMutation.mutate();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "enrichment_complete":
        return "✅";
      case "automation_complete":
        return "🤖";
      case "enrichment_failed":
        return "❌";
      default:
        return "📢";
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {totalBadgeCount > 0 && (
            <Badge
              variant={activeJobsCount > 0 ? "info" : "destructive"}
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 text-xs flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {totalBadgeCount > 9 ? "9+" : totalBadgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-96 p-0" 
        align="end"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold" data-testid="text-notifications-title">
            Notifications
          </h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={clearAllMutation.isPending}
                data-testid="button-clear-all"
              >
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {/* Active Jobs Section */}
          {activeJobs.length > 0 && (
            <div className="divide-y border-b">
              {activeJobs.map((job) => {
                const progress = job.trackCount > 0 
                  ? Math.round((job.enrichedCount / job.trackCount) * 100)
                  : 0;
                const isComplete = job.status === 'success' || job.status === 'error';
                const elapsed = isComplete && job.completedAt
                  ? job.completedAt - job.startTime
                  : currentTime - job.startTime;
                const elapsedSeconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(elapsedSeconds / 60);
                const seconds = elapsedSeconds % 60;
                
                return (
                  <div
                    key={job.jobId}
                    className={cn(
                      "p-4",
                      job.status === 'running' && "bg-primary/5",
                      job.status === 'success' && "bg-status-low/10",
                      job.status === 'error' && "bg-destructive/10"
                    )}
                    data-testid={`active-job-${job.jobId}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm" data-testid={`job-title-${job.jobId}`}>
                            {job.playlistName || 'Enrichment Job'}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
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
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {job.status === 'running' && (
                        <>
                          <Progress value={progress} className="h-2" />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{job.enrichedCount} / {job.trackCount} tracks</span>
                            <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>
                          </div>
                        </>
                      )}
                      
                      {job.status === 'success' && (
                        <p className="text-xs text-status-low">
                          Enriched {job.enrichedCount} tracks in {minutes}:{seconds.toString().padStart(2, '0')}
                        </p>
                      )}
                      
                      {job.status === 'error' && job.errorMessage && (
                        <p className="text-xs text-destructive">
                          {job.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notifications Section */}
          {isLoading && (
            <div 
              className="flex items-center justify-center h-32 text-muted-foreground"
              data-testid="loading-notifications"
            >
              Loading notifications...
            </div>
          )}
          
          {!isLoading && notifications.length === 0 && activeJobs.length === 0 && (
            <div 
              className="flex flex-col items-center justify-center h-32 text-muted-foreground"
              data-testid="empty-notifications"
            >
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p>No notifications</p>
            </div>
          )}
          
          {!isLoading && notifications.length > 0 && (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-4 hover-elevate cursor-pointer transition-colors",
                    !notification.isRead && "bg-primary/5"
                  )}
                  onClick={() => !notification.isRead && handleMarkAsRead(notification.id)}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl" data-testid={`icon-${notification.type}`}>
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 
                          className="font-medium text-sm"
                          data-testid={`title-${notification.id}`}
                        >
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <div 
                            className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1"
                            data-testid={`unread-dot-${notification.id}`}
                          />
                        )}
                      </div>
                      <p 
                        className="text-sm text-muted-foreground mt-1"
                        data-testid={`message-${notification.id}`}
                      >
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span 
                          className="text-xs text-muted-foreground"
                          data-testid={`time-${notification.id}`}
                        >
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(notification.id);
                            }}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
