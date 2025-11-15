// app/(auth)/login/page.tsx
import React, { Suspense } from "react";
import LoginPageContent from "./LoginPageContent";

export const dynamic = "force-dynamic"; // optional, but fine for auth pages

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
          <div className="text-sm text-white/70">Loading login…</div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
