import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { StatsCard } from "@/components/stats-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  RefreshCw,
  Sparkles,
  List,
  Tags,
  Music,
  Target,
  TrendingUp,
  Activity,
  Search,
  Filter,
  ChevronDown,
  MoreHorizontal,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UnifiedControlPanelProps {
  // Stats
  totalTracks: number;
  highPotential: number;
  mediumPotential: number;
  avgScore: number;
  
  // Action components (allow passing custom components for dropdowns and managers)
  authorizeSpotifyButton?: ReactNode;
  fetchDataButton?: ReactNode;
  enrichMBButton?: ReactNode;
  enrichCreditsButton?: ReactNode;
  enrichArtistsButton?: ReactNode;
  exportButton?: ReactNode;
  playlistManagerButton?: ReactNode;
  tagManagerButton?: ReactNode;
  compareButton?: ReactNode;
  
  // Action handlers for dropdown menu items
  onExport?: () => void;
  onPlaylistManager?: () => void;
  onTagManager?: () => void;
  
  // Filters
  weeks: string[];
  selectedWeek?: string;
  onWeekChange?: (week: string) => void;
  
  playlists: Array<{ playlistId: string; name: string }>;
  selectedPlaylist?: string;
  onPlaylistChange?: (playlistId: string) => void;
  
  tags: Array<{ id: string; name: string }>;
  selectedTag?: string;
  onTagChange?: (tagId: string) => void;
  
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  
  scoreRange?: [number, number];
  onScoreRangeChange?: (range: [number, number]) => void;
  
  activeFilters?: string[];
  onFilterToggle?: (filter: string) => void;
  onClearFilters?: () => void;
  onClearAllFilters?: () => void;
}

const filterOptions = [
  { id: "has-isrc", label: "Has ISRC", section: "ISRC Code" },
  { id: "no-isrc", label: "No ISRC", section: "ISRC Code" },
  { id: "has-credits", label: "Has Credits", section: "Credits Data" },
  { id: "no-credits", label: "No Credits", section: "Credits Data" },
  { id: "has-publisher", label: "Has Publisher", section: "Publisher Info" },
  { id: "no-publisher", label: "No Publisher", section: "Publisher Info" },
  { id: "has-songwriter", label: "Has Songwriter", section: "Songwriter Info" },
  { id: "no-songwriter", label: "No Songwriter", section: "Songwriter Info" },
];

