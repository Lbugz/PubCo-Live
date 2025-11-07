import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, Download, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalFilteredCount: number;
  onEnrichMB: () => void;
  onEnrichCredits: () => void;
  onExport: () => void;
  onTag: () => void;
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
          <Button
            onClick={onEnrichMB}
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
          </Button>

          <Button
            onClick={onEnrichCredits}
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
          </Button>

          <Button
            onClick={onTag}
            variant="outline"
            size="sm"
            className="gap-2"
            data-testid="button-bulk-tag"
          >
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Tag</span>
          </Button>

          <Button
            onClick={onExport}
            variant="outline"
            size="sm"
            className="gap-2"
            data-testid="button-bulk-export"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>

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
