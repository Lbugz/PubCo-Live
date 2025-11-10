import { Badge } from "@/components/ui/badge";
import { Building2, User, Users, Building } from "lucide-react";
import { cn } from "@/lib/utils";

type PublisherStatus = "Unsigned" | "Self-Published" | "Indie" | "Major" | null | undefined;

interface PublisherStatusBadgeProps {
  status: PublisherStatus | string;
  className?: string;
  showIcon?: boolean;
}

function normalizeStatus(status: PublisherStatus | string): PublisherStatus {
  if (!status) return null;
  const normalized = status.toLowerCase().trim();
  
  if (normalized.includes("unsigned") || normalized === "none") return "Unsigned";
  if (normalized.includes("self") || normalized.includes("self-published")) return "Self-Published";
  if (normalized.includes("indie") || normalized.includes("independent")) return "Indie";
  if (normalized.includes("major")) return "Major";
  
  return null;
}

function getStatusConfig(status: PublisherStatus) {
  switch (status) {
    case "Unsigned":
      return {
        label: "Unsigned",
        className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover-elevate",
        icon: User,
        priority: 1,
      };
    case "Self-Published":
      return {
        label: "Self-Published",
        className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover-elevate",
        icon: User,
        priority: 2,
      };
    case "Indie":
      return {
        label: "Indie",
        className: "bg-amber-500/20 text-amber-400 border-amber-500/30 hover-elevate",
        icon: Users,
        priority: 3,
      };
    case "Major":
      return {
        label: "Major",
        className: "bg-slate-500/20 text-slate-400 border-slate-500/30 hover-elevate",
        icon: Building,
        priority: 4,
      };
    default:
      return {
        label: "Unknown",
        className: "bg-muted/40 text-muted-foreground border-muted hover-elevate",
        icon: Building2,
        priority: 5,
      };
  }
}

export function PublisherStatusBadge({ status, className, showIcon = false }: PublisherStatusBadgeProps) {
  const normalizedStatus = normalizeStatus(status);
  const config = getStatusConfig(normalizedStatus);
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium uppercase tracking-wide",
        config.className,
        className
      )}
      data-testid={`badge-publisher-status-${normalizedStatus?.toLowerCase() || "unknown"}`}
    >
      {showIcon && <Icon className="w-3 h-3 mr-1" />}
      {config.label}
    </Badge>
  );
}

export function getPublisherStatusPriority(status: PublisherStatus | string): number {
  const normalizedStatus = normalizeStatus(status);
  const config = getStatusConfig(normalizedStatus);
  return config.priority;
}
