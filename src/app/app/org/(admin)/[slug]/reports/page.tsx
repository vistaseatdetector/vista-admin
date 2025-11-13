import { createClient } from "@/lib/supabase/server";
import { countForOccurrence } from "@/lib/reports/countForOccurrence";

type PageParams = {
  params: { slug: string };
};

type OccurrenceRow = {
  id: string;
  mass_id: string;
  status: "scheduled" | "running" | "live" | "ended" | string;
  starts_at: string | null;
  ends_at: string | null;
  people_count?: number | null;
  masses: {
    name: string | null;
    org_id: string;
  } | null;
};

type TableRow = {
  id: string;
  dateLabel: string;
  massName: string;
  peopleLabel: string;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "Date TBD";
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return iso ?? "Date TBD";
  }
}

export default async function ReportsPage({ params }: PageParams) {
  const supabase = createClient();
  const { slug } = params;

  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (orgError || !org) {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Reports</h1>
        <p className="text-white/70">Attendance by Mass</p>
        <div className="rounded-xl border border-white/15 bg-rose-500/10 px-5 py-4 text-sm text-white/80">
          {orgError?.message ?? "Organization not found."}
        </div>
      </div>
    );
  }

  const selectWithPeopleCount = `
    id,
    mass_id,
    status,
    starts_at,
    ends_at,
    people_count,
    masses!inner (
      name,
      org_id
    )
  `;

  const selectWithoutPeopleCount = `
    id,
    mass_id,
    status,
    starts_at,
    ends_at,
    masses!inner (
      name,
      org_id
    )
  `;

  const baseQuery = (selectClause: string) =>
    supabase
      .from("mass_occurrences")
      .select(selectClause)
      .eq("masses.org_id", org.id)
      .order("starts_at", { ascending: false, nullsLast: false })
      .order("ends_at", { ascending: false, nullsLast: false })
      .limit(50);

  let supportsPeopleCount = true;
  let occurrencesData: OccurrenceRow[] | null = null;

  let { data, error } = await baseQuery(selectWithPeopleCount);

  if (error && /people_count/i.test(error.message)) {
    supportsPeopleCount = false;
    const fallback = await baseQuery(selectWithoutPeopleCount);
    data = fallback.data;
    error = fallback.error;
  }

  const occurrencesError = error;
  occurrencesData = (data ?? null) as OccurrenceRow[] | null;

  if (occurrencesError) {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Reports</h1>
        <p className="text-white/70">Attendance by Mass</p>
        <div className="rounded-xl border border-white/15 bg-rose-500/10 px-5 py-4 text-sm text-white/80">
          {occurrencesError.message}
        </div>
      </div>
    );
  }

  const occurrences = occurrencesData ?? [];

  const rows: TableRow[] = [];
  for (const occurrence of occurrences) {
    let count = supportsPeopleCount ? occurrence.people_count ?? null : null;
    const statusIsLive = occurrence.status === "running" || occurrence.status === "live";
    let liveLabel = false;

    if (count == null) {
      if (occurrence.status === "ended") {
        count = await countForOccurrence(supabase, org.id, {
          id: occurrence.id,
          starts_at: occurrence.starts_at,
          ends_at: occurrence.ends_at,
        });
      } else if (statusIsLive) {
        count = await countForOccurrence(supabase, org.id, {
          id: occurrence.id,
          starts_at: occurrence.starts_at,
          ends_at: occurrence.ends_at,
        });
        liveLabel = true;
      } else {
        count = 0;
      }
    } else if (statusIsLive) {
      liveLabel = true;
    }

    if (count == null) count = 0;

    rows.push({
      id: occurrence.id,
      dateLabel: formatDate(occurrence.starts_at ?? occurrence.ends_at),
      massName: occurrence.masses?.name?.trim() || "(Unnamed Mass)",
      peopleLabel: liveLabel ? `${count} (live)` : `${count}`,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Reports</h1>
        <p className="text-white/70">Attendance by Mass</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 shadow-lg shadow-black/30 backdrop-blur">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-white/70">No Mass reports yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-white/80">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-white/60">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Mass</th>
                  <th className="px-4 py-3 text-right font-medium">People</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-4 py-3">{row.dateLabel}</td>
                    <td className="px-4 py-3">{row.massName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">{row.peopleLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
