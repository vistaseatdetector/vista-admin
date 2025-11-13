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
  console.log('🎯 LAYOUT: Development bypass - no auth checks');
  const { slug } = await params;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
        style={{
          backgroundImage: "url('/images/dashboard/bg-church4.jpeg')",
        }}
      />
      <div className="relative min-h-screen">
        <DetectionProvider>
          <AutoZoneDetection orgSlug={slug} />
          <AppShell>
            {children}
          </AppShell>
        </DetectionProvider>
      </div>
    </div>
  );
}
