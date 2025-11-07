import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, Download, Tag, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BulkActionMode = "selected" | "filtered";

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalFilteredCount: number;
  onEnrichMB: (mode: BulkActionMode) => void;
  onEnrichCredits: (mode: BulkActionMode) => void;
  onExport: (mode: BulkActionMode) => void;
  onTag: (mode: BulkActionMode) => void;
  onClearSelection: () => void;
  isEnrichingMB?: boolean;
  isEnrichingCredits?: boolean;
}

export function BulkActionsToolbar({
  selectedCount,
  totalFilteredCount,
  onEnrichMB,
  onEnrichCredits,
  onExport,
  onTag,
  onClearSelection,
  isEnrichingMB = false,
  isEnrichingCredits = false,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <Card className={cn(
      "glass-panel p-4 mb-4",
      "border-primary/30 bg-primary/5",
      "sticky top-0 z-20"
    )}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Selection Info */}
        <div className="flex items-center gap-3">
          <Badge variant="default" className="text-sm font-semibold" data-testid="badge-selected-count">
            {selectedCount} selected
          </Badge>
          <span className="text-sm text-muted-foreground">
            of {totalFilteredCount} filtered tracks
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Enrich (MB) Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isEnrichingMB}
                data-testid="button-bulk-enrich-mb"
              >
                <Sparkles className={cn("h-4 w-4", isEnrichingMB && "animate-pulse")} />
                <span className="hidden sm:inline">
                  {isEnrichingMB ? "Enriching..." : "Enrich (MB)"}
                </span>
                {!isEnrichingMB && <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>MusicBrainz Enrichment</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onEnrichMB("selected")}
                data-testid="menu-enrich-mb-selected"
              >
                Apply to Selected ({selectedCount} tracks)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onEnrichMB("filtered")}
                data-testid="menu-enrich-mb-filtered"
              >
                Apply to All Filtered ({totalFilteredCount} tracks)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Enrich Credits Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isEnrichingCredits}
                data-testid="button-bulk-enrich-credits"
              >
                <FileText className={cn("h-4 w-4", isEnrichingCredits && "animate-pulse")} />
                <span className="hidden sm:inline">
                  {isEnrichingCredits ? "Scraping..." : "Enrich (Credits)"}
                </span>
                {!isEnrichingCredits && <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Spotify Credits Scraping</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onEnrichCredits("selected")}
                data-testid="menu-enrich-credits-selected"
              >
                Apply to Selected ({selectedCount} tracks)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onEnrichCredits("filtered")}
                data-testid="menu-enrich-credits-filtered"
              >
                Apply to All Filtered ({totalFilteredCount} tracks)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tag Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-bulk-tag"
              >
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Tag</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Bulk Tagging</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onTag("selected")}
                data-testid="menu-tag-selected"
              >
                Tag Selected ({selectedCount} tracks)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onTag("filtered")}
                data-testid="menu-tag-filtered"
              >
                Tag All Filtered ({totalFilteredCount} tracks)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-bulk-export"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Export CSV</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onExport("selected")}
                data-testid="menu-export-selected"
              >
                Export Selected ({selectedCount} tracks)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onExport("filtered")}
                data-testid="menu-export-filtered"
              >
                Export All Filtered ({totalFilteredCount} tracks)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Selection */}
          <Button
            onClick={onClearSelection}
            variant="ghost"
            size="sm"
            className="gap-2"
            data-testid="button-clear-selection"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