export function UnifiedControlPanel({
  totalTracks,
  highPotential,
  mediumPotential,
  avgScore,
  authorizeSpotifyButton,
  fetchDataButton,
  enrichMBButton,
  enrichCreditsButton,
  enrichArtistsButton,
  exportButton,
  playlistManagerButton,
  tagManagerButton,
  compareButton,
  onExport,
  onPlaylistManager,
  onTagManager,
  weeks = [],
  selectedWeek,
  onWeekChange,
  playlists = [],
  selectedPlaylist,
  onPlaylistChange,
  tags = [],
  selectedTag,
  onTagChange,
  searchQuery = "",
  onSearchChange,
  scoreRange = [0, 10],
  onScoreRangeChange,
  activeFilters = [],
  onFilterToggle,
  onClearFilters,
  onClearAllFilters,
}: UnifiedControlPanelProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  // Check if any filter is active
  const hasActiveFilters = 
    selectedWeek !== "latest" || 
    selectedPlaylist !== "all" || 
    selectedTag !== "all" || 
    searchQuery !== "" || 
    activeFilters.length > 0 ||
    (scoreRange[0] !== 0 || scoreRange[1] !== 10);

  const filterSections = filterOptions.reduce((acc, filter) => {
    if (!acc[filter.section]) acc[filter.section] = [];
    acc[filter.section].push(filter);
    return acc;
  }, {} as Record<string, typeof filterOptions>);

  return (
    <div className="space-y-6">
      {/* Actions Row */}
      <div className="glass-panel p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-3">
          {/* Spotify Auth */}
          {authorizeSpotifyButton}
          
          {/* Primary Actions */}
          {fetchDataButton}
          
          {/* Enrichment Actions */}
          <div className="flex gap-2">
            {enrichMBButton}
            {enrichCreditsButton}
            {enrichArtistsButton}
          </div>

          {/* More Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default" className="gap-2 ml-auto" data-testid="button-more-actions">
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel">
              <DropdownMenuItem onSelect={() => onExport?.()} data-testid="menu-export">
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPlaylistManager?.()} data-testid="menu-playlists">
                <List className="mr-2 h-4 w-4" />
                Manage Playlists
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onTagManager?.()} data-testid="menu-tags">
                <Tags className="mr-2 h-4 w-4" />
                Manage Tags
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/comparison" className="flex items-center" data-testid="menu-compare">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Compare Weeks
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Tracks"
          value={totalTracks.toLocaleString()}
          icon={Music}
          variant="default"
        />
        <StatsCard
          title="High Potential"
          value={highPotential.toLocaleString()}
          subtitle="Score 7-10"
          icon={Target}
          variant="success"
        />
        <StatsCard
          title="Medium Potential"
          value={mediumPotential.toLocaleString()}
          subtitle="Score 4-6"
          icon={TrendingUp}
          variant="warning"
        />
        <StatsCard
          title="Avg Score"
          value={avgScore.toFixed(1)}
          subtitle="Out of 10"
          icon={Activity}
          variant="default"
        />
      </div>

      {/* Filters Row */}
      <div className="glass-panel p-3 rounded-lg">
        <div className="flex flex-wrap items-center gap-2">
          {/* Dropdowns */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Week:</span>
            <Select value={selectedWeek} onValueChange={onWeekChange}>
              <SelectTrigger className="w-[160px]" data-testid="select-week">
                <SelectValue placeholder="All Dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                {weeks.map((week) => (
                  <SelectItem key={week} value={week}>
                    {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={selectedPlaylist} onValueChange={onPlaylistChange}>
            <SelectTrigger className="w-[160px]" data-testid="select-playlist">
              <SelectValue placeholder="All Playlists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Playlists</SelectItem>
              {playlists.map((playlist) => (
                <SelectItem key={playlist.playlistId} value={playlist.playlistId}>
                  {playlist.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTag} onValueChange={onTagChange}>
            <SelectTrigger className="w-[160px]" data-testid="select-tag">
              <SelectValue placeholder="All Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search Bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search tracks, artists, labels..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>

          {/* Completeness Filters with Score Range */}
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="default"
                className="gap-2"
                data-testid="button-completeness-filters"
              >
                <Filter className="h-4 w-4" />
                Completeness Filters
                {activeFilters.length > 0 && (
                  <Badge variant="default" className="ml-1 px-1.5 py-0">
                    {activeFilters.length}
                  </Badge>
                )}
                <ChevronDown className={cn("h-3 w-3", filtersOpen && "rotate-180")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 glass-panel" align="end">
              <div className="space-y-4">
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
                      onValueChange={onScoreRangeChange}
                      className="flex-1"
                      data-testid="slider-score-range"
                    />
                  </div>
                </div>

                <div className="border-t pt-3" />

                {/* Data Completeness Filters */}
                {Object.entries(filterSections).map(([section, filters]) => (
                  <div key={section}>
                    <h4 className="text-sm font-medium mb-2">{section}</h4>
                    <div className="flex flex-wrap gap-2">
                      {filters.map((filter) => (
                        <Button
                          key={filter.id}
                          variant={activeFilters.includes(filter.id) ? "default" : "outline"}
                          size="sm"
                          onClick={() => onFilterToggle?.(filter.id)}
                          className="text-xs"
                          data-testid={`filter-${filter.id}`}
                        >
                          {filter.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                
                {activeFilters.length > 0 && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearFilters}
                      className="w-full"
                      data-testid="button-clear-filters"
                    >
                      Clear All Filters
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear All Filters Button */}
          {hasActiveFilters && onClearAllFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAllFilters}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-clear-all-filters"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
