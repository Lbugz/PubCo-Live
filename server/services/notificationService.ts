import { db } from "../db";
import { systemNotifications, type InsertSystemNotification } from "@shared/schema";
import { desc, eq, and, sql } from "drizzle-orm";

export class NotificationService {
  async createNotification(notification: InsertSystemNotification) {
    const [created] = await db
      .insert(systemNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getUnreadNotifications(limit: number = 10) {
    return db
      .select()
      .from(systemNotifications)
      .where(eq(systemNotifications.read, 0))
      .orderBy(desc(systemNotifications.createdAt))
      .limit(limit);
  }

  async getAllNotifications(limit: number = 50) {
    return db
      .select()
      .from(systemNotifications)
      .orderBy(desc(systemNotifications.createdAt))
      .limit(limit);
  }

  async getUnreadCount() {
    const result = await db
      .select()
      .from(systemNotifications)
      .where(eq(systemNotifications.read, 0));
    return result.length;
  }

  async markAsRead(notificationId: string) {
    await db
      .update(systemNotifications)
      .set({ read: 1 })
      .where(eq(systemNotifications.id, notificationId));
  }

  async markAllAsRead() {
    await db
      .update(systemNotifications)
      .set({ read: 1 })
      .where(eq(systemNotifications.read, 0));
  }

  async clearAll() {
    await db.delete(systemNotifications);
  }

  async clearOlderThan(days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    await db
      .delete(systemNotifications)
      .where(and(
        eq(systemNotifications.read, 1),
        sql`${systemNotifications.createdAt} < ${cutoffDate.toISOString()}`
      ));
  }

  // Helper methods for common notification types
  async notifyEnrichmentComplete(playlistId: string, playlistName: string, trackCount: number) {
    return this.createNotification({
      type: 'enrichment_complete',
      title: 'Enrichment Complete',
      message: `${playlistName} · ${trackCount} tracks enriched`,
      playlistId,
      metadata: JSON.stringify({ trackCount }),
      read: 0,
    });
  }

  async notifyEnrichmentFailed(playlistId: string, playlistName: string, error: string) {
    return this.createNotification({
      type: 'enrichment_failed',
      title: 'Enrichment Failed',
      message: `${playlistName} · ${error}`,
      playlistId,
      metadata: JSON.stringify({ error }),
      read: 0,
    });
  }

  async notifyAutomationComplete(automationName: string, details: string) {
    return this.createNotification({
      type: 'automation_complete',
      title: 'Automation Complete',
      message: `${automationName} · ${details}`,
      metadata: JSON.stringify({ automationName, details }),
      read: 0,
    });
  }

  async notifyPlaylistError(playlistId: string, playlistName: string, error: string) {
    return this.createNotification({
      type: 'playlist_error',
      title: 'Playlist Error',
      message: `${playlistName} · ${error}`,
      playlistId,
      metadata: JSON.stringify({ error }),
      read: 0,
    });
  }

  async notifySystemAlert(title: string, message: string) {
    return this.createNotification({
      type: 'system_alert',
      title,
      message,
      metadata: null,
      read: 0,
    });
  }
}

export const notificationService = new NotificationService();
