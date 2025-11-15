import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <Card className={cn("border-primary/20", className)}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
