import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "success" | "warning";
  testId?: string;
}

export function StatsCard({ title, value, subtitle, icon: Icon, variant = "default", testId }: StatsCardProps) {
  return (
    <Card className="hover-elevate" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Icon className={cn(
          "h-5 w-5",
          variant === "success" && "text-chart-2",
          variant === "warning" && "text-chart-4",
          variant === "default" && "text-muted-foreground"
        )} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
