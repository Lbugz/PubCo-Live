import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimplePaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  itemName?: string;
  className?: string;
}

export function SimplePagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  itemName = "items",
  className,
}: SimplePaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center justify-between gap-4 px-2 py-4 border-t bg-card", className)}>
      <div className="text-sm text-muted-foreground" data-testid="pagination-info">
        Showing <span className="font-medium text-foreground">{startItem.toLocaleString()}</span> to{" "}
        <span className="font-medium text-foreground">{endItem.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems.toLocaleString()}</span> {itemName}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          className="gap-1"
          data-testid="pagination-previous"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="gap-1"
          data-testid="pagination-next"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
