'use server';
import { createClient } from '@/lib/supabase/server';

export async function createOrganization(formData: FormData) {
const supabase = createClient();
const { data: { user }, error: uerr } = await supabase.auth.getUser();
if (uerr || !user) throw new Error('Not signed in');

const name = String(formData.get('name') || '').trim();
const type = 'Church';
const line1 = String(formData.get('line1') || '').trim();
const line2 = String(formData.get('line2') || '').trim() || null;
const city = String(formData.get('city') || '').trim();
const state = String(formData.get('state') || '').trim();
const postal = String(formData.get('postal') || '').trim();

if (!name || !line1 || !city || !state || !postal) {
throw new Error('Please fill required fields');
}

// 1) Create org
const { data: org, error: oerr } = await supabase
.from('orgs')
.insert({ name, type, created_by: user.id })
.select('id')
.single();
if (oerr) throw new Error(oerr.message);

// 2) Create Main location
const { error: lerr } = await supabase.from('org_locations').insert({
org_id: org.id,
label: 'Main',
address_line1: line1,
address_line2: line2,
city,
state,
postal_code: postal,
country: 'US'
});
if (lerr) throw new Error(lerr.message);

// 3) Membership: make current user an admin
const { error: merr } = await supabase.from('org_memberships').insert({
org_id: org.id,
user_id: user.id,
role: 'admin'
});
if (merr) throw new Error(merr.message);

return { orgId: org.id };
}