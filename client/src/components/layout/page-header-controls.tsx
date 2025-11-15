import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LayoutList, LayoutGrid, Kanban } from "lucide-react";

export type ViewMode = "table" | "card" | "kanban";

interface PageHeaderControlsProps {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  availableViews?: ViewMode[];
  count: number;
  countLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}

const VIEW_CONFIG = {
  table: {
    icon: LayoutList,
    label: "Table",
    testId: "button-view-table",
  },
  card: {
    icon: LayoutGrid,
    label: "Card",
    testId: "button-view-card",
  },
  kanban: {
    icon: Kanban,
    label: "Kanban",
    testId: "button-view-kanban",
  },
};

export function PageHeaderControls({
  viewMode,
  onViewModeChange,
  availableViews = ["table", "card"],
  count,
  countLabel = "results",
  actions,
  className,
}: PageHeaderControlsProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between glass-panel backdrop-blur-xl p-3 rounded-lg border border-primary/20",
        className
      )}
    >
      <div className="flex items-center gap-4">
        {/* View Toggle - Always on LEFT */}
        {viewMode && onViewModeChange && (
          <div className="flex gap-2">
            {availableViews.map((view) => {
              const config = VIEW_CONFIG[view];
              const Icon = config.icon;
              return (
                <Button
                  key={view}
                  variant={viewMode === view ? "default" : "outline"}
                  size="sm"
                  onClick={() => onViewModeChange(view)}
                  className="gap-2"
                  data-testid={config.testId}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{config.label}</span>
                </Button>
              );
            })}
          </div>
        )}

        {/* Count Display - Standardized Typography */}
        <div className="text-sm text-muted-foreground whitespace-nowrap" data-testid="text-count">
          <span className="font-medium text-foreground">{count.toLocaleString()}</span>{" "}
          {countLabel}
        </div>
      </div>

      {/* Optional Actions */}
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
