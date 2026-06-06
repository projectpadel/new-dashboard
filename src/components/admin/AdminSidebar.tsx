"use client";

import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  GraduationCap,
  CalendarDays,
  BookOpen,
  Swords,
  Trophy,
  Bell,
  Settings,
  LogOut,
  Leaf,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = { to: string; label: string; icon?: LucideIcon; textIcon?: string };

const groups: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<NavItem>;
}> = [
  {
    label: "Operasional",
    items: [
      { to: "/admin/keuangan", label: "Keuangan", icon: LayoutGrid },
      { to: "/admin/pengguna", label: "Pengguna", icon: Users },
      { to: "/admin/coach", label: "Coach", icon: GraduationCap },
      { to: "/admin/reservasi", label: "Reservasi", icon: CalendarDays },
      { to: "/admin/program", label: "Program", icon: BookOpen },
      { to: "/admin/match", label: "Match", icon: Swords },
      { to: "/admin/tournament", label: "Tournament", icon: Trophy },
    ],
  },
  {
    label: "Sistem",
    items: [
      { to: "/admin/ai-assistant", label: "AI Assistant", textIcon: "AI" },
      { to: "/admin/notifikasi", label: "Notifikasi", icon: Bell },
      { to: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
    ],
  },
];

function NavIconLink({
  to,
  label,
  icon: Icon,
  textIcon,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={to}
            onClick={() => onNavigate?.()}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-10 items-center justify-center rounded-xl text-admin-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/60",
              active
                ? "bg-admin-sidebar-active text-admin-sidebar-foreground"
                : "text-admin-sidebar-muted hover:bg-admin-sidebar-active/55 hover:text-admin-sidebar-foreground",
            )}
          >
            {textIcon ? (
              <span className="text-[11px] font-bold leading-none tracking-tight" aria-hidden>
                {textIcon}
              </span>
            ) : Icon ? (
              <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            ) : null}
            <span className="sr-only">{label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

function AdminIconRail({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex w-full flex-col items-center px-2 pb-4 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/admin/keuangan"
              onClick={() => onNavigate?.()}
              className="mb-4 flex size-11 items-center justify-center rounded-xl bg-admin-sidebar-logo-bg text-admin-sidebar-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/70"
              aria-label="Beranda admin"
            >
              <Leaf className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Beranda</TooltipContent>
        </Tooltip>

        <nav className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto overflow-x-hidden">
          {groups.map((g, gi) => (
            <React.Fragment key={g.label}>
              {gi > 0 ? <div className="h-px w-8 shrink-0 bg-admin-sidebar-active/55" aria-hidden /> : null}
              <ul className="flex flex-col items-center gap-1.5">
                {g.items.map((it) => {
                  const active = pathname === it.to || pathname.startsWith(`${it.to}/`);
                  return (
                    <NavIconLink
                      key={it.to}
                      {...it}
                      active={active}
                      onNavigate={onNavigate}
                    />
                  );
                })}
              </ul>
            </React.Fragment>
          ))}
        </nav>

        <LogoutButton />
      </div>
    </TooltipProvider>
  );
}

function LogoutButton() {
  const navigate = useNavigate();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/login" });
          }}
          className="mt-2 flex size-10 items-center justify-center rounded-xl text-admin-sidebar-muted transition-colors hover:bg-admin-sidebar-active/55 hover:text-admin-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/60"
          aria-label="Keluar"
        >
          <LogOut className="size-5" strokeWidth={1.5} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Keluar</TooltipContent>
    </Tooltip>
  );
}

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className="sticky top-0 flex h-screen w-[4.25rem] shrink-0 flex-col border-r border-admin-sidebar-active/35 bg-admin-sidebar text-admin-sidebar-foreground"
      aria-label="Navigasi admin"
    >
      <AdminIconRail pathname={pathname} />
    </aside>
  );
}
