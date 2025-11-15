import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Users, TrendingUp, Target, Activity, Search, Filter, X, Mail, Phone, 
  MessageCircle, User, ChevronDown, Loader2, UserPlus, Upload, Share2, 
  Download, Flame, Link as LinkIcon, ArrowUpRight, ArrowDownRight, Eye, EyeOff
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCard } from "@/components/stats-card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ContactWithSongwriter } from "@shared/schema";
import { ContactDetailDrawer } from "@/components/contact-detail-drawer";
import { PageContainer } from "@/components/layout/page-container";

const STAGE_CONFIG = {
  discovery: {
    label: "Discovery",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: User,
  },
  watch: {
    label: "Watch List",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: Activity,
  },
  search: {
    label: "Active Search",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: Target,
  },
};

export default function Contacts() {
  const { toast } = useToast();
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Quick filters
  const [showHotLeads, setShowHotLeads] = useState(false);
  const [showChartmetricLinked, setShowChartmetricLinked] = useState(false);
  const [showPositiveWow, setShowPositiveWow] = useState(false);
  
  // Metrics visibility toggle
  const [showMetrics, setShowMetrics] = useState(() => {
    const stored = localStorage.getItem('contactsMetricsVisible');
    return stored !== null ? stored === 'true' : true;
  });

  // Persist metrics visibility to localStorage
  useEffect(() => {
    localStorage.setItem('contactsMetricsVisible', showMetrics.toString());
  }, [showMetrics]);

  // Fetch contacts with filters
  const { data: contactsData, isLoading } = useQuery<{
    contacts: ContactWithSongwriter[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    stats?: {
      total: number;
      hotLeads: number;
      discovery: number;
      watch: number;
      search: number;
      avgWowGrowth: number | null;
    };
  }>({
    queryKey: ["/api/contacts", { 
      stage: selectedStage === "all" ? undefined : selectedStage,
      search: debouncedSearchQuery || undefined,
      hotLeads: showHotLeads,
      chartmetricLinked: showChartmetricLinked,
      positiveWow: showPositiveWow,
      limit,
      offset 
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStage !== "all") params.append("stage", selectedStage);
      if (debouncedSearchQuery) params.append("search", debouncedSearchQuery);
      if (showHotLeads) params.append("hotLeads", "true");
      if (showChartmetricLinked) params.append("chartmetricLinked", "true");
      if (showPositiveWow) params.append("positiveWow", "true");
      params.append("limit", limit.toString());
      params.append("offset", offset.toString());
      
      const response = await fetch(`/api/contacts?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
  });

  const contacts = contactsData?.contacts || [];
  const total = contactsData?.total || 0;
  const stats = contactsData?.stats || {
    total: 0,
    hotLeads: 0,
    discovery: 0,
    watch: 0,
    search: 0,
    avgWowGrowth: null,
  };

  // Bulk update mutation
  const updateContactMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return apiRequest("PATCH", `/api/contacts/${id}`, updates);
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

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleViewContact = (contactId: string) => {
    setSelectedContactId(contactId);
    setDrawerOpen(true);
  };

  // Format number with commas
  const formatNumber = (num: number) => num.toLocaleString();

  // Handle stage update
  const handleStageUpdate = (contactId: string, newStage: string) => {
    updateContactMutation.mutate({
      id: contactId,
      updates: { stage: newStage },
    });
  };

  // Handle hot lead toggle
  const handleHotLeadToggle = (contactId: string, currentValue: number) => {
    updateContactMutation.mutate({
      id: contactId,
      updates: { hotLead: currentValue > 0 ? 0 : 1 },
    });
  };

  const hasFilters = selectedStage !== "all" || searchQuery.length > 0;

  const clearFilters = () => {
    setSelectedStage("all");
    setSearchQuery("");
    setOffset(0);
  };

  return (
    <PageContainer className="space-y-6 fade-in">
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-add-contact">
          <UserPlus className="h-4 w-4" />
          Add Contact
        </Button>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-import-csv">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </div>

      {/* Stats Cards with Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMetrics(!showMetrics)}
            data-testid="button-toggle-contact-metrics"
            className="h-8 w-8"
          >
            {showMetrics ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <Collapsible open={showMetrics}>
          <CollapsibleContent className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">TOP METRICS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatsCard
                title="Total Pipeline"
                value={formatNumber(stats.total)}
                icon={Users}
                variant="blue"
                tooltip="Total number of active songwriter contacts in the pipeline"
                testId="stats-total-pipeline"
              />
              <StatsCard
                title="Hot Leads"
                value={formatNumber(stats.hotLeads)}
                icon={Flame}
                variant="warning"
                tooltip="Priority outreach candidates marked as hot leads"
                testId="stats-hot-leads"
              />
              <StatsCard
                title="Avg. WoW Growth"
                value={stats.avgWowGrowth !== null 
                  ? `${stats.avgWowGrowth > 0 ? "+" : ""}${stats.avgWowGrowth.toFixed(1)}%`
                  : "—"
                }
                icon={TrendingUp}
                variant={stats.avgWowGrowth !== null && stats.avgWowGrowth > 0 ? "green" : "default"}
                tooltip="Average week-over-week growth across active contacts"
                testId="stats-avg-growth"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Saved View Banner / Filter Toolbar */}
      <Card className="p-4 space-y-4">
        {/* Top row: View info and actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-medium mb-1">All Contacts View</h3>
            <p className="text-xs text-muted-foreground">
              Default workspace showing all contacts across pipeline stages
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-share-view">
              <Share2 className="h-4 w-4" />
              Share View
            </Button>
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-export-csv">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Search and filters row */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by songwriter name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-contacts"
            />
          </div>

          <Button variant="outline" size="sm" className="gap-2" data-testid="button-advanced-filters">
            <Filter className="h-4 w-4" />
            Advanced Filters
          </Button>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Quick filters:</span>
          <Badge
            variant={showHotLeads ? "default" : "outline"}
            className={cn(
              "cursor-pointer hover-elevate active-elevate-2",
              showHotLeads && "bg-orange-500/20 text-orange-400 border-orange-500/30"
            )}
            onClick={() => setShowHotLeads(!showHotLeads)}
            data-testid="badge-filter-hot-leads"
          >
            <Flame className="h-3 w-3 mr-1" />
            Hot leads
          </Badge>
          <Badge
            variant={showChartmetricLinked ? "default" : "outline"}
            className="cursor-pointer hover-elevate active-elevate-2"
            onClick={() => setShowChartmetricLinked(!showChartmetricLinked)}
            data-testid="badge-filter-chartmetric"
          >
            <LinkIcon className="h-3 w-3 mr-1" />
            Chartmetric linked
          </Badge>
          <Badge
            variant={showPositiveWow ? "default" : "outline"}
            className={cn(
              "cursor-pointer hover-elevate active-elevate-2",
              showPositiveWow && "bg-chart-2/20 text-chart-2 border-chart-2/30"
            )}
            onClick={() => setShowPositiveWow(!showPositiveWow)}
            data-testid="badge-filter-positive-wow"
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            Positive WoW
          </Badge>
          
          {/* Clear View chip */}
          {(showHotLeads || showChartmetricLinked || showPositiveWow || searchQuery.length > 0) && (
            <Badge
              variant="outline"
              className="cursor-pointer hover-elevate active-elevate-2 gap-1"
              onClick={() => {
                setShowHotLeads(false);
                setShowChartmetricLinked(false);
                setShowPositiveWow(false);
                setSearchQuery("");
              }}
              data-testid="badge-clear-view"
            >
              <X className="h-3 w-3" />
              Clear view
            </Badge>
          )}
        </div>
      </Card>

      {/* Stage Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card
          className={cn(
            "p-4 cursor-pointer hover-elevate active-elevate-2 transition-all",
            selectedStage === "all" && "border-primary"
          )}
          onClick={() => {
            setSelectedStage("all");
            setOffset(0);
          }}
          data-testid="card-stage-all"
        >
          <div className="flex items-start justify-between mb-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            {selectedStage === "all" && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
          <div className="text-2xl font-bold mb-1">{formatNumber(stats.total)}</div>
          <div className="text-sm font-medium mb-1">All Contacts</div>
          <p className="text-xs text-muted-foreground">
            Complete pipeline view
          </p>
        </Card>

        <Card
          className={cn(
            "p-4 cursor-pointer hover-elevate active-elevate-2 transition-all",
            selectedStage === "discovery" && "border-primary"
          )}
          onClick={() => {
            setSelectedStage("discovery");
            setOffset(0);
          }}
          data-testid="card-stage-discovery"
        >
          <div className="flex items-start justify-between mb-2">
            <User className="h-5 w-5 text-blue-400" />
            {selectedStage === "discovery" && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
          <div className="text-2xl font-bold mb-1">{formatNumber(stats.discovery)}</div>
          <div className="text-sm font-medium mb-1">Discovery Pool</div>
          <p className="text-xs text-muted-foreground">
            New unsigned talent
          </p>
        </Card>

        <Card
          className={cn(
            "p-4 cursor-pointer hover-elevate active-elevate-2 transition-all",
            selectedStage === "watch" && "border-primary"
          )}
          onClick={() => {
            setSelectedStage("watch");
            setOffset(0);
          }}
          data-testid="card-stage-watch"
        >
          <div className="flex items-start justify-between mb-2">
            <Activity className="h-5 w-5 text-yellow-400" />
            {selectedStage === "watch" && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
          <div className="text-2xl font-bold mb-1">{formatNumber(stats.watch)}</div>
          <div className="text-sm font-medium mb-1">Watch List</div>
          <p className="text-xs text-muted-foreground">
            Tracking momentum
          </p>
        </Card>

        <Card
          className={cn(
            "p-4 cursor-pointer hover-elevate active-elevate-2 transition-all",
            selectedStage === "search" && "border-primary"
          )}
          onClick={() => {
            setSelectedStage("search");
            setOffset(0);
          }}
          data-testid="card-stage-search"
        >
          <div className="flex items-start justify-between mb-2">
            <Target className="h-5 w-5 text-emerald-400" />
            {selectedStage === "search" && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
          <div className="text-2xl font-bold mb-1">{formatNumber(stats.search)}</div>
          <div className="text-sm font-medium mb-1">Active Search</div>
          <p className="text-xs text-muted-foreground">
            Ready for outreach
          </p>
        </Card>
      </div>

      {/* Bulk Selection Banner */}
      {selectedIds.size > 0 && (
        <Card className={cn(
          "p-5 border-2",
          "border-primary/50 bg-primary/10",
          "sticky top-4 z-20"
        )}>
          <div className="flex items-center justify-between gap-6 flex-wrap">
            {/* Selection Stats */}
            <div className="flex items-center gap-6">
              <div>
                <div className="text-2xl font-bold mb-1" data-testid="badge-selected-count">
                  {selectedIds.size}
                </div>
                <div className="text-xs text-muted-foreground">
                  contacts selected
                </div>
              </div>
              
              <div className="h-10 w-px bg-border" />
              
              <div>
                <div className="text-lg font-semibold mb-1">
                  {formatNumber(
                    contacts
                      .filter(c => selectedIds.has(c.id))
                      .reduce((sum, c) => sum + (c.totalStreams || 0), 0) / selectedIds.size
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  avg. streams
                </div>
              </div>
              
              <div className="h-10 w-px bg-border" />
              
              <div>
                <div className="text-lg font-semibold mb-1 flex items-center gap-1">
                  <Flame className="h-4 w-4 text-orange-500" />
                  {contacts.filter(c => selectedIds.has(c.id) && c.hotLead > 0).length}
                </div>
                <div className="text-xs text-muted-foreground">
                  hot leads
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                data-testid="button-bulk-email"
              >
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                data-testid="button-bulk-message"
              >
                <MessageCircle className="h-4 w-4" />
                Send DM
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1" data-testid="button-more-actions">
                    More
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Export selection</DropdownMenuItem>
                  <DropdownMenuItem>Bulk update stage</DropdownMenuItem>
                  <DropdownMenuItem>Mark as hot leads</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={clearSelection}
                variant="ghost"
                size="sm"
                className="gap-2"
                data-testid="button-clear-selection"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Contacts Table */}
      <Card className="glass-panel">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No contacts found</h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "Try adjusting your filters" : "Contacts will appear here as tracks are enriched"}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === contacts.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Songwriter</TableHead>
                  <TableHead className="text-right">Total Streams</TableHead>
                  <TableHead className="text-right">Tracks</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">WoW Growth</TableHead>
                  <TableHead className="text-center">Hot Lead</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => {
                  const stageConfig = STAGE_CONFIG[contact.stage as keyof typeof STAGE_CONFIG];
                  const Icon = stageConfig?.icon;

                  return (
                    <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleSelection(contact.id)}
                          data-testid={`checkbox-contact-${contact.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm" data-testid={`text-songwriter-name-${contact.id}`}>
                            {contact.songwriterName}
                          </span>
                          {contact.songwriterChartmetricId && (
                            <span className="text-xs text-muted-foreground">
                              Chartmetric ID
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-streams-${contact.id}`}>
                        {formatNumber(contact.totalStreams || 0)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-tracks-${contact.id}`}>
                        {contact.totalTracks || 0}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Badge
                              variant="outline"
                              className={cn(
                                "cursor-pointer gap-1",
                                stageConfig?.color
                              )}
                              data-testid={`badge-stage-${contact.id}`}
                            >
                              {Icon && <Icon className="h-3 w-3" />}
                              {stageConfig?.label || contact.stage}
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                              <DropdownMenuItem
                                key={key}
                                onClick={() => handleStageUpdate(contact.id, key)}
                                data-testid={`menu-item-stage-${key}-${contact.id}`}
                              >
                                <config.icon className="h-4 w-4 mr-2" />
                                {config.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-wow-growth-${contact.id}`}>
                        {contact.wowGrowthPct !== null ? (
                          <span className={cn(
                            "font-medium",
                            contact.wowGrowthPct > 0 && "text-chart-2",
                            contact.wowGrowthPct < 0 && "text-red-400"
                          )}>
                            {contact.wowGrowthPct > 0 ? "+" : ""}{contact.wowGrowthPct}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant={contact.hotLead > 0 ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleHotLeadToggle(contact.id, contact.hotLead)}
                          className="h-7 w-7 p-0"
                          data-testid={`button-hot-lead-${contact.id}`}
                        >
                          <TrendingUp className={cn(
                            "h-4 w-4",
                            contact.hotLead > 0 && "text-primary-foreground"
                          )} />
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              data-testid={`button-actions-${contact.id}`}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => handleViewContact(contact.id)}
                              data-testid={`menu-item-view-${contact.id}`}
                            >
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`menu-item-email-${contact.id}`}>
                              <Mail className="h-4 w-4 mr-2" />
                              Send Email
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`menu-item-dm-${contact.id}`}>
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Send DM
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {total > limit && (
              <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {offset + 1} to {Math.min(offset + limit, total)} of {formatNumber(total)} contacts
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Contact Detail Drawer */}
      <ContactDetailDrawer
        contactId={selectedContactId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </PageContainer>
  );
}
