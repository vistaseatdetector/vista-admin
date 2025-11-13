import { redirect } from "next/navigation";
import { requireOrgMember } from "@/lib/orgs/checkMembership";
import Background from "@/components/ui/Background";
import { CameraProvider } from "@/contexts/CameraContext";
import { DetectionProvider } from "@/contexts/DetectionContext";
import AppShell from "@/components/layout/AppShell";
import AutoZoneDetection from "@/components/AutoZoneDetection";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await requireOrgMember(slug);

  if (!res.ok) {
    if (res.reason === "unauth") redirect("/login");
    redirect("/403");
  }

  return (
    <CameraProvider>
      <DetectionProvider>
        {/* Background detector bootstraps zones + detection without opening Doors tab */}
        <AutoZoneDetection orgSlug={slug} />
        <div className="relative min-h-dvh">
          {/* ✅ Fullscreen background image */}
          <Background src="/images/dashboard/bg-church4.jpeg" />

          {/* ✅ Foreground content (transparent wrapper, no blue frame) */}
          <div className="relative z-10 px-2 py-4 md:px-6 md:py-6 lg:px-10 lg:py-8">
          <AppShell>{children}</AppShell>
        </div>
        </div>
      </DetectionProvider>
    </CameraProvider>
  );
}
