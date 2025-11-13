import AuthBackground from "@/components/auth/AuthBackground";

export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <AuthBackground>{children}</AuthBackground>;
}
