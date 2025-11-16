import { ReactNode, useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  id: string;
  header: string | ReactNode;
  sortField?: string;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  emptyState?: ReactNode;
  
  // Selection
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  onToggleSelectAll?: () => void;
  
  // Sorting
  sortField?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (field: string) => void;
  
  // Row interaction
  onRowClick?: (row: T) => void;
  
  // Virtualization (optional - for large datasets)
  virtualized?: boolean;
  estimateRowSize?: number;
  containerHeight?: string;
  
  // Styling
  bordered?: boolean;
  striped?: boolean;
  hoverable?: boolean;
  className?: string;
  
  // Test IDs
  testIdPrefix?: string;
}

function DataTableInner<T>({
  data,
  columns,
  getRowId,
  isLoading,
  emptyState,
  selectedIds = new Set(),
  onToggleSelection,
  onToggleSelectAll,
  sortField,
  sortDirection,
  onSort,
  onRowClick,
  virtualized = false,
  estimateRowSize = 60,
  containerHeight = "calc(100vh - 300px)",
  bordered = true,
  striped = true,
  hoverable = true,
  className,
  testIdPrefix = "table",
}: DataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowSize,
    overscan: 5,
    enabled: virtualized,
  });

  const allSelected = data.length > 0 && data.every(row => selectedIds.has(getRowId(row)));
  const someSelected = !allSelected && data.some(row => selectedIds.has(getRowId(row)));
  const hasSelection = !!onToggleSelection;

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn(bordered && "glass-panel", className)}>
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  // Empty state
  if (data.length === 0 && emptyState) {
    return (
      <Card className={cn(bordered && "glass-panel", className)}>
        {emptyState}
      </Card>
    );
  }

  const renderHeader = () => (
    <TableHeader>
      <TableRow>
        {hasSelection && (
          <TableHead className="w-12">
            <Checkbox
              checked={someSelected ? "indeterminate" : allSelected}
              onCheckedChange={onToggleSelectAll}
              aria-label="Select all"
              data-testid={`${testIdPrefix}-checkbox-select-all`}
            />
          </TableHead>
        )}
        {columns.map((column) => {
          if (column.sortField && onSort) {
            return (
              <SortableTableHeader
                key={column.id}
                label={column.header as string}
                field={column.sortField}
                currentSort={sortField && sortDirection ? { field: sortField, direction: sortDirection } : undefined}
                onSort={onSort}
                className={column.headerClassName}
                testId={`${testIdPrefix}-header-${column.id}`}
              />
            );
          }
          return (
            <TableHead
              key={column.id}
              className={column.headerClassName}
              data-testid={`${testIdPrefix}-header-${column.id}`}
            >
              {column.header}
            </TableHead>
          );
        })}
      </TableRow>
    </TableHeader>
  );

  const renderRow = (row: T, index: number) => {
    const rowId = getRowId(row);
    const isSelected = selectedIds.has(rowId);

    return (
      <TableRow
        key={rowId}
        className={cn(
          hoverable && "hover-elevate",
          onRowClick && "cursor-pointer",
          isSelected && "bg-primary/5",
          striped && index % 2 === 0 && "bg-muted/30"
        )}
        onClick={() => onRowClick?.(row)}
        data-testid={`${testIdPrefix}-row-${rowId}`}
      >
        {hasSelection && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelection?.(rowId)}
              aria-label={`Select ${rowId}`}
              data-testid={`${testIdPrefix}-checkbox-${rowId}`}
            />
          </TableCell>
        )}
        {columns.map((column) => (
          <TableCell
            key={column.id}
            className={column.className}
            data-testid={`${testIdPrefix}-cell-${column.id}-${rowId}`}
          >
            {column.cell(row, index)}
          </TableCell>
        ))}
      </TableRow>
    );
  };

  // Non-virtualized rendering
  if (!virtualized) {
    return (
      <Card className={cn(bordered && "glass-panel", className)}>
        <div className="overflow-x-auto">
          <Table>
            {renderHeader()}
            <TableBody>
              {data.map((row, index) => renderRow(row, index))}
            </TableBody>
          </Table>
        </div>
      </Card>
    );
  }

  // Virtualized rendering
  const virtualItems = virtualizer.getVirtualItems();
  
  return (
    <Card className={cn(bordered && "glass-panel", className)}>
      <div className="overflow-x-auto">
        <Table>
          {renderHeader()}
        </Table>
      </div>
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: containerHeight, minHeight: '400px' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = data[virtualRow.index];
            const rowId = getRowId(row);
            const isSelected = selectedIds.has(rowId);
            
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Table>
                  <TableBody>
                    <TableRow
                      className={cn(
                        hoverable && "hover-elevate",
                        onRowClick && "cursor-pointer",
                        isSelected && "bg-primary/5",
                        striped && virtualRow.index % 2 === 0 && "bg-muted/30"
                      )}
                      onClick={() => onRowClick?.(row)}
                      data-testid={`${testIdPrefix}-row-${rowId}`}
                    >
                      {hasSelection && (
                        <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggleSelection?.(rowId)}
                            aria-label={`Select ${rowId}`}
                            data-testid={`${testIdPrefix}-checkbox-${rowId}`}
                          />
                        </TableCell>
                      )}
                      {columns.map((column) => (
                        <TableCell
                          key={column.id}
                          className={column.className}
                          data-testid={`${testIdPrefix}-cell-${column.id}-${rowId}`}
                        >
                          {column.cell(row, virtualRow.index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
