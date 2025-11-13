export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
};

export type OrgMemberRow = {
  org_id: string;
  role: string;
  orgs: OrgSummary;
};

export type UsherRequestRow = {
  id: string;
  user_id: string;
  requested_at: string;
};

export type PendingRequestRow = {
  id: string;
  org_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  created_at?: string;
  user_name: string | null;
  email: string | null;
};

export type OrgUsherRow = {
  org_id: string;
  user_id: string;
  role: "usher" | string;
  added_by: string | null;
  user_name: string | null;
  email: string | null;
};

