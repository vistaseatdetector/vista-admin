# Vista Admin Sync Notes (2025-10-12)

The incoming admin UX expects the following Supabase tables, views, and functions to exist before merging:

- Tables: `orgs`, `org_members`, `org_memberships`, `org_invitations`, `org_members` (with `profiles` FK), `ushers`, `usher_assignments`, `usher_requests`, `masses`, `locations`, `events_security`, `metrics_occ`, `user_org_roles` (view or table), `org_members` join on `profiles`.
- Views/materialized sources: `org_ushers_with_name`, `usher_requests_with_name`, `v_occurrences_with_weekend` (used by analytics), optional `user_org_roles` view.
- Functions: RPC `invite_user`, edge function `request_mass_help` (hit via `/api/request-mass-help`), Supabase auth admin invite APIs require service key on server handlers.

Copy over the Vista migrations that define the above (ushers, reports views, RPCs) before applying these UI changes. Add `-- TODO: Review before applying. Copied from source on 2025-10-12` to each SQL file when importing.

No migration files were included in the provided source snapshot; pull the latest from the vista-admin repo before enabling the new UI.
