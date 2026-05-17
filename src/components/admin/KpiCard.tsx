import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  caption?: string;
  icon?: LucideIcon;
}

export function KpiCard({ title, value, delta, deltaTone = "neutral", caption, icon: Icon }: KpiCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        {Icon ? (
          <div className="rounded-md bg-admin-positive/10 text-admin-positive p-1.5">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {(delta || caption) && (
        <div className="mt-3 text-xs flex items-center gap-1">
          {delta ? (
            <span
              className={cn(
                "font-medium",
                deltaTone === "positive" && "text-admin-positive",
                deltaTone === "negative" && "text-destructive",
                deltaTone === "neutral" && "text-muted-foreground",
              )}
            >
              {delta}
            </span>
          ) : null}
          {caption ? <span className="text-muted-foreground">{caption}</span> : null}
        </div>
      )}
    </div>
  );
}
