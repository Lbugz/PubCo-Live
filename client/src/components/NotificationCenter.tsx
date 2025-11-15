import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Check, X, CheckCheck } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function NotificationCenter() {
  useWebSocket({
    onJobCompleted: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
    onJobFailed: () => {
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
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 text-xs flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
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
          {isLoading ? (
            <div 
              className="flex items-center justify-center h-32 text-muted-foreground"
              data-testid="loading-notifications"
            >
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div 
              className="flex flex-col items-center justify-center h-32 text-muted-foreground"
              data-testid="empty-notifications"
            >
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p>No notifications</p>
            </div>
          ) : (
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
