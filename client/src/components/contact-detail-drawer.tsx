import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Mail, MessageCircle, RefreshCw, TrendingUp, Music, Activity, 
  FileText, ExternalLink, Instagram, Twitter, Flame, Edit,
  Phone, Hash, Building, User as UserIcon, Award, Target, Check, X, Share2,
  Truck, Star, Package, Database, CheckCircle
} from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Helper function to get the most common value from tracks
function getMostCommon(values: (string | null)[]): string | null {
  const filtered = values.filter((v): v is string => v !== null && v !== undefined && v !== '');
  if (filtered.length === 0) return null;
  
  const counts = filtered.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// Helper function to aggregate contact info from tracks
function aggregateContactInfo(tracks: PlaylistSnapshot[]) {
  return {
    email: getMostCommon(tracks.map(t => t.email)),
    instagram: getMostCommon(tracks.map(t => t.instagram)),
    twitter: getMostCommon(tracks.map(t => t.twitter)),
    tiktok: getMostCommon(tracks.map(t => t.tiktok)),
    iswc: getMostCommon(tracks.map(t => t.iswc)),
    ipiNumber: getMostCommon(tracks.map(t => t.ipiNumber)),
    publisher: getMostCommon(tracks.map(t => t.publisher)),
    administrators: getMostCommon(tracks.map(t => t.administrators)),
  };
}

// Generate summary sentence based on categories and confidence
function generateScoreSummary(
  categories: Array<{ category: string; score: number; maxScore: number; signals: any[] }>,
  confidence?: string,
  totalScore?: number
): string {
  if (!categories || categories.length === 0) {
    return "Score not yet calculated";
  }
  
  // Calculate total possible score
  const maxTotal = categories.reduce((sum, cat) => sum + cat.maxScore, 0);
  const actualTotal = totalScore || categories.reduce((sum, cat) => sum + cat.score, 0);
  
  // Find strongest categories (those with highest percentage completion)
  const sortedCategories = [...categories]
    .map(cat => ({
      ...cat,
      percentage: cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);
  
  const strongestCategory = sortedCategories[0];
  const secondStrongest = sortedCategories[1];
  
  // Generate context-aware summary
  if (actualTotal >= 7) {
    return `Strong unsigned candidate with ${strongestCategory.category} signals detected.`;
  } else if (actualTotal >= 4) {
    return `Moderate unsigned signals, primarily from ${strongestCategory.category}.`;
  } else {
    return `Weak unsigned signals. Status uncertain, requires manual review.`;
  }
}

// Parse score breakdown from trackScoreData JSON - extract categories
function parseScoreBreakdown(trackScoreData: string | null) {
  if (!trackScoreData) return null;
  
  try {
    const data = JSON.parse(trackScoreData);
    // Extract categories array from the new scoring system
    if (data.categories && data.categories.length > 0) {
      return data.categories.map((cat: any) => ({
        category: cat.category,
        score: cat.score,
        maxScore: cat.maxScore,
        signals: cat.signals || []
      }));
    }
    return null;
  } catch {
    return null;
  }
}

// Get border color based on score strength
function getBorderColor(score: number, maxScore: number): string {
  if (maxScore === 0) return "border-l-muted";
  
  const percentage = (score / maxScore) * 100;
  if (percentage >= 80) return "border-l-emerald-500";
  if (percentage >= 40) return "border-l-amber-500";
  return "border-l-muted";
}

// Get icon for each category
function getCategoryIcon(categoryName: string) {
  const icons: Record<string, any> = {
    "Publishing Status": FileText,
    "Release Pathway": Truck,
    "Early Career Signals": Star,
    "Metadata Quality": Package,
    "Catalog Patterns": Database,
    "Profile Verification": CheckCircle,
  };
  return icons[categoryName] || FileText;
}

// Generate narrative description for a category with specific microcopy
function getCategoryNarrative(category: {
  category: string;
  score: number;
  maxScore: number;
  signals: Array<{ description: string; weight: number }>;
}): string {
  const { category: name, score, maxScore, signals } = category;
  const firstSignalDesc = signals?.find(s => s?.description)?.description;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  // Category-specific microcopy
  switch (name) {
    case "Publishing Status":
      if (percentage >= 80) {
        return "This songwriter has no publishing representation across any tracks.";
      } else if (percentage > 0) {
        return "Some publishing metadata present, but gaps exist across catalog.";
      }
      return "Publishing representation detected across tracks.";
      
    case "Release Pathway":
      if (percentage >= 80) {
        return firstSignalDesc || "DIY or independent distribution signals detected.";
      }
      return "No DIY or independent distribution signals found.";
      
    case "Early Career Signals":
      if (percentage >= 80) {
        return firstSignalDesc || "Presence on Fresh Finds indicates early editorial support.";
      } else if (percentage > 0) {
        return firstSignalDesc || "Some early career signals detected.";
      }
      return "No early career editorial signals detected.";
      
    case "Metadata Quality":
      if (firstSignalDesc) {
        return `${firstSignalDesc}.`;
      }
      return percentage > 0 
        ? `Metadata is partially complete (${Math.round(percentage)}%).`
        : "Metadata is incomplete or missing.";
      
    case "Catalog Patterns":
      if (percentage >= 80) {
        return firstSignalDesc || "Consistent independent release pattern detected.";
      }
      return "No consistent independent release pattern detected.";
      
    case "Profile Verification":
      if (percentage >= 80) {
        return firstSignalDesc || "External identity records found.";
      }
      return "No external identity records found.";
      
    default:
      // Fallback for unknown categories
      if (percentage >= 80 && firstSignalDesc) {
        return `${firstSignalDesc}.`;
      } else if (percentage > 0 && firstSignalDesc) {
        return `Partial signals: ${firstSignalDesc.toLowerCase()}.`;
      }
      return "No significant signals detected.";
  }
}

// Narrative Card Component for Score Display
interface NarrativeCardProps {
  category: {
    category: string;
    score: number;
    maxScore: number;
    signals: Array<{ description: string; weight: number }>;
  };
}

function NarrativeCard({ category }: NarrativeCardProps) {
  const Icon = getCategoryIcon(category.category);
  const borderColor = getBorderColor(category.score, category.maxScore);
  
  return (
    <Card 
      className={cn("p-3 border-l-4", borderColor)} 
      data-testid={`category-${category.category.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h4 className="font-medium text-sm">{category.category}</h4>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {category.score.toFixed(1)}/{category.maxScore} pts
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed pl-7">
        {getCategoryNarrative(category)}
      </p>
    </Card>
  );
}

export function ContactDetailDrawer({ contactId, open, onOpenChange }: ContactDetailDrawerProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [noteText, setNoteText] = useState("");
  const [activeTab, setActiveTab] = useState("scoring");
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [savedContactData, setSavedContactData] = useState<{
    email: string;
    instagram: string;
    twitter: string;
    tiktok: string;
    phone: string;
    iswc: string;
    ipiNumber: string;
    publisher: string;
    administrators: string;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    email: "",
    instagram: "",
    twitter: "",
    tiktok: "",
    phone: "",
    iswc: "",
    ipiNumber: "",
    publisher: "",
    administrators: "",
  });

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
    enabled: !!contactId && open,
  });

  // Aggregate contact info from tracks, then merge with saved data (saved data takes precedence)
  const aggregatedInfo = tracks.length > 0 ? aggregateContactInfo(tracks) : null;
  const contactInfo = aggregatedInfo ? {
    ...aggregatedInfo,
    ...(savedContactData || {}),
  } : (savedContactData || null);
  const scoreBreakdown = contact?.trackScoreData ? parseScoreBreakdown(contact.trackScoreData) : null;

  // Reset saved contact data and edit mode ONLY when switching to a different contact
  useEffect(() => {
    setSavedContactData(null);
    setIsEditingContact(false);
  }, [contactId]);

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async (updates: any) => {
      if (!contactId) throw new Error("No contact ID");
      return apiRequest("PATCH", `/api/contacts/${contactId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
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

  // Re-enrich contact tracks mutation
  const reEnrichMutation = useMutation({
    mutationFn: async () => {
      if (!contactId || !tracks || tracks.length === 0) {
        throw new Error("No tracks to enrich");
      }
      const trackIds = tracks.map(t => t.id);
      return apiRequest("POST", "/api/enrichment-jobs", { 
        trackIds 
      });
    },
    onSuccess: () => {
      toast({
        title: "Re-enrichment started",
        description: `Started enrichment for ${tracks.length} tracks. Check the Activity panel for progress.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start re-enrichment",
        variant: "destructive",
      });
    },
  });

  const handleReEnrich = () => {
    if (!tracks || tracks.length === 0) {
      toast({
        title: "No tracks",
        description: "This contact has no tracks to re-enrich",
        variant: "destructive",
      });
      return;
    }
    reEnrichMutation.mutate();
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

  const handleTrackClick = (trackId: string) => {
    // Navigate to tracks page with this track selected
    onOpenChange(false);
    setLocation(`/tracks?selected=${trackId}`);
  };

  const handleEditContact = () => {
    // Populate form with current data (merged aggregated + saved)
    setEditForm({
      email: contactInfo?.email || "",
      instagram: contactInfo?.instagram || "",
      twitter: contactInfo?.twitter || "",
      tiktok: contactInfo?.tiktok || "",
      phone: contactInfo?.phone || "",
      iswc: contactInfo?.iswc || "",
      ipiNumber: contactInfo?.ipiNumber || "",
      publisher: contactInfo?.publisher || "",
      administrators: contactInfo?.administrators || "",
    });
    setIsEditingContact(true);
  };

  const handleSaveContact = () => {
    // Save edited data to local state for display
    // Note: Backend persistence will be implemented once schema supports contact-level data storage
    setSavedContactData({
      email: editForm.email,
      instagram: editForm.instagram,
      twitter: editForm.twitter,
      tiktok: editForm.tiktok,
      phone: editForm.phone,
      iswc: editForm.iswc,
      ipiNumber: editForm.ipiNumber,
      publisher: editForm.publisher,
      administrators: editForm.administrators,
    });
    setIsEditingContact(false);
    toast({
      title: "Contact information updated",
      description: "Changes saved locally. Backend persistence pending schema update.",
    });
  };

  const handleCancelEdit = () => {
    setIsEditingContact(false);
  };

  const formatNumber = (num: number) => num.toLocaleString();
  const formatDate = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString();
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
            <SheetHeader className="sr-only">
              <SheetTitle>{contact.songwriterName}</SheetTitle>
            </SheetHeader>

            {/* Header Card: Name, Score, and Actions */}
            <Card className="pt-8 px-5 pb-5 mb-6">
              {/* Name and Score */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-semibold" data-testid="text-contact-name">
                  {contact.songwriterName}
                </h2>
                {contact.unsignedScore !== null && contact.unsignedScore !== undefined && (
                  <Badge 
                    variant={contact.unsignedScore >= 7 ? "high" : contact.unsignedScore >= 4 ? "medium" : "low"}
                    className="text-lg font-bold px-3 py-1"
                    data-testid="badge-score-header"
                  >
                    {contact.unsignedScore}/10
                  </Badge>
                )}
              </div>

              {/* Action Buttons Row - All on Same Line */}
              <div className="flex items-center gap-2 flex-nowrap">
                {/* Combined Contact Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="gap-2 flex-shrink-0 h-9"
                      data-testid="button-contact"
                    >
                      <Mail className="h-4 w-4" />
                      Contact
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem data-testid="button-send-email">
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="button-send-dm">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Send DM
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  className="gap-2 flex-shrink-0 h-9"
                  onClick={handleHotLeadToggle}
                  data-testid="button-toggle-hot-lead"
                >
                  <Flame className={`h-4 w-4 ${contact.hotLead > 0 ? 'fill-current' : ''}`} />
                  {contact.hotLead > 0 ? "Hot Lead" : "Mark Hot Lead"}
                </Button>
                
                {/* Pipeline Stage Selector on Same Row */}
                <Select value={contact.stage} onValueChange={handleStageChange}>
                  <SelectTrigger 
                    className="w-[180px] h-9 flex-shrink-0"
                    data-testid="select-change-stage"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discovery">Discovery Pool</SelectItem>
                    <SelectItem value="watch">Watch List</SelectItem>
                    <SelectItem value="search">Active Search</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Contact Information - Two Column Layout */}
            <Card className="p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Contact Information</h3>
                {!isEditingContact ? (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleEditContact}
                      data-testid="button-edit-contact"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={handleReEnrich}
                      disabled={reEnrichMutation.isPending}
                      data-testid="button-re-enrich"
                    >
                      <RefreshCw className={`h-4 w-4 ${reEnrichMutation.isPending ? 'animate-spin' : ''}`} />
                      Re-Enrich
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveContact}
                      data-testid="button-save-contact"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Left Column: Personal Contact */}
                <div className="space-y-4">
                  {/* Email */}
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Email</p>
                      {isEditingContact ? (
                        <Input
                          type="email"
                          placeholder="Email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-email"
                        />
                      ) : contactInfo?.email ? (
                        <a
                          href={`mailto:${contactInfo.email}`}
                          className="text-sm hover:underline truncate block"
                          data-testid="link-email"
                        >
                          {contactInfo.email}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">No email available</span>
                      )}
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div className="flex items-start gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Phone</p>
                      {isEditingContact ? (
                        <Input
                          type="tel"
                          placeholder="Phone"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-phone"
                        />
                      ) : contactInfo?.phone ? (
                        <a
                          href={`tel:${contactInfo.phone}`}
                          className="text-sm hover:underline truncate block"
                          data-testid="text-phone"
                        >
                          {contactInfo.phone}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground italic" data-testid="text-phone">
                          No phone available
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Professional Identifiers */}
                <div className="space-y-4">
                  {/* ISWC */}
                  <div className="flex items-start gap-3">
                    <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">ISWC</p>
                      {isEditingContact ? (
                        <Input
                          placeholder="ISWC"
                          value={editForm.iswc}
                          onChange={(e) => setEditForm({ ...editForm, iswc: e.target.value })}
                          className="h-8 text-sm font-mono"
                          data-testid="input-iswc"
                        />
                      ) : contactInfo?.iswc ? (
                        <p className="text-sm font-mono truncate" data-testid="text-iswc">{contactInfo.iswc}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not available</p>
                      )}
                    </div>
                  </div>

                  {/* IPI Number */}
                  <div className="flex items-start gap-3">
                    <UserIcon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">IPI Number</p>
                      {isEditingContact ? (
                        <Input
                          placeholder="IPI Number"
                          value={editForm.ipiNumber}
                          onChange={(e) => setEditForm({ ...editForm, ipiNumber: e.target.value })}
                          className="h-8 text-sm font-mono"
                          data-testid="input-ipi"
                        />
                      ) : contactInfo?.ipiNumber ? (
                        <p className="text-sm font-mono truncate" data-testid="text-ipi">{contactInfo.ipiNumber}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not available</p>
                      )}
                    </div>
                  </div>

                  {/* Publisher */}
                  <div className="flex items-start gap-3">
                    <Building className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Publisher</p>
                      {isEditingContact ? (
                        <Input
                          placeholder="Publisher"
                          value={editForm.publisher}
                          onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-publisher"
                        />
                      ) : contactInfo?.publisher ? (
                        <p className="text-sm truncate" data-testid="text-publisher">{contactInfo.publisher}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not available</p>
                      )}
                    </div>
                  </div>

                  {/* Administrator */}
                  <div className="flex items-start gap-3">
                    <Award className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Administrator</p>
                      {isEditingContact ? (
                        <Input
                          placeholder="Administrator"
                          value={editForm.administrators}
                          onChange={(e) => setEditForm({ ...editForm, administrators: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-administrator"
                        />
                      ) : contactInfo?.administrators ? (
                        <p className="text-sm truncate" data-testid="text-administrator">{contactInfo.administrators}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not available</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Media Section - Full Width Below */}
              <div className="pt-4 border-t">
                <div className="flex items-start gap-3">
                  <Share2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-2">Social Media</p>
                    {isEditingContact ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex items-center gap-2">
                          <Instagram className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            placeholder="Instagram"
                            value={editForm.instagram}
                            onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
                            className="h-8 text-sm"
                            data-testid="input-instagram"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Twitter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            placeholder="Twitter"
                            value={editForm.twitter}
                            onChange={(e) => setEditForm({ ...editForm, twitter: e.target.value })}
                            className="h-8 text-sm"
                            data-testid="input-twitter"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <SiTiktok className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            placeholder="TikTok"
                            value={editForm.tiktok}
                            onChange={(e) => setEditForm({ ...editForm, tiktok: e.target.value })}
                            className="h-8 text-sm"
                            data-testid="input-tiktok"
                          />
                        </div>
                      </div>
                    ) : (contactInfo?.instagram || contactInfo?.twitter || contactInfo?.tiktok) ? (
                      <div className="flex gap-2">
                        {contactInfo?.instagram && (
                          <a
                            href={`https://instagram.com/${contactInfo.instagram.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover-elevate p-2 rounded"
                            data-testid="link-instagram"
                          >
                            <Instagram className="h-5 w-5" />
                          </a>
                        )}
                        {contactInfo?.twitter && (
                          <a
                            href={`https://twitter.com/${contactInfo.twitter.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover-elevate p-2 rounded"
                            data-testid="link-twitter"
                          >
                            <Twitter className="h-5 w-5" />
                          </a>
                        )}
                        {contactInfo?.tiktok && (
                          <a
                            href={`https://tiktok.com/@${contactInfo.tiktok.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover-elevate p-2 rounded"
                            data-testid="link-tiktok"
                          >
                            <SiTiktok className="h-5 w-5" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">No social media links</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="scoring" data-testid="tab-scoring">
                  <Target className="h-4 w-4 mr-2" />
                  Scoring
                </TabsTrigger>
                <TabsTrigger value="tracks" data-testid="tab-tracks">
                  <Music className="h-4 w-4 mr-2" />
                  Tracks
                </TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">
                  <Activity className="h-4 w-4 mr-2" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes">
                  <FileText className="h-4 w-4 mr-2" />
                  Notes
                </TabsTrigger>
                <TabsTrigger value="performance" data-testid="tab-performance">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Performance
                </TabsTrigger>
              </TabsList>

              {/* Tracks Tab - Clickable */}
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
                    <Card 
                      key={track.id} 
                      className="p-4 hover-elevate cursor-pointer" 
                      onClick={() => handleTrackClick(track.id)}
                      data-testid={`card-track-${track.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Album Art */}
                        {track.albumArt ? (
                          <img
                            src={track.albumArt}
                            alt={track.trackName}
                            className="w-12 h-12 rounded object-cover flex-shrink-0"
                            loading="lazy"
                            width="48"
                            height="48"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <Music className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        
                        {/* Stacked Track Info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <h4 className="font-medium text-base leading-tight" data-testid={`text-track-name-${track.id}`}>
                            {track.trackName}
                          </h4>
                          <p className="text-sm text-muted-foreground leading-tight" data-testid={`text-track-artist-${track.id}`}>
                            {track.artistName}
                          </p>
                          {track.playlistName && (
                            <div>
                              <Badge variant="outline" className="text-xs font-normal">
                                {track.playlistName}
                              </Badge>
                            </div>
                          )}
                          {track.spotifyStreams && (
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(track.spotifyStreams)} streams
                            </p>
                          )}
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Scoring Tab - Category-Based Weighted System */}
              <TabsContent value="scoring" className="space-y-4">
                {contact.unsignedScore !== null && contact.unsignedScore !== undefined ? (
                  <>
                    {/* Score Header with Confidence */}
                    <Card className="p-5">
                      <div className="flex items-baseline gap-3 mb-3">
                        <div className="text-5xl font-bold" data-testid="text-unsigned-score-detail">
                          {contact.unsignedScore}
                        </div>
                        <div className="text-2xl text-muted-foreground">/10</div>
                        <Badge
                          variant={contact.unsignedScore >= 7 ? "high" : contact.unsignedScore >= 4 ? "medium" : "low"}
                          className="ml-2"
                          data-testid="badge-score-confidence-detail"
                        >
                          {contact.scoreConfidence || "medium"} confidence
                        </Badge>
                      </div>

                      {/* Summary Sentence */}
                      {scoreBreakdown && scoreBreakdown.length > 0 && (
                        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-score-summary">
                          {generateScoreSummary(scoreBreakdown, contact.scoreConfidence || undefined, contact.unsignedScore)}
                        </p>
                      )}
                    </Card>

                    {/* Category-Based Breakdown */}
                    {scoreBreakdown && scoreBreakdown.length > 0 ? (
                      <div className="space-y-4">
                        {scoreBreakdown.map((category: { category: string; score: number; maxScore: number; signals: Array<{ description: string; weight: number }> }, idx: number) => (
                          <NarrativeCard key={idx} category={category} />
                        ))}
                      </div>
                    ) : (
                      <Card className="p-5">
                        <p className="text-sm text-muted-foreground text-center">
                          No category data available
                        </p>
                      </Card>
                    )}

                    {/* Last Updated */}
                    {contact.unsignedScoreUpdatedAt && (
                      <p className="text-xs text-muted-foreground text-center">
                        Last updated: {formatDate(contact.unsignedScoreUpdatedAt)}
                      </p>
                    )}
                  </>
                ) : (
                  <Card className="p-8">
                    <div className="text-center">
                      <Target className="h-12 w-12 mx-auto mb-2 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">Score not yet calculated</p>
                    </div>
                  </Card>
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
