"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Home, FileBarChart, Shield, Settings, User2 } from "lucide-react";
import NavLink from "@/components/ui/NavLink";
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}


export default function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ org: string }>();
  const org = params?.org || "demo";
  const pathname = usePathname();
  const { slug } = useParams<{ slug: string }>();
const base = `/app/org/${slug}`;

  // builds /:org/... paths safely
  const P = (p: string) => `/${org}${p}`;

  const topTabs = [
    { label: "Analytics", href: P("/analytics") },
    { label: "Live Seat View", href: P("/live-seat") },
    { label: "Insights", href: P("/insights") },
    { label: "Security", href: P("/security") },
  ];

  const sideNav = [
    { label: "Overview", href: `${base}`, icon: Home },
    { label: "Reports", href: `${base}/reports`, icon: FileBarChart },
    { label: "Settings", href: `${base}/settings`, icon: Settings },
    { label: "Account", href: `${base}/account`, icon: User2 },
  ];
  <main className="vista-main rounded-3xl bg-white/5 p-4 md:p-6 border border-white/10">
  {children}
</main>


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#548A96] to-[#86A6B4] text-slate-100">
      {/* top bar */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-teal-600/90 to-sky-700/90 backdrop-blur supports-[backdrop-filter]:bg-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-6">
          {/* logo */}
<Link href={P("/analytics")} className="flex items-center gap-3">
  <img
    src="/vistalogowhite.png"   // or /vista-logo-gradient.svg
    alt="Vista"
    className="h-15 w-auto block select-none"
    draggable={false}
  />
</Link>


          {/* tabs */}
          <nav className="flex items-center gap-2">
            {topTabs.map((t) => (
              <NavLink key={t.href} href={t.href} exact className="text-sm font-medium">
                {t.label}
              </NavLink>
            ))}
          </nav>

          {/* right side filler (profile avatar spot) */}
          <div className="ml-auto">
            <Link href={P("/account")} className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/15"
            )}>
              <User2 className="h-4 w-4" />
              <span className="text-sm">Profile</span>
            </Link>
          </div>
        </div>
      </header>

      {/* body with sidebar */}
      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-[220px_1fr] gap-6">
        {/* left sidebar */}
        <aside className="rounded-3xl bg-white/5 p-4 backdrop-blur border border-white/10">
          <nav className="flex flex-col gap-1">
            {sideNav.map((item) => (
              <NavLink key={item.href} href={item.href} className="flex items-center gap-3">
                <item.icon className="h-4 w-4 opacity-80" />
                <span className="text-sm">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* main content */}
        <main className="rounded-3xl bg-white/5 p-4 md:p-6 backdrop-blur border border-white/10">
          {children}
        </main>
      </div>
    </div>
  );
}

