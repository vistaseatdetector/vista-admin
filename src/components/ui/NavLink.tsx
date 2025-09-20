"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";


function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
  exact?: boolean;
};

export default function NavLink({ href, children, className, exact=false }: Props) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl px-3 py-2 transition hover:bg-white/10",
        active && "bg-white/15 backdrop-blur text-white shadow-inner",
        className
      )}
    >
      {children}
    </Link>
  );
}
