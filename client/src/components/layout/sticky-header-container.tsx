import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StickyHeaderContainerProps {
  children: ReactNode;
  className?: string;
  zIndex?: number;
}

export function StickyHeaderContainer({ 
  children, 
  className,
  zIndex = 30
}: StickyHeaderContainerProps) {
  return (
    <div 
      className={cn("sticky top-0 bg-background", className)}
      style={{ zIndex }}
    >
      {children}
    </div>
  );
}
