import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "high" | "medium" | "low";
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  variant = "default",
  className,
}: StatCardProps) {
  const variantStyles = {
    default: "border-border",
    high: "border-status-high/30 bg-status-high/5",
    medium: "border-status-medium/30 bg-status-medium/5",
    low: "border-status-low/30 bg-status-low/5",
  };

  const iconColors = {
    default: "text-muted-foreground",
    high: "text-status-high",
    medium: "text-status-medium",
    low: "text-status-low",
  };

  return (
    <Card
      className={cn(
        "glass-panel p-6 interactive-scale",
        variantStyles[variant],
        className
      )}
      data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-3xl font-bold font-heading" data-testid="stat-value">
              {value}
            </h3>
            {trendValue && (
              <span
                className={cn(
                  "text-sm font-medium",
                  trend === "up" && "text-status-high",
                  trend === "down" && "text-status-low",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {trend === "up" && "↗"}
                {trend === "down" && "↘"}
                {trend === "neutral" && "—"}
                {trendValue}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "rounded-lg p-3 bg-card/50",
              iconColors[variant]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
