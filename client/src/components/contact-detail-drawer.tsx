import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  X, Mail, MessageCircle, RefreshCw, Edit, TrendingUp, Music, Activity, 
  FileText, ExternalLink, Instagram, Twitter, Music2, Flame, User, Clock,
  Hash, Link as LinkIcon, Target
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ContactWithSongwriter, PlaylistSnapshot } from "@shared/schema";

const STAGE_CONFIG = {
  discovery: {
    label: "Discovery",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  watch: {
    label: "Watch List",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  search: {
    label: "Active Search",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
};

interface ContactDetailDrawerProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailDrawer({ contactId, open, onOpenChange }: ContactDetailDrawerProps) {
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [activeTab, setActiveTab] = useState("tracks");

  // Fetch contact details
  const { data: contact, isLoading: loadingContact } = useQuery<ContactWithSongwriter>({
    queryKey: ["/api/contacts", contactId],
    queryFn: async () => {
      if (!contactId) throw new Error("No contact ID");
      const response = await fetch(`/api/contacts/${contactId}`);
      if (!response.ok) throw new Error("Failed to fetch contact");
      return response.json();
    },
    enabled: !!contactId && open,
  });

  // Fetch contact's tracks
  const { data: tracks = [], isLoading: loadingTracks } = useQuery<PlaylistSnapshot[]>({
    queryKey: ["/api/contacts", contactId, "tracks"],
    queryFn: async () => {
      if (!contactId) return [];
      const response = await fetch(`/api/contacts/${contactId}/tracks`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!contactId && open && activeTab === "tracks",
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async (updates: any) => {
      if (!contactId) throw new Error("No contact ID");
      return apiRequest("PATCH", `/api/contacts/${contactId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact updated",
        description: "Contact has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contact",
        variant: "destructive",
      });
    },
  });

  const handleStageChange = (newStage: string) => {
    updateContactMutation.mutate({ stage: newStage });
  };

  const handleHotLeadToggle = () => {
    if (!contact) return;
    updateContactMutation.mutate({ hotLead: contact.hotLead > 0 ? 0 : 1 });
  };

  const saveNoteMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!contactId) throw new Error("No contact ID");
      return apiRequest("POST", `/api/contacts/${contactId}/notes`, { text });
    },
    onSuccess: () => {
      toast({
        title: "Note saved",
        description: "Your note has been saved successfully",
      });
      setNoteText("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save note",
        variant: "destructive",
      });
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    saveNoteMutation.mutate(noteText);
  };

  const formatNumber = (num: number) => num.toLocaleString();
  const formatDate = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString();
  };
  
  const getTimeInStage = (stageUpdatedAt: string | Date) => {
    const updated = typeof stageUpdatedAt === 'string' ? new Date(stageUpdatedAt) : stageUpdatedAt;
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day";
    if (diffDays < 7) return `${diffDays} days`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
    return `${Math.floor(diffDays / 30)} months`;
  };

  if (!open || !contactId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="sheet-contact-detail">
        {loadingContact ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : contact ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <SheetTitle className="text-2xl" data-testid="text-contact-name">
                    {contact.songwriterName}
                  </SheetTitle>
                </div>
              </div>
            </SheetHeader>

            {/* Engagement Snapshot Hero */}
            <Card className="p-5 mt-4 bg-muted/50">
              <h3 className="text-sm font-medium mb-4 text-muted-foreground">Engagement Snapshot</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Stage</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      STAGE_CONFIG[contact.stage as keyof typeof STAGE_CONFIG]?.color
                    )}
                    data-testid="badge-contact-stage"
                  >
                    {STAGE_CONFIG[contact.stage as keyof typeof STAGE_CONFIG]?.label || contact.stage}
                  </Badge>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Time in Stage</span>
                  </div>
                  <div className="text-sm font-medium">{getTimeInStage(contact.stageUpdatedAt)}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Music className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Tracked Tracks</span>
                  </div>
                  <div className="text-sm font-medium" data-testid="text-total-tracks">{contact.totalTracks || 0}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="text-xs text-muted-foreground">Hot Lead</span>
                  </div>
                  <div className="text-sm font-medium">
                    {contact.hotLead > 0 ? (
                      <Badge variant="default" className="gap-1" data-testid="badge-hot-lead">
                        <Flame className="h-3 w-3" />
                        Yes
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Info Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* Performance Pulse */}
              <Card className="p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Performance Pulse
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total Streams</div>
                    <div className="text-xl font-bold" data-testid="text-total-streams">
                      {formatNumber(contact.totalStreams || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Track Count</div>
                    <div className="text-xl font-bold">{contact.totalTracks || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">WoW Growth</div>
                    <div className={cn(
                      "text-xl font-bold",
                      contact.wowGrowthPct !== null && contact.wowGrowthPct > 0 && "text-chart-2",
                      contact.wowGrowthPct !== null && contact.wowGrowthPct < 0 && "text-red-400"
                    )} data-testid="text-wow-growth">
                      {contact.wowGrowthPct !== null ? `${contact.wowGrowthPct > 0 ? "+" : ""}${contact.wowGrowthPct}%` : "—"}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Relationship Panel */}
              <Card className="p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Relationship
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Owner</div>
                    <div className="text-sm font-medium">Unassigned</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Created</div>
                    <div className="text-sm font-medium">{formatDate(contact.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Last Updated</div>
                    <div className="text-sm font-medium">{formatDate(contact.updatedAt)}</div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                data-testid="button-send-email"
              >
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                data-testid="button-send-dm"
              >
                <MessageCircle className="h-4 w-4" />
                Send DM
              </Button>
              <Button
                variant={contact.hotLead > 0 ? "secondary" : "outline"}
                size="sm"
                className="gap-2"
                onClick={handleHotLeadToggle}
                data-testid="button-toggle-hot-lead"
              >
                <Flame className="h-4 w-4" />
                {contact.hotLead > 0 ? "Remove Hot Lead" : "Mark Hot Lead"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-re-enrich"
              >
                <RefreshCw className="h-4 w-4" />
                Re-Enrich
              </Button>
            </div>

            {/* Stage Selector */}
            <div className="mt-4">
              <label className="text-sm font-medium mb-2 block">Pipeline Stage</label>
              <Select value={contact.stage} onValueChange={handleStageChange}>
                <SelectTrigger data-testid="select-change-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discovery">Discovery Pool</SelectItem>
                  <SelectItem value="watch">Watch List</SelectItem>
                  <SelectItem value="search">Active Search</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Identifiers Card */}
            <Card className="p-4 mt-4">
              <h3 className="text-sm font-medium mb-3">Identifiers</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Contact ID</span>
                  </div>
                  <span className="text-sm font-mono">{contact.id.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Songwriter ID</span>
                  </div>
                  <span className="text-sm font-mono">{contact.songwriterId.slice(0, 8)}...</span>
                </div>
                {contact.songwriterChartmetricId && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Chartmetric ID</span>
                    </div>
                    <Button variant="link" size="sm" className="h-auto p-0 text-sm" asChild>
                      <a 
                        href={`https://app.chartmetric.com/artist/${contact.songwriterChartmetricId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {contact.songwriterChartmetricId}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="tracks" data-testid="tab-tracks">
                  <Music className="h-4 w-4 mr-2" />
                  Tracks
                </TabsTrigger>
                <TabsTrigger value="performance" data-testid="tab-performance">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">
                  <Activity className="h-4 w-4 mr-2" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes">
                  <FileText className="h-4 w-4 mr-2" />
                  Notes
                </TabsTrigger>
              </TabsList>

              {/* Tracks Tab */}
              <TabsContent value="tracks" className="space-y-3">
                {loadingTracks ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : tracks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Music className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No tracks found</p>
                  </div>
                ) : (
                  tracks.map((track) => (
                    <Card key={track.id} className="p-4 hover-elevate" data-testid={`card-track-${track.id}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium mb-1" data-testid={`text-track-name-${track.id}`}>
                            {track.trackName}
                          </h4>
                          <p className="text-sm text-muted-foreground" data-testid={`text-track-artist-${track.id}`}>
                            {track.artistName}
                          </p>
                          {track.spotifyStreams && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatNumber(track.spotifyStreams)} streams
                            </p>
                          )}
                        </div>
                        {track.albumArt && (
                          <img
                            src={track.albumArt}
                            alt={track.trackName}
                            className="w-12 h-12 rounded object-cover"
                          />
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance" className="space-y-4">
                <Card className="p-4">
                  <h3 className="text-sm font-medium mb-3">Performance Metrics</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Streams</span>
                      <span className="font-medium">{formatNumber(contact.totalStreams || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Week-over-Week Growth</span>
                      <span className={cn(
                        "font-medium",
                        contact.wowGrowthPct !== null && contact.wowGrowthPct > 0 && "text-chart-2",
                        contact.wowGrowthPct !== null && contact.wowGrowthPct < 0 && "text-red-400"
                      )}>
                        {contact.wowGrowthPct !== null ? `${contact.wowGrowthPct > 0 ? "+" : ""}${contact.wowGrowthPct}%` : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Tracks</span>
                      <span className="font-medium">{contact.totalTracks || 0}</span>
                    </div>
                  </div>
                </Card>
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Detailed performance charts coming soon</p>
                </div>
              </TabsContent>

              {/* Activity Timeline Tab */}
              <TabsContent value="activity" className="space-y-3">
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Contact created</p>
                      <p className="text-xs text-muted-foreground">{formatDate(contact.createdAt)}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted mt-2" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Stage updated to {STAGE_CONFIG[contact.stage as keyof typeof STAGE_CONFIG]?.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(contact.stageUpdatedAt)}</p>
                    </div>
                  </div>
                </Card>
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Detailed activity timeline coming soon</p>
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium">Add New Note</label>
                  <Textarea
                    placeholder="Write your note here..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={4}
                    data-testid="textarea-note"
                  />
                  <Button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || saveNoteMutation.isPending}
                    data-testid="button-save-note"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {saveNoteMutation.isPending ? "Saving..." : "Save Note"}
                  </Button>
                </div>
                <Separator />
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notes yet</p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Contact not found</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
