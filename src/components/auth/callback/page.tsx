import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Optional: small shell UI
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-12">{children}</div>
    </div>
  );
}

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // 1) Supabase sets a session on visit to this page from the recovery link
  // 2) For safety, we verify session exists before showing the form
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data } = await supabase.auth.getSession();
  const hasSession = Boolean(data.session);

  const type = Array.isArray(searchParams.type)
    ? searchParams.type[0]
    : searchParams.type;

  const isRecovery = type === "recovery";

  return (
    <Shell>
      {isRecovery && hasSession ? (
        <ResetPasswordForm />
      ) : (
        <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h1 className="mb-1 text-2xl font-semibold">Authentication</h1>
          <p className="text-sm text-gray-600">
            This page handles password resets and sign-in callbacks. If you
            reached here directly, please use the{" "}
            <a href="/login" className="underline">
              sign-in page
            </a>
            .
          </p>
        </div>
      )}
    </Shell>
  );
}
