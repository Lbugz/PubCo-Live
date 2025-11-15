import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SortableTableHeaderProps {
  label: string;
  field: string;
  currentSort?: { field: string; direction: "asc" | "desc" };
  onSort?: (field: string) => void;
  className?: string;
  testId?: string;
}

export function SortableTableHeader({
  label,
  field,
  currentSort,
  onSort,
  className,
  testId,
}: SortableTableHeaderProps) {
  const isSorted = currentSort?.field === field;
  const isAsc = isSorted && currentSort?.direction === "asc";
  const isDesc = isSorted && currentSort?.direction === "desc";

  const handleClick = () => {
    if (onSort) {
      onSort(field);
    }
  };

  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none hover-elevate active-elevate-2",
        className
      )}
      onClick={handleClick}
      data-testid={testId || `header-${field}`}
    >
      <div className="flex items-center gap-2">
        <span>{label}</span>
        <div className="flex flex-col">
          {!isSorted && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
          {isAsc && <ArrowUp className="h-3 w-3 text-primary" />}
          {isDesc && <ArrowDown className="h-3 w-3 text-primary" />}
        </div>
      </div>
    </TableHead>
  );
}

export interface SortableHeaderForGridProps {
  label: string;
  field: string;
  currentSort?: { field: string; direction: "asc" | "desc" };
  onSort?: (field: string) => void;
  className?: string;
  testId?: string;
}

export function SortableHeaderForGrid({
  label,
  field,
  currentSort,
  onSort,
  className,
  testId,
}: SortableHeaderForGridProps) {
  const isSorted = currentSort?.field === field;
  const isAsc = isSorted && currentSort?.direction === "asc";
  const isDesc = isSorted && currentSort?.direction === "desc";

  const handleClick = () => {
    if (onSort) {
      onSort(field);
    }
  };

  return (
    <div
      className={cn(
        "cursor-pointer select-none hover-elevate active-elevate-2 flex items-center gap-2",
        className
      )}
      onClick={handleClick}
      data-testid={testId || `header-${field}`}
    >
      <span>{label}</span>
      <div className="flex flex-col">
        {!isSorted && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
        {isAsc && <ArrowUp className="h-3 w-3 text-primary" />}
        {isDesc && <ArrowDown className="h-3 w-3 text-primary" />}
      </div>
    </div>
  );
}
