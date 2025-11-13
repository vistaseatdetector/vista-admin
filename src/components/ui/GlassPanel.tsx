import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type BlurSize = "lg" | "xl" | "2xl" | "3xl";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  blur?: BlurSize;
  elevated?: boolean;
  unpadded?: boolean;
  interactive?: boolean;
  tinted?: boolean;
}

const blurClass: Record<BlurSize, string> = {
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
  "2xl": "backdrop-blur-2xl",
  "3xl": "backdrop-blur-3xl",
};

export default function GlassPanel({
  children,
  className,
  blur = "xl",
  elevated = false,
  unpadded = false,
  interactive = false,
  tinted = false,
  ...rest
}: GlassPanelProps) {
  return (
    <div
      className={clsx(
        "relative rounded-2xl bg-white/10 border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.25)]",
        blurClass[blur],
        elevated && "border-white/25 shadow-[0_12px_40px_rgba(0,0,0,0.25)]",
        !unpadded && "p-6",
        interactive &&
          "cursor-pointer transition ring-0 hover:ring-1 hover:ring-white/30",
        tinted &&
          "after:absolute after:inset-0 after:rounded-2xl after:bg-[#0b2439]/[0.08] after:pointer-events-none",
        "supports-[backdrop-filter]:bg-white/10 supports-[backdrop-filter]:backdrop-blur-xl",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-b before:from-white/40 before:to-white/10 before:opacity-60",
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix type=\'saturate\' values=\'0\'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type=\'linear\' slope=\'0.02\'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.6\'/%3E%3C/svg%3E")] after:opacity-[0.15]',
        className
      )}
      {...rest}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function GlassHeader({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("mb-4 flex items-center justify-between", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function GlassTitle({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={clsx("text-lg font-semibold text-white/90", className)}
      {...rest}
    >
      {children}
    </h2>
  );
}

export function GlassSubtitle({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx("text-sm text-white/70", className)} {...rest}>
      {children}
    </p>
  );
}

export function GlassFooter({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("mt-4 border-t border-white/10 pt-4", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
