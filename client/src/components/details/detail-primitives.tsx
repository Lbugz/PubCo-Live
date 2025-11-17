import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Circle, Clock3, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export interface HeaderBadge {
  label: string;
  variant?: "default" | "secondary" | "outline" | "high" | "medium" | "low";
}

const badgeVariants: Record<NonNullable<HeaderBadge["variant"]>, string> = {
  default: "bg-primary/10 text-primary border-transparent",
  secondary: "bg-muted text-muted-foreground border-transparent",
  outline: "border-border text-foreground",
  high: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

export interface DetailDrawerHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  badges?: HeaderBadge[];
  imageUrl?: string;
  fallback: string;
  meta?: Array<{ label: string; value: string }>;
}

export function DetailDrawerHeader({
  title,
  subtitle,
  description,
  badges = [],
  imageUrl,
  fallback,
  meta = [],
}: DetailDrawerHeaderProps) {
  return (
    <div className="flex gap-4">
      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-muted shadow-inner">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/40 text-2xl font-semibold text-muted-foreground">
            {fallback}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {subtitle}
            </p>
            {badges.map((badge, idx) => (
              <Badge
                key={`${badge.label}-${idx}`}
                variant="outline"
                className={cn(
                  "rounded-full px-2.5 py-0 text-[11px] font-medium uppercase",
                  badgeVariants[badge.variant ?? "default"],
                )}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
          <h2 className="text-2xl font-semibold leading-tight text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {meta.length ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {meta.map((item) => (
              <div key={item.label} className="space-y-0.5">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
                <dd className="font-medium text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

export interface StatsGridProps {
  stats: Array<{
    label: string;
    value: string;
    helper?: string;
    trend?: "up" | "down" | "neutral";
  }>;
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="border border-border/60 bg-card/60 shadow-sm">
          <CardContent className="space-y-1.5 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
            <p className="text-xl font-semibold text-foreground">{stat.value}</p>
            {stat.helper ? (
              <p className="text-xs text-muted-foreground">{stat.helper}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export interface ActionRailProps {
  primaryAction: {
    label: string;
    icon?: LucideIcon;
    onClick?: () => void;
  };
  secondaryActions?: Array<{
    label: string;
    icon?: LucideIcon;
    subtle?: boolean;
    onClick?: () => void;
  }>;
}

export function ActionRail({ primaryAction, secondaryActions = [] }: ActionRailProps) {
  const PrimaryIcon = primaryAction.icon;
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-muted/40 p-4">
      <Button className="flex-1 justify-center gap-2" size="default" onClick={primaryAction.onClick} data-testid="action-rail-primary">
        {PrimaryIcon ? <PrimaryIcon className="h-4 w-4" /> : null}
        {primaryAction.label}
      </Button>
      {secondaryActions.map((action, index) => {
        const Icon = action.icon;
        return (
          <TooltipProvider key={`${action.label}-${index}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={action.subtle ? "ghost" : "outline"}
                  size="icon"
                  onClick={action.onClick}
                  aria-label={action.label}
                  data-testid={`action-rail-secondary-${index}`}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{action.label}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export interface EnrichmentTimelineStep {
  label: string;
  description: string;
  timestamp?: string;
  status: "done" | "active" | "pending";
}

const statusIcon: Record<EnrichmentTimelineStep["status"], LucideIcon> = {
  done: CheckCircle2,
  active: Clock3,
  pending: Circle,
};

export function EnrichmentTimeline({ steps }: { steps: EnrichmentTimelineStep[] }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/40 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Activity & Enrichment
      </p>
      <div className="space-y-4">
        {steps.map((step, index) => {
          const Icon = statusIcon[step.status];
          return (
            <div key={`${step.label}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border",
                    step.status === "done" && "border-emerald-400 bg-emerald-500/10 text-emerald-300",
                    step.status === "active" && "border-amber-400 bg-amber-500/10 text-amber-300 animate-enrichment-pulse",
                    step.status === "pending" && "border-border text-muted-foreground",
                  )}
                >
                  <Icon className={cn(
                    "h-4 w-4",
                    step.status === "active" && "animate-enrichment-pulse"
                  )} />
                </span>
                {index < steps.length - 1 ? (
                  <div className="mt-2 w-px flex-1 bg-border" style={{ minHeight: "2rem" }} />
                ) : null}
              </div>
              <div className="flex-1 space-y-1 pb-4">
                <p className="text-sm font-semibold text-foreground">{step.label}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
                {step.timestamp ? (
                  <p className="text-xs text-muted-foreground/80">{step.timestamp}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface EnrichmentSource {
  label: string;
  matched: boolean;
  tooltip?: string;
}

export interface EnrichmentDetail {
  source: string;
  matched: boolean;
  details: Array<{ label: string; value: string; link?: string }>;
  searchedAt?: string;
}

export interface PersonListProps {
  people: Array<{
    name: string;
    role: string;
    badge?: string;
    avatarUrl?: string;
    enrichmentSources?: EnrichmentSource[];
    enrichmentDetails?: EnrichmentDetail[];
  }>;
}

export function PersonList({ people }: PersonListProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {people.map((person, idx) => {
        const isExpanded = expandedIdx === idx;
        const hasDetails = person.enrichmentDetails && person.enrichmentDetails.length > 0;

        return (
          <div
            key={`${person.name}-${idx}`}
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-border/60 p-3 transition-colors",
              hasDetails && "cursor-pointer hover-elevate"
            )}
          >
            <div
              className="flex items-center gap-3"
              onClick={() => hasDetails && setExpandedIdx(isExpanded ? null : idx)}
              data-testid={`person-${idx}`}
            >
              <Avatar className="h-10 w-10">
                {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt={person.name} /> : null}
                <AvatarFallback>{person.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col">
                <p className="font-medium text-foreground">{person.name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{person.role}</p>
              </div>
              {hasDetails ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )
              ) : null}
              {person.badge ? (
                <Badge className="rounded-full bg-emerald-500/10 text-emerald-300" variant="outline">
                  {person.badge}
                </Badge>
              ) : null}
            </div>

            {person.enrichmentSources && person.enrichmentSources.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pl-[3.25rem]">
                {person.enrichmentSources.map((source, srcIdx) => (
                  <span
                    key={`${source.label}-${srcIdx}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      source.matched
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-muted/50 text-muted-foreground border border-border/40"
                    )}
                    title={source.tooltip}
                  >
                    {source.label}
                    <span className="text-[9px]">{source.matched ? "✓" : "✗"}</span>
                  </span>
                ))}
              </div>
            ) : null}

            {isExpanded && person.enrichmentDetails ? (
              <div className="mt-2 space-y-3 border-t border-border/40 pt-3">
                {person.enrichmentDetails.map((detail, detailIdx) => (
                  <div key={`detail-${detailIdx}`} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
                          detail.matched
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {detail.matched ? "✓" : "✗"}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{detail.source}</p>
                      {detail.searchedAt ? (
                        <span className="text-xs text-muted-foreground">· {detail.searchedAt}</span>
                      ) : null}
                    </div>
                    <div className="space-y-1 pl-8">
                      {detail.details.map((item, itemIdx) => (
                        <div
                          key={`item-${itemIdx}`}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            {item.value}
                            {item.link ? (
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Separator className="mt-2" />
      </div>
      {children}
    </section>
  );
}
