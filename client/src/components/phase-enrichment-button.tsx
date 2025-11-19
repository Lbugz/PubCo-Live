import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PhaseStatus {
  searched: boolean;
  found: boolean;
  label: string;
}

interface PhaseEnrichmentButtonProps {
  phase: number;
  phaseName: string;
  icon: string;
  status: PhaseStatus;
  isLoading: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function PhaseEnrichmentButton({
  phase,
  phaseName,
  icon,
  status,
  isLoading,
  onClick,
  disabled = false,
}: PhaseEnrichmentButtonProps) {
  const getStatusColor = () => {
    if (isLoading) return "text-blue-500";
    if (!status.searched) return "text-muted-foreground";
    if (status.found) return "text-green-500";
    return "text-orange-500";
  };

  const getStatusIcon = () => {
    if (isLoading) {
      return <Loader2 className="h-3 w-3 animate-spin" />;
    }
    if (!status.searched) return "○";
    if (status.found) return "✓";
    return "✗";
  };

  const getTooltipText = () => {
    if (isLoading) return `Running ${phaseName}...`;
    if (!status.searched) return `Click to run ${phaseName}`;
    if (status.found) return `${phaseName}: Found data (click to refresh)`;
    return `${phaseName}: No data found (click to retry)`;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClick}
          disabled={disabled || isLoading}
          className="h-6 gap-1 px-2 text-xs hover-elevate active-elevate-2"
          data-testid={`button-enrich-phase-${phase}`}
        >
          <span className="text-sm">{icon}</span>
          <span className={getStatusColor()}>{getStatusIcon()}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{getTooltipText()}</p>
        <p className="text-xs text-muted-foreground">{status.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
