import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, TrendingUp, Target, Activity, Search, Filter, X, Mail, Phone, MessageCircle, User, ChevronDown, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatCard } from "@/components/stat-card";
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
    };
  }>({
    queryKey: ["/api/contacts", { 
      stage: selectedStage === "all" ? undefined : selectedStage,
      search: debouncedSearchQuery || undefined,
      limit,
      offset 
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStage !== "all") params.append("stage", selectedStage);
      if (debouncedSearchQuery) params.append("search", debouncedSearchQuery);
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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Contacts</h1>
        <p className="text-muted-foreground">
          Manage songwriter contacts and track outreach pipeline
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Contacts"
          value={formatNumber(stats.total)}
          icon={Users}
          variant="default"
        />
        <StatCard
          title="Hot Leads"
          value={formatNumber(stats.hotLeads)}
          icon={TrendingUp}
          variant="high"
        />
        <StatCard
          title="Discovery"
          value={formatNumber(stats.discovery)}
          icon={User}
          variant="default"
        />
        <StatCard
          title="Watch List"
          value={formatNumber(stats.watch)}
          icon={Activity}
          variant="medium"
        />
        <StatCard
          title="Active Search"
          value={formatNumber(stats.search)}
          icon={Target}
          variant="high"
        />
      </div>

      {/* Filters & Search */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
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

          {/* Stage Filter */}
          <Select value={selectedStage} onValueChange={setSelectedStage}>
            <SelectTrigger className="w-full md:w-[200px]" data-testid="select-stage-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="discovery">Discovery</SelectItem>
              <SelectItem value="watch">Watch List</SelectItem>
              <SelectItem value="search">Active Search</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-2"
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <Card className={cn(
          "glass-panel p-4",
          "border-primary/30 bg-primary/5",
          "sticky top-0 z-20"
        )}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="text-sm font-semibold" data-testid="badge-selected-count">
                {selectedIds.size} selected
              </Badge>
              <span className="text-sm text-muted-foreground">
                of {total} contacts
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-bulk-email"
              >
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-bulk-message"
              >
                <MessageCircle className="h-4 w-4" />
                Send DM
              </Button>
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
    </div>
  );
}
