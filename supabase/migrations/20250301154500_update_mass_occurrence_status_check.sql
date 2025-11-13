-- Ensure mass_occurrences.status allows all runtime values used by the app.
-- The previous constraint rejected "running", which caused ad-hoc Mass starts to fail.
alter table public.mass_occurrences
  drop constraint if exists mass_occurrences_status_check;

alter table public.mass_occurrences
  add constraint mass_occurrences_status_check
  check (
    status = any (
      array[
        'scheduled'::text,
        'running'::text,
        'live'::text,
        'ended'::text,
        'canceled'::text
      ]
    )
  );
