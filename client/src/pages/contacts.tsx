import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Users, TrendingUp, Target, Activity, Search, Filter, X, Mail, Phone, 
  MessageCircle, User, ChevronDown, Loader2, UserPlus, Upload,
  Flame, Link as LinkIcon, ArrowUpRight, ArrowDownRight, Eye, EyeOff, Settings2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { useMobile } from "@/hooks/use-mobile";
import { useQuickFilterPreferences, type QuickFilterDefinition } from "@/hooks/use-quick-filter-preferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCard } from "@/components/stats-card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
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
import { FilterBar } from "@/components/layout/filter-bar";
import { StickyHeaderContainer } from "@/components/layout/sticky-header-container";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";

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

const AVAILABLE_QUICK_FILTERS: QuickFilterDefinition[] = [
  {
    id: "hotLeads",
    label: "Hot leads",
    icon: Flame,
    variant: "hot",
    defaultVisible: true,
  },
  {
    id: "chartmetricLinked",
    label: "Chartmetric linked",
    icon: LinkIcon,
    variant: "default",
    defaultVisible: true,
  },
  {
    id: "positiveWow",
    label: "Positive WoW",
    icon: TrendingUp,
    variant: "success",
    defaultVisible: true,
  },
];

export default function Contacts() {
  const { toast } = useToast();
  const isMobile = useMobile(768);
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
  
  // Quick filter preferences
  const {
    visibleFilters,
    visibleFilterIds,
    toggleFilterVisibility,
    resetToDefaults,
    allFilters,
  } = useQuickFilterPreferences("contacts", AVAILABLE_QUICK_FILTERS);
  
  // Sorting
  const [sortField, setSortField] = useState<string>("totalStreams");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
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
      unsignedPct: number;
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
    unsignedPct: 0,
  };

  // Sort contacts
  const sortedContacts = useMemo(() => {
    if (!contacts || contacts.length === 0) return [];
    
    const sorted = [...contacts].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "songwriterName":
          aValue = a.songwriterName?.toLowerCase() || "";
          bValue = b.songwriterName?.toLowerCase() || "";
          break;
        case "totalStreams":
          aValue = a.totalStreams || 0;
          bValue = b.totalStreams || 0;
          break;
        case "trackCount":
          aValue = a.totalTracks || 0;
          bValue = b.totalTracks || 0;
          break;
        case "stage":
          aValue = a.stage || "";
          bValue = b.stage || "";
          break;
        case "wowGrowth":
          aValue = a.wowGrowthPct || 0;
          bValue = b.wowGrowthPct || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [contacts, sortField, sortDirection]);

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
    if (selectedIds.size === sortedContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedContacts.map(c => c.id)));
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

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "totalStreams" || field === "trackCount" || field === "wowGrowth" ? "desc" : "asc");
    }
  };

  return (
    <PageContainer className="space-y-6 fade-in">
      {/* Sticky Header: Metrics & Filters */}
      <StickyHeaderContainer className="pb-4 border-b">
        {/* Stats Cards with Toggle */}
        <div className="space-y-3">
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMetrics(!showMetrics)}
            data-testid="button-toggle-contact-metrics"
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
                tooltip="Total active songwriter contacts tracked across all pipeline stages (Discovery Pool, Watch List, Active Search) for publishing outreach and relationship management"
                testId="stats-total-pipeline"
              />
              <StatsCard
                title="Hot Leads"
                value={formatNumber(stats.hotLeads)}
                icon={Flame}
                variant="warning"
                tooltip="Priority outreach candidates with unsigned score 7-10 indicating immediate publishing opportunities - ready for direct contact and deal discussions"
                testId="stats-hot-leads"
              />
              <StatsCard
                title="Unsigned in Pipeline"
                value={`${stats.unsignedPct.toFixed(1)}%`}
                icon={TrendingUp}
                variant={stats.unsignedPct >= 50 ? "green" : stats.unsignedPct >= 25 ? "warning" : "default"}
                tooltip="Percentage of contacts with tracks missing publisher data after enrichment - pipeline quality indicator showing unsigned publishing opportunity concentration"
                testId="stats-unsigned-pct"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Saved View Banner / Filter Toolbar */}
      <div className="space-y-3">
        {/* View info */}
        <div>
          <h3 className="text-sm font-medium mb-1">All Contacts View</h3>
          <p className="text-xs text-muted-foreground">
            Default workspace showing all contacts across pipeline stages
          </p>
        </div>

        {/* Search and filters */}
        <FilterBar>
          <FilterBar.FiltersGroup>
            <FilterBar.Search
              placeholder="Search by songwriter name..."
              value={searchQuery}
              onChange={setSearchQuery}
              testId="input-search-contacts"
            />

            <FilterBar.Pills
              pills={visibleFilters.map((filter) => {
                let active = false;
                let onClick = () => {};
                let testId = "";

                if (filter.id === "hotLeads") {
                  active = showHotLeads;
                  onClick = () => setShowHotLeads(!showHotLeads);
                  testId = "badge-filter-hot-leads";
                } else if (filter.id === "chartmetricLinked") {
                  active = showChartmetricLinked;
                  onClick = () => setShowChartmetricLinked(!showChartmetricLinked);
                  testId = "badge-filter-chartmetric";
                } else if (filter.id === "positiveWow") {
                  active = showPositiveWow;
                  onClick = () => setShowPositiveWow(!showPositiveWow);
                  testId = "badge-filter-positive-wow";
                }

                return {
                  label: filter.label,
                  active,
                  onClick,
                  icon: filter.icon,
                  variant: filter.variant,
                  testId,
                };
              })}
              showClear={true}
              onClearAll={() => {
                setShowHotLeads(false);
                setShowChartmetricLinked(false);
                setShowPositiveWow(false);
                setSearchQuery("");
              }}
            />

            <FilterBar.AdvancedFilters testId="button-advanced-filters">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3">Advanced Filters</h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Refine your contact search with additional criteria
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  Coming soon: Has Email, Score Range, Social Links filters
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <h4 className="font-medium">Customize Quick Filters</h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetToDefaults}
                      className="h-7 text-xs"
                      data-testid="button-reset-filters"
                    >
                      Reset
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Choose which quick filters appear in the filter bar
                  </p>
                  <div className="space-y-2">
                    {allFilters.map((filter) => {
                      const Icon = filter.icon;
                      return (
                        <div
                          key={filter.id}
                          className="flex items-center gap-2"
                        >
                          <Checkbox
                            id={`filter-${filter.id}`}
                            checked={visibleFilterIds.has(filter.id)}
                            onCheckedChange={() => toggleFilterVisibility(filter.id)}
                            data-testid={`checkbox-filter-${filter.id}`}
                          />
                          <label
                            htmlFor={`filter-${filter.id}`}
                            className="flex items-center gap-2 text-sm cursor-pointer flex-1"
                          >
                            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span>{filter.label}</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </FilterBar.AdvancedFilters>
          </FilterBar.FiltersGroup>

          <FilterBar.Actions>
            <Button variant="gradient" size="sm" className="gap-2" data-testid="button-add-contact">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Contact</span>
            </Button>
            <Button variant="gradient" size="sm" className="gap-2" data-testid="button-import-csv">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import CSV</span>
            </Button>
          </FilterBar.Actions>
        </FilterBar>
      </div>
      </StickyHeaderContainer>

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
                  {sortedContacts.filter(c => selectedIds.has(c.id) && c.hotLead > 0).length}
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
            <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 glass-header">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === sortedContacts.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <SortableTableHeader
                    label="Songwriter"
                    field="songwriterName"
                    currentSort={{ field: sortField, direction: sortDirection }}
                    onSort={handleSort}
                  />
                  <SortableTableHeader
                    label="Total Streams"
                    field="totalStreams"
                    currentSort={{ field: sortField, direction: sortDirection }}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHeader
                    label="Tracks"
                    field="trackCount"
                    currentSort={{ field: sortField, direction: sortDirection }}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHeader
                    label="Stage"
                    field="stage"
                    currentSort={{ field: sortField, direction: sortDirection }}
                    onSort={handleSort}
                  />
                  <SortableTableHeader
                    label="WoW Growth"
                    field="wowGrowth"
                    currentSort={{ field: sortField, direction: sortDirection }}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <TableHead className="text-center">Hot Lead</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContacts.map((contact) => {
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
                        <div 
                          className="flex flex-col cursor-pointer hover-elevate rounded-md p-1 -m-1"
                          onClick={() => handleViewContact(contact.id)}
                        >
                          <span className="text-sm text-primary" data-testid={`text-songwriter-name-${contact.id}`}>
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
                          size="icon"
                          onClick={() => handleHotLeadToggle(contact.id, contact.hotLead)}
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
                              size="icon"
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
            </div>

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
