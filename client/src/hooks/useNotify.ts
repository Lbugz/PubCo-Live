import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Unified Notification API
 * 
 * Tier 1: Toast - Immediate user action feedback (auto-dismiss 5s)
 * Tier 2: System - Persistent notifications for background events
 * Tier 3: WebSocket - Live job progress (handled by NotificationCenter)
 */

interface ToastOptions {
  title?: string;
  message: string;
  variant?: "default" | "success" | "info" | "warning" | "destructive";
}

interface SystemNotificationOptions {
  type: "enrichment_complete" | "automation_complete" | "enrichment_failed" | "system_alert";
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export function useNotify() {
  /**
   * Tier 1: Show a toast notification for immediate user feedback
   * Use for: CRUD operations, form submissions, button clicks
   * Auto-dismisses after 5 seconds
   */
  const showToast = ({ title, message, variant = "default" }: ToastOptions) => {
    toast({
      title,
      description: message,
      variant,
      duration: 5000, // Auto-dismiss after 5 seconds
    });
  };

  /**
   * Tier 2: Create a persistent system notification
   * Use for: Job completions, automation results, system alerts
   * Note: This creates a DB record and broadcasts via WebSocket
   */
  const createSystemNotification = async (options: SystemNotificationOptions) => {
    try {
      await apiRequest("POST", "/api/notifications", options);
    } catch (error) {
      console.error("Failed to create system notification:", error);
    }
  };

  /**
   * Convenience methods for common use cases
   */
  const notify = {
    // Toast methods (Tier 1)
    toast: showToast,
    
    success: (message: string, title?: string) => 
      showToast({ message, title, variant: "success" }),
    
    error: (message: string, title?: string) => 
      showToast({ message, title, variant: "destructive" }),
    
    info: (message: string, title?: string) => 
      showToast({ message, title, variant: "info" }),
    
    warning: (message: string, title?: string) => 
      showToast({ message, title, variant: "warning" }),

    // System notification methods (Tier 2)
    system: createSystemNotification,
    
    jobComplete: (playlistName: string, tracksEnriched: number) => 
      createSystemNotification({
        type: "enrichment_complete",
        title: `${playlistName} · Completed`,
        message: `${tracksEnriched} tracks enriched successfully`,
        metadata: { playlistName, tracksEnriched },
      }),
    
    jobFailed: (playlistName: string, error: string) => 
      createSystemNotification({
        type: "enrichment_failed",
        title: `${playlistName} · Failed`,
        message: error,
        metadata: { playlistName, error },
      }),
  };

  return notify;
}
