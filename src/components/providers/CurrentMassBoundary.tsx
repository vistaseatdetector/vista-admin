"use client";

import { CurrentMassProvider } from "@/contexts/CurrentMassContext";

export default function CurrentMassBoundary({
  orgId,
  children,
}: { orgId: string; children: React.ReactNode }) {
  return <CurrentMassProvider orgId={orgId}>{children}</CurrentMassProvider>;
}
