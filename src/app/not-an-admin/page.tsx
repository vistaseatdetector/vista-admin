// src/app/not-an-admin/page.tsx
import Link from "next/link";

export default function NotAnAdminPage({
  searchParams,
}: { searchParams?: { org?: string } }) {
  const org = searchParams?.org ?? "";
  return (
    <main className="mx-auto max-w-lg p-6 space-y-5">
      <h1 className="text-2xl font-semibold">You don’t have admin access</h1>
      <p className="text-sm opacity-80">
        This area is for organization admins only.
      </p>
      <div className="space-y-3">
        <a className="inline-flex rounded-xl border px-4 py-2" href="vistaushers://open">
          Open Usher App
        </a>
        <Link className="inline-flex rounded-xl border px-4 py-2" href="/app/org/new">
          Create a new organization
        </Link>
      </div>
      {org && (
        <p className="text-xs opacity-60">
          If you should have admin access to “{org}”, ask an existing admin to invite you.
        </p>
      )}
    </main>
  );
}
