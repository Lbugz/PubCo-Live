import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <Card className={cn("border-primary/20", className)}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

interface FilterBarSearchProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  testId?: string;
}

function FilterBarSearch({ 
  placeholder = "Search...", 
  value, 
  onChange, 
  className,
  testId = "input-search"
}: FilterBarSearchProps) {
  return (
    <div className={cn("flex-1 relative min-w-[200px]", className)}>
      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10"
        data-testid={testId}
      />
    </div>
  );
}

interface FilterBarDropdownOption {
  value: string;
  label: string;
}

interface FilterBarDropdownProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterBarDropdownOption[];
  className?: string;
  testId?: string;
}

function FilterBarDropdown({
  label,
  placeholder = "Select...",
  value,
  onChange,
  options,
  className,
  testId = "select-filter"
}: FilterBarDropdownProps) {
  return (
    <div className={cn("min-w-[150px]", className)}>
      {label && <span className="text-xs text-muted-foreground mr-2">{label}:</span>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface FilterPill {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: "default" | "hot" | "success";
  testId?: string;
}

interface FilterBarPillsProps {
  pills: FilterPill[];
  showClear?: boolean;
  onClearAll?: () => void;
  className?: string;
}

function FilterBarPills({ pills, showClear, onClearAll, className }: FilterBarPillsProps) {
  const hasActiveFilters = pills.some(p => p.active);

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-xs text-muted-foreground">Quick filters:</span>
      {pills.map((pill) => {
        const Icon = pill.icon;
        let variantClass = "";
        
        if (pill.active) {
          if (pill.variant === "hot") {
            variantClass = "bg-orange-500/20 text-orange-400 border-orange-500/30";
          } else if (pill.variant === "success") {
            variantClass = "bg-chart-2/20 text-chart-2 border-chart-2/30";
          }
        }

        return (
          <Badge
            key={pill.label}
            variant={pill.active ? "default" : "outline"}
            className={cn(
              "cursor-pointer hover-elevate active-elevate-2",
              variantClass
            )}
            onClick={pill.onClick}
            data-testid={pill.testId}
          >
            {Icon && <Icon className="h-3 w-3 mr-1" />}
            {pill.label}
          </Badge>
        );
      })}

      {showClear && hasActiveFilters && onClearAll && (
        <Badge
          variant="outline"
          className="cursor-pointer hover-elevate active-elevate-2 gap-1"
          onClick={onClearAll}
          data-testid="badge-clear-filters"
        >
          <X className="h-3 w-3" />
          Clear filters
        </Badge>
      )}
    </div>
  );
}

interface FilterBarActionsProps {
  children: React.ReactNode;
  className?: string;
}

function FilterBarActions({ children, className }: FilterBarActionsProps) {
  return (
    <div className={cn("flex items-center gap-2 ml-auto", className)}>
      {children}
    </div>
  );
}

interface FilterBarAdvancedFiltersProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

function FilterBarAdvancedFilters({ children, className, testId = "button-advanced-filters" }: FilterBarAdvancedFiltersProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)} data-testid={testId}>
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Advanced Filters</span>
          <span className="sm:hidden">Filters</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface FilterBarFiltersGroupProps {
  children: React.ReactNode;
  className?: string;
}

function FilterBarFiltersGroup({ children, className }: FilterBarFiltersGroupProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  );
}

FilterBar.Search = FilterBarSearch;
FilterBar.Dropdown = FilterBarDropdown;
FilterBar.Pills = FilterBarPills;
FilterBar.Actions = FilterBarActions;
FilterBar.AdvancedFilters = FilterBarAdvancedFilters;
FilterBar.FiltersGroup = FilterBarFiltersGroup;
