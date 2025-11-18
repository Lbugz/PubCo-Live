import { cn } from "@/lib/utils";

interface EnrichmentStatus {
  searched: boolean;
  found: boolean;
}

interface EnrichmentSourceIndicatorProps {
  mlc?: EnrichmentStatus;
  musicbrainz?: EnrichmentStatus;
  chartmetric?: EnrichmentStatus;
  className?: string;
}

export function EnrichmentSourceIndicator({
  mlc = { searched: false, found: false },
  musicbrainz = { searched: false, found: false },
  chartmetric = { searched: false, found: false },
  className
}: EnrichmentSourceIndicatorProps) {
  
  const getStatusSymbol = (status: EnrichmentStatus) => {
    if (!status.searched) {
      return <span className="text-muted-foreground/50">( )</span>;
    }
    if (status.found) {
      return <span className="text-green-500">(✓)</span>;
    }
    return <span className="text-muted-foreground">(✗)</span>;
  };

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)} data-testid="enrichment-source-indicator">
      <span className="inline-flex items-center gap-1">
        <span>MLC</span>
        {getStatusSymbol(mlc)}
      </span>
      <span className="inline-flex items-center gap-1">
        <span>MB</span>
        {getStatusSymbol(musicbrainz)}
      </span>
      <span className="inline-flex items-center gap-1">
        <span>CTM</span>
        {getStatusSymbol(chartmetric)}
      </span>
    </div>
  );
}
