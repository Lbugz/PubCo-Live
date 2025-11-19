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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCard } from "@/components/stats-card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
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
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ContactWithSongwriter } from "@shared/schema";
import { ContactDetailDrawer } from "@/components/contact-detail-drawer";
import { PageContainer } from "@/components/layout/page-container";
import { FilterBar } from "@/components/layout/filter-bar";
import { StickyHeaderContainer } from "@/components/layout/sticky-header-container";
import { SimplePagination } from "@/components/ui/simple-pagination";

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
  const isMobile = useMobile(768);
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  // Advanced filters
  const [hasEmail, setHasEmail] = useState<boolean | undefined>(undefined);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 10]);
  const [hasSocialLinks, setHasSocialLinks] = useState<boolean | undefined>(undefined);
  
  // Sorting
  const [sortField, setSortField] = useState<string>("totalStreams");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Reset offset to 0 whenever filters change to avoid empty pages
  useEffect(() => {
    setOffset(0);
  }, [selectedStage, debouncedSearchQuery, hasEmail, scoreRange[0], scoreRange[1], hasSocialLinks]);

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
      hasEmail,
      minScore: scoreRange[0],
      maxScore: scoreRange[1],
      hasSocialLinks,
      limit,
      offset 
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStage !== "all") params.append("stage", selectedStage);
      if (debouncedSearchQuery) params.append("search", debouncedSearchQuery);
      if (hasEmail !== undefined) params.append("hasEmail", hasEmail.toString());
      if (scoreRange[0] > 0 || scoreRange[1] < 10) {
        params.append("minScore", scoreRange[0].toString());
        params.append("maxScore", scoreRange[1].toString());
      }
      if (hasSocialLinks !== undefined) params.append("hasSocialLinks", hasSocialLinks.toString());
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
        case "unsignedScore":
          aValue = a.unsignedScore ?? -1;
          bValue = b.unsignedScore ?? -1;
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

  // Handle pagination
  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit;
    setOffset(newOffset);
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentPage = Math.floor(offset / limit) + 1;

  const contactColumns: DataTableColumn<ContactWithSongwriter>[] = [
    {
      id: "songwriterName",
      header: "Songwriter",
      sortField: "songwriterName",
      cell: (contact) => (
        <div 
          className="flex flex-col cursor-pointer hover-elevate rounded-md p-1 -m-1"
          onClick={() => handleViewContact(contact.id)}
        >
          <span className="text-sm" data-testid={`text-songwriter-name-${contact.id}`}>
            {contact.songwriterName}
          </span>
        </div>
      ),
      className: "font-medium",
    },
    {
      id: "totalStreams",
      header: "Total Streams",
      sortField: "totalStreams",
      cell: (contact) => formatNumber(contact.totalStreams || 0),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      id: "trackCount",
      header: "Tracks",
      sortField: "trackCount",
      cell: (contact) => contact.totalTracks || 0,
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      id: "unsignedScore",
      header: "Score",
      sortField: "unsignedScore",
      cell: (contact) => {
        const score = contact.unsignedScore;
        if (score === null || score === undefined) {
          return (
            <Badge variant="outline" className="font-medium" data-testid={`badge-score-${contact.id}`}>
              Pending
            </Badge>
          );
        }
        
        const variant = score >= 7 ? "high" : score >= 4 ? "medium" : "low";
        return (
          <Badge variant={variant} className="font-semibold min-w-[3rem] justify-center" data-testid={`badge-score-${contact.id}`}>
            {score}
          </Badge>
        );
      },
      className: "text-center",
      headerClassName: "text-center",
    },
    {
      id: "stage",
      header: "Stage",
      sortField: "stage",
      cell: (contact) => {
        const stageConfig = STAGE_CONFIG[contact.stage as keyof typeof STAGE_CONFIG];
        const Icon = stageConfig?.icon;

        return (
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
        );
      },
    },
    {
      id: "wowGrowth",
      header: "WoW Growth",
      sortField: "wowGrowth",
      cell: (contact) => (
        contact.wowGrowthPct !== null ? (
          <span className={cn(
            "font-medium",
            contact.wowGrowthPct > 0 && "text-chart-2",
            contact.wowGrowthPct < 0 && "text-red-400"
          )}>
            {contact.wowGrowthPct > 0 ? "+" : ""}{contact.wowGrowthPct}%
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      id: "hotLead",
      header: "Hot Lead",
      cell: (contact) => (
        <Button
          variant={contact.hotLead > 0 ? "default" : "ghost"}
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            handleHotLeadToggle(contact.id, contact.hotLead);
          }}
          data-testid={`button-hot-lead-${contact.id}`}
        >
          <TrendingUp className={cn(
            "h-4 w-4",
            contact.hotLead > 0 && "text-primary-foreground"
          )} />
        </Button>
      ),
      className: "text-center",
      headerClassName: "text-center",
    },
    {
      id: "actions",
      header: "Actions",
      cell: (contact) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => e.stopPropagation()}
              data-testid={`button-actions-${contact.id}`}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={(e) => {
                e.stopPropagation();
                handleViewContact(contact.id);
              }}
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
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
  ];

  return (
    <PageContainer className="space-y-6 fade-in">
      {/* Sticky Header: Metrics & Filters */}
      <StickyHeaderContainer className="pb-4 border-b">

      {/* Filters */}
      <FilterBar>
          <FilterBar.FiltersGroup>
            <FilterBar.Search
              placeholder="Search by songwriter name..."
              value={searchQuery}
              onChange={setSearchQuery}
              testId="input-search-contacts"
            />

            <FilterBar.AdvancedFilters testId="button-advanced-filters">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3">Advanced Filters</h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Refine your contact search with additional criteria
                  </p>
                </div>
                {/* Score Range Filter */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Score Range</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium whitespace-nowrap">
                      {scoreRange[0]} - {scoreRange[1]}
                    </span>
                    <Slider
                      min={0}
                      max={10}
                      step={1}
                      value={scoreRange}
                      onValueChange={(value) => setScoreRange(value as [number, number])}
                      className="flex-1"
                      data-testid="slider-contact-score-range"
                    />
                  </div>
                </div>

                <Separator />

                {/* Contact Info Filters */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Contact Info</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={hasEmail === true ? "default" : "outline"}
                      size="sm"
                      onClick={() => setHasEmail(hasEmail === true ? undefined : true)}
                      className="text-xs"
                      data-testid="filter-has-email"
                    >
                      Has Email
                    </Button>
                    <Button
                      variant={hasEmail === false ? "default" : "outline"}
                      size="sm"
                      onClick={() => setHasEmail(hasEmail === false ? undefined : false)}
                      className="text-xs"
                      data-testid="filter-no-email"
                    >
                      No Email
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Social Links Filters */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Social Links</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={hasSocialLinks === true ? "default" : "outline"}
                      size="sm"
                      onClick={() => setHasSocialLinks(hasSocialLinks === true ? undefined : true)}
                      className="text-xs"
                      data-testid="filter-has-social"
                    >
                      Has Social Links
                    </Button>
                    <Button
                      variant={hasSocialLinks === false ? "default" : "outline"}
                      size="sm"
                      onClick={() => setHasSocialLinks(hasSocialLinks === false ? undefined : false)}
                      className="text-xs"
                      data-testid="filter-no-social"
                    >
                      No Social Links
                    </Button>
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
      </StickyHeaderContainer>

      {/* Stage Selector Tabs */}
      <Tabs value={selectedStage} onValueChange={(value: string) => { setSelectedStage(value as any); setOffset(0); }}>
        <TabsList className="w-full grid grid-cols-4 h-auto p-1">
          <TabsTrigger value="all" className="flex-col gap-1 py-3" data-testid="tab-stage-all">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="font-semibold text-lg">{formatNumber(stats.total)}</span>
            </div>
            <div className="text-xs font-medium">All Contacts</div>
          </TabsTrigger>
          <TabsTrigger value="discovery" className="flex-col gap-1 py-3" data-testid="tab-stage-discovery">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-400" />
              <span className="font-semibold text-lg">{formatNumber(stats.discovery)}</span>
            </div>
            <div className="text-xs font-medium">Discovery Pool</div>
          </TabsTrigger>
          <TabsTrigger value="watch" className="flex-col gap-1 py-3" data-testid="tab-stage-watch">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-yellow-400" />
              <span className="font-semibold text-lg">{formatNumber(stats.watch)}</span>
            </div>
            <div className="text-xs font-medium">Watch List</div>
          </TabsTrigger>
          <TabsTrigger value="search" className="flex-col gap-1 py-3" data-testid="tab-stage-search">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-400" />
              <span className="font-semibold text-lg">{formatNumber(stats.search)}</span>
            </div>
            <div className="text-xs font-medium">Active Search</div>
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
      <DataTable
        data={sortedContacts}
        columns={contactColumns}
        getRowId={(contact) => contact.id}
        isLoading={isLoading}
        emptyState={(
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No contacts found</h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "Try adjusting your filters" : "Contacts will appear here as tracks are enriched"}
            </p>
          </div>
        )}
        selectedIds={selectedIds}
        onToggleSelection={toggleSelection}
        onToggleSelectAll={toggleSelectAll}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        bordered={true}
        striped={true}
        hoverable={true}
        stickyHeader={true}
        testIdPrefix="contact"
      />

      {/* Pagination */}
      {!isLoading && total > 0 && (
        <SimplePagination
          currentPage={currentPage}
          totalItems={total}
          itemsPerPage={limit}
          onPageChange={handlePageChange}
          itemName="contacts"
        />
      )}

      {/* Contact Detail Drawer */}
      <ContactDetailDrawer
        contactId={selectedContactId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </PageContainer>
  );
}
