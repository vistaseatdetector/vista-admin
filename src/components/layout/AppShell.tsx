// src/components/layout/AppShell.tsx
"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Home, FileBarChart, Settings, User2, DoorOpen } from "lucide-react";
import NavLink from "@/components/ui/NavLink";
import Image from "next/image";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type SideNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean; // <-- make it optional
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ org: string; slug: string }>();
  const pathname = usePathname();

  const org = params?.org || "demo";
  const slug = params?.slug!;
  const base = `/app/org/${slug}`;

  // normalize path
  const norm = (s: string) =>
    s && s !== "/" && s.endsWith("/") ? s.slice(0, -1) : s;

  const isActive = (href: string, exact = false) => {
    const p = norm(pathname);
    const h = norm(href);
    return exact ? p === h : p === h || p.startsWith(h + "/");
  };

  const sideNav: SideNavItem[] = [
    { label: "Overview", href: `${base}`, icon: Home, exact: true },
    { label: "Reports", href: `${base}/reports`, icon: FileBarChart },
    { label: "Doors", href: `${base}/doors`, icon: DoorOpen },
    { label: "Ushers", href: `${base}/ushers`, icon: User2 },
    { label: "Settings", href: `${base}/settings`, icon: Settings },
    { label: "Account", href: `${base}/account`, icon: User2 },
  ];

  return (
    <div className="relative min-h-dvh text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-[220px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl border border-white/20">
          <Link href="/" className="block mb-5">
            <div className="p-3 flex items-center justify-center">
              <Image
                src="/vistalogowhite.png"
                alt="Vista"
                width={140}
                height={40}
                className="object-contain"
                priority
              />
            </div>
          </Link>

          {/* Nav items */}
          <nav className="mt-3 flex flex-col gap-1">
            {sideNav.map((item) => {
              const active = isActive(item.href, item.exact ?? false);
              return (
                <NavLink key={item.href} href={item.href} active={active} exact={item.exact} className="">
                  <item.icon className="h-4 w-4 opacity-80" />
                  <span className="text-sm">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* Right-side content swaps here */}
        <main className="px-0 md:px-0">{children}</main>
      </div>
    </div>
  );
}
