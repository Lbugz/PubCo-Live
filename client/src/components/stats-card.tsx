import { type LucideIcon, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "blue" | "green" | "gold";
  testId?: string;
  tooltip?: string;
  change?: number;
  onClick?: () => void;
}

export function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  variant = "default", 
  testId,
  tooltip,
  change,
  onClick
}: StatsCardProps) {
  const iconColorClass = cn(
    "h-5 w-5",
    variant === "success" && "text-chart-2",
    variant === "warning" && "text-chart-4",
    variant === "default" && "text-muted-foreground",
    variant === "blue" && "text-blue-500",
    variant === "green" && "text-chart-2",
    variant === "gold" && "text-yellow-500"
  );

  const trendColorClass = change !== undefined
    ? change > 0
      ? "text-chart-2"
      : change < 0
      ? "text-red-400"
      : "text-muted-foreground"
    : "";

  const cardContent = (
    <Card 
      className={cn(
        "hover-elevate transition-all",
        onClick && "cursor-pointer active-elevate-2"
      )} 
      data-testid={testId}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {tooltip && <Info className="h-3.5 w-3.5 text-muted-foreground/60" />}
        </div>
        <Icon className={iconColorClass} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        
        {change !== undefined && (
          <div className={cn("flex items-center gap-1 mt-1 text-xs font-medium", trendColorClass)}>
            {change > 0 && <TrendingUp className="h-3 w-3" />}
            {change < 0 && <TrendingDown className="h-3 w-3" />}
            <span>
              {change === 0
                ? "No change"
                : `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs last week`}
            </span>
          </div>
        )}
        
        {subtitle && !change && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {cardContent}
          </TooltipTrigger>
          <TooltipContent className="max-w-[250px] text-sm">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return cardContent;
}
