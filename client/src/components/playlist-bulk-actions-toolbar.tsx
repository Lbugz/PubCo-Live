import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, X, ChevronDown } from "lucide-react";
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

interface PlaylistBulkActionsToolbarProps {
  selectedCount: number;
  totalFilteredCount: number;
  onFetchData: (mode: BulkActionMode) => void;
  onRefreshMetadata: (mode: BulkActionMode) => void;
  onExport: (mode: BulkActionMode) => void;
  onClearSelection: () => void;
  isFetching?: boolean;
  isRefreshing?: boolean;
}

export function PlaylistBulkActionsToolbar({
  selectedCount,
  totalFilteredCount,
  onFetchData,
  onRefreshMetadata,
  onExport,
  onClearSelection,
  isFetching = false,
  isRefreshing = false,
}: PlaylistBulkActionsToolbarProps) {
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
            of {totalFilteredCount} filtered playlists
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Fetch Data Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isFetching}
                data-testid="button-bulk-fetch"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                <span className="hidden sm:inline">
                  {isFetching ? "Fetching..." : "Fetch Data"}
                </span>
                {!isFetching && <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Fetch Playlist Data</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onFetchData("selected")}
                data-testid="menu-fetch-selected"
              >
                Fetch Selected ({selectedCount} playlists)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onFetchData("filtered")}
                data-testid="menu-fetch-filtered"
              >
                Fetch All Filtered ({totalFilteredCount} playlists)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Metadata Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isRefreshing}
                data-testid="button-bulk-refresh"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                <span className="hidden sm:inline">
                  {isRefreshing ? "Refreshing..." : "Refresh Metadata"}
                </span>
                {!isRefreshing && <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Refresh Spotify Metadata</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onRefreshMetadata("selected")}
                data-testid="menu-refresh-selected"
              >
                Refresh Selected ({selectedCount} playlists)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onRefreshMetadata("filtered")}
                data-testid="menu-refresh-filtered"
              >
                Refresh All Filtered ({totalFilteredCount} playlists)
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
                Export Selected ({selectedCount} playlists)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onExport("filtered")}
                data-testid="menu-export-filtered"
              >
                Export All Filtered ({totalFilteredCount} playlists)
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
