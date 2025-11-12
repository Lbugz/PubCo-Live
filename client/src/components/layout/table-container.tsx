import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TableContainerProps {
  children: ReactNode;
  className?: string;
}

export function TableContainer({ children, className }: TableContainerProps) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-lg shadow-sm overflow-hidden",
      className
    )}>
      {children}
    </div>
  );
}
