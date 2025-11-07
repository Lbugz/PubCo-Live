import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { StatCard } from "@/components/stat-card";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UnifiedControlPanelProps {
  // Stats
  totalTracks: number;
  highPotential: number;
  mediumPotential: number;
  avgScore: number;
  
  // Actions
  onFetchData?: () => void;
  onEnrichMB?: () => void;
  onEnrichCredits?: () => void;
  onExport?: () => void;
  onManagePlaylists?: () => void;
  onManageTags?: () => void;
  
  // Filters
  weeks: string[];
  selectedWeek?: string;
  onWeekChange?: (week: string) => void;
  
  playlists: string[];
  selectedPlaylist?: string;
  onPlaylistChange?: (playlist: string) => void;
  
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
  
  // Loading states
  isLoading?: boolean;
  isEnriching?: boolean;
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
  onFetchData,
  onEnrichMB,
  onEnrichCredits,
  onExport,
  onManagePlaylists,
  onManageTags,
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
  isLoading,
  isEnriching,
}: UnifiedControlPanelProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

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
          <Button
            variant="gradient"
            onClick={onFetchData}
            disabled={isLoading}
            className="gap-2"
            data-testid="button-fetch-data"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Fetch Data
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onEnrichMB}
              disabled={isEnriching}
              className="gap-2"
              data-testid="button-enrich-mb"
            >
              <Sparkles className="h-4 w-4" />
              Enrich (MB)
            </Button>
            <Button
              variant="outline"
              onClick={onEnrichCredits}
              disabled={isEnriching}
              className="gap-2"
              data-testid="button-enrich-credits"
            >
              <Music className="h-4 w-4" />
              Enrich (Credits)
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={onExport}
            className="gap-2"
            data-testid="button-export"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>

          <div className="flex gap-2 ml-auto">
            <Button
              variant="ghost"
              onClick={onManagePlaylists}
              className="gap-2"
              data-testid="button-manage-playlists"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Manage Playlists</span>
            </Button>
            <Button
              variant="ghost"
              onClick={onManageTags}
              className="gap-2"
              data-testid="button-manage-tags"
            >
              <Tags className="h-4 w-4" />
              <span className="hidden sm:inline">Manage Tags</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Tracks"
          value={totalTracks.toLocaleString()}
          icon={Music}
          variant="default"
        />
        <StatCard
          title="High Potential"
          value={highPotential.toLocaleString()}
          subtitle="Score 7-10"
          icon={Target}
          variant="high"
        />
        <StatCard
          title="Medium Potential"
          value={mediumPotential.toLocaleString()}
          subtitle="Score 4-6"
          icon={TrendingUp}
          variant="medium"
        />
        <StatCard
          title="Avg Score"
          value={avgScore.toFixed(1)}
          subtitle="Out of 10"
          icon={Activity}
          variant="default"
        />
      </div>

      {/* Filters Row */}
      <div className="glass-panel p-4 rounded-lg">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Dropdowns */}
          <div className="flex flex-wrap gap-3 flex-1">
            <Select value={selectedWeek} onValueChange={onWeekChange}>
              <SelectTrigger className="w-[180px]" data-testid="select-week">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((week) => (
                  <SelectItem key={week} value={week}>
                    {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedPlaylist} onValueChange={onPlaylistChange}>
              <SelectTrigger className="w-[180px]" data-testid="select-playlist">
                <SelectValue placeholder="All Playlists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Playlists</SelectItem>
                {playlists.map((playlist) => (
                  <SelectItem key={playlist} value={playlist}>
                    {playlist}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTag} onValueChange={onTagChange}>
              <SelectTrigger className="w-[180px]" data-testid="select-tag">
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
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px]">
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

          {/* Completeness Filters */}
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="gap-2"
                data-testid="button-completeness-filters"
              >
                <Filter className="h-4 w-4" />
                Completeness Filters
                {activeFilters.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                    {activeFilters.length}
                  </span>
                )}
                <ChevronDown className={cn("h-4 w-4 rotate-icon", filtersOpen && "rotate-180")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 glass-panel" align="end">
              <div className="space-y-4">
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

          {/* Score Slider */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <span className="text-sm font-medium whitespace-nowrap">
              Score: {scoreRange[0]}-{scoreRange[1]}
            </span>
            <Slider
              min={0}
              max={10}
              step={1}
              value={scoreRange}
              onValueChange={onScoreRangeChange}
              className="w-32"
              data-testid="slider-score-range"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
