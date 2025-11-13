// src/components/ui/NavLink.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({
  href,
  children,
  className = "",
  exact = false,
  active, // <-- NEW: optional override
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  exact?: boolean;
  active?: boolean; // <-- NEW
}) {
  const pathname = usePathname();

  const norm = (s: string) =>
    s && s !== "/" && s.endsWith("/") ? s.slice(0, -1) : s;

  // compute internal active (kept for places you don't override)
  const internal =
    norm(pathname) === norm(href) ||
    (!exact && norm(pathname).startsWith(norm(href) + "/"));

  const isActive = active ?? internal; // <-- if active is provided, use it

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-xl",
        isActive ? "bg-white/15" : "hover:bg-white/10",
        className,
      ].join(" ")}
    >
      {children}
    </Link>
  );
}




