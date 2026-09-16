import { Link } from "@tanstack/react-router";
import { CalendarDays, ListChecks, Plus, Settings, Layers } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { to: "/upcoming", label: "Upcoming", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/subscriptions", label: "Subscriptions", icon: Layers },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  title,
  lede,
  children,
  aside,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col lg:flex-row">
        {/* Desktop left navigation */}
        <header className="border-b border-border bg-sidebar px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
          <div className="flex items-center justify-between gap-4 lg:block">
            <Link to="/upcoming" className="block">
              <span className="font-display text-2xl leading-none tracking-tight">Commit</span>
              <span className="mt-1 hidden text-xs text-muted-foreground lg:block">
                A memory layer for your recurring commitments
              </span>
            </Link>
            <Link
              to="/add"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 lg:mt-5 lg:w-full lg:justify-center"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add commitment
            </Link>
          </div>

          <nav aria-label="Main" className="mt-4 lg:mt-7">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
                    activeProps={{
                      className: "bg-accent text-accent-foreground font-medium",
                      "aria-current": "page",
                    }}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-6 hidden rounded-md border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground lg:block">
            Phase 1 demo. Every record is synthetic sample data. Commit never cancels anything for
            you and sends no reminders here.
          </p>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-9">
          <div className="mb-7 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl">{title}</h1>
            {lede ? <p className="mt-2 text-sm text-muted-foreground">{lede}</p> : null}
          </div>
          <div
            className={cn(
              aside ? "grid gap-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start" : undefined,
            )}
          >
            <div className="min-w-0">{children}</div>
            {aside ? <div className="min-w-0 xl:sticky xl:top-7">{aside}</div> : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
  actions,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-paper p-5", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
