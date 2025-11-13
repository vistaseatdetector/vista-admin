"use client";

import { createContext, useContext } from "react";

const OrgIdContext = createContext<string>("");

export function OrgIdProvider({ orgId, children }: { orgId: string; children: React.ReactNode }) {
  return <OrgIdContext.Provider value={orgId}>{children}</OrgIdContext.Provider>;
}

export function useOrgId() {
  return useContext(OrgIdContext);
}
