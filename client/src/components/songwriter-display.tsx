import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SongwriterDisplayProps {
  songwriters: string | null;
  className?: string;
  testId?: string;
}

export function SongwriterDisplay({ songwriters, className, testId }: SongwriterDisplayProps) {
  const [open, setOpen] = useState(false);

  if (!songwriters) {
    return (
      <span className={`text-muted-foreground italic ${className || ""}`} data-testid={testId}>
        Unknown
      </span>
    );
  }

  // Parse songwriters - they might be separated by commas, semicolons, or " and "
  const songwriterList = songwriters
    .split(/[,;]|\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (songwriterList.length === 0) {
    return (
      <span className={`text-muted-foreground italic ${className || ""}`} data-testid={testId}>
        Unknown
      </span>
    );
  }

  if (songwriterList.length === 1) {
    return (
      <span className={className} data-testid={testId}>
        {songwriterList[0]}
      </span>
    );
  }

  // Multiple songwriters - show first + expandable badge
  const firstSongwriter = songwriterList[0];
  const remainingCount = songwriterList.length - 1;

  return (
    <div className={`flex items-center gap-2 ${className || ""}`} data-testid={testId}>
      <span>{firstSongwriter}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          onClick={(e) => e.stopPropagation()}
        >
          <Badge
            variant="secondary"
            className="cursor-pointer hover-elevate active-elevate-2 text-xs"
            data-testid={`badge-more-songwriters-${testId}`}
          >
            +{remainingCount}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-80 glass-panel" data-testid={`popover-songwriters-${testId}`}>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">All Songwriters</h4>
            <div className="space-y-1">
              {songwriterList.map((songwriter, index) => (
                <div
                  key={index}
                  className="text-sm py-1 px-2 rounded hover-elevate"
                  data-testid={`text-songwriter-item-${index}`}
                >
                  {songwriter}
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
