import { DetectionProvider } from "@/contexts/DetectionContext";
import { CameraProvider } from "@/contexts/CameraContext";
import Background from "@/components/ui/Background";
import AppShell from "@/components/layout/AppShell";
import AutoZoneDetection from "@/components/AutoZoneDetection";
import CurrentMassBoundary from "@/components/providers/CurrentMassBoundary";
import { OrgIdProvider } from "@/contexts/OrgContext";
import { createClient } from "@/lib/supabase/server";

async function getOrgBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orgs")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Org not found");
  return data;
}

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  console.log("🎯 LAYOUT: Development bypass - no auth checks");
  const { slug } = params;
  const org = await getOrgBySlug(slug);

  return (
    <OrgIdProvider orgId={org.id}>
      <CameraProvider>
        <DetectionProvider>
          <AutoZoneDetection orgSlug={slug} />
          <CurrentMassBoundary orgId={org.id}>
            <div className="relative min-h-dvh">
              <Background src="/images/dashboard/bg-church4.jpeg" />
              <div className="relative z-10 px-2 py-4 md:px-6 md:py-6 lg:px-10 lg:py-8">
                <AppShell>{children}</AppShell>
              </div>
            </div>
          </CurrentMassBoundary>
        </DetectionProvider>
      </CameraProvider>
    </OrgIdProvider>
  );
}
