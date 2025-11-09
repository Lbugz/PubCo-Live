import { cn } from "@/lib/utils";

interface MagicPatternsSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function MagicPatternsSection({ children, className }: MagicPatternsSectionProps) {
  return (
    <div className={cn(
      "glass-panel rounded-xl p-6",
      className
    )}>
      {children}
    </div>
  );
}

interface MagicPatternsPageContainerProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function MagicPatternsPageContainer({ children, title, subtitle, actions }: MagicPatternsPageContainerProps) {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-gradient">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground mt-2">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}
