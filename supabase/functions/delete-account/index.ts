// delete-account — Settings → "Delete my account" (signed-in caller, POST {}).
// Removes the caller's LOGIN and marks them as having left every account they belong to (profiles.status 'deleted',
// unlinked from the login), like "X left the company": their tasks and history stay with the team.
// An admin can leave too (Apple requires deleting an account inside the app): a company must never lose its last admin,
// so the next person takes over, with the admin's direct reports and open decisions. Refused only for the super admin.
// The store review login leaves its demo company as it is: quick-login brings that person back on the next sign-in.
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, sendPush } from '../_shared/push.ts';

type Admin = ReturnType<typeof adminClient>;

/** Who runs this company after this admin leaves: another admin if there is one, else the next person becomes admin. */
async function handOver(admin: Admin, leaving: { id: string; account_id: string; full_name: string }) {
  const { data: team, error } = await admin
    .from('profiles')
    .select('id, role, status, manager_id, locale, created_at')
    .eq('account_id', leaving.account_id)
    .eq('hidden', false)
    .neq('status', 'deleted')
    .neq('id', leaving.id);
  if (error) throw new HttpError(500, error.message);
  const people = team ?? [];
  if (!people.length) return;

  let next = people.find((p) => p.role === 'admin');
  if (!next) {
    // someone really using the app first, then a manager, then their own direct report, then the longest here
    const score = (p: (typeof people)[number]) => (p.status === 'active' ? 4 : 0) + (p.role === 'manager' ? 2 : 0) + (p.manager_id === leaving.id ? 1 : 0);
    next = [...people].sort((a, b) => score(b) - score(a) || String(a.created_at).localeCompare(String(b.created_at)))[0];
    const { error: e } = await admin.from('profiles').update({ role: 'admin', manager_id: null }).eq('id', next.id);
    if (e) throw new HttpError(500, e.message);
    await admin.from('activity_log').insert({
      actor_type: 'muntej',
      subject_id: next.id,
      action: 'admin_handover',
      summary: `Became admin after ${leaving.full_name} deleted their account`,
      summary_ar: `صار مدير الحساب بعد ما حذف ${leaving.full_name} حسابه`,
      undoable: false,
    });
    const ar = next.locale !== 'en';
    await sendPush(
      [next.id],
      ar
        ? { title: 'صرت مدير حساب شركتك', body: `${leaving.full_name} حذف حسابه، وصارت إدارة الحساب عندك.` }
        : { title: 'You’re now your company’s admin', body: `${leaving.full_name} deleted their account, so the company is now yours to manage.` },
      admin,
    ).catch(() => 0);
  }
  await admin.from('profiles').update({ manager_id: next.id }).eq('manager_id', leaving.id).neq('id', next.id);
  await admin.from('decisions').update({ manager_id: next.id }).eq('manager_id', leaving.id).eq('status', 'pending');
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { userId } = await getCaller(req);
  const admin = adminClient();

  const { data: profiles, error } = await admin.from('profiles').select('id, role, full_name, account_id, email, status').eq('user_id', userId);
  if (error) throw new HttpError(500, error.message);
  if ((profiles ?? []).some((p) => p.role === 'super_admin')) throw new HttpError(403, 'The super admin can’t delete their account here.');

  const reviewEmail = (Deno.env.get('REVIEW_LOGIN_EMAIL') ?? '').trim().toLowerCase();
  for (const p of profiles ?? [])
    if (p.role === 'admin' && p.status !== 'deleted' && String(p.email ?? '').toLowerCase() !== reviewEmail) await handOver(admin, p);

  const ids = (profiles ?? []).map((p) => p.id as string);
  if (ids.length) {
    await admin.from('push_tokens').delete().in('profile_id', ids);
    const { error: e2 } = await admin.from('profiles').update({ status: 'deleted', user_id: null }).in('id', ids);
    if (e2) throw new HttpError(500, e2.message);
    await admin.from('activity_log').insert(
      ids.map((id) => ({
        actor_type: 'user',
        actor_id: id,
        subject_id: id,
        action: 'account_deleted',
        summary: 'Deleted their Muntej account',
        summary_ar: 'حذف حسابه في منتج',
        undoable: false,
      })),
    );
  }

  const { error: e3 } = await admin.auth.admin.deleteUser(userId);
  if (e3) throw new HttpError(500, e3.message);
  return json({ deleted: true });
});
