// delete-account — Settings → "Delete my account" (signed-in caller, POST {}).
// Removes the caller's LOGIN and marks them as having left every account they belong to (profiles.status 'deleted',
// unlinked from the login), like "X left the company": their tasks and history stay with the team.
// Refused for admins and the super admin (an account must never lose its admin this way: another admin changes
// their role first).
import { getCaller, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const { userId } = await getCaller(req);
  const admin = adminClient();

  const { data: profiles, error } = await admin.from('profiles').select('id, role, full_name').eq('user_id', userId);
  if (error) throw new HttpError(500, error.message);
  if ((profiles ?? []).some((p) => p.role === 'admin' || p.role === 'super_admin'))
    throw new HttpError(403, 'Admins can’t delete their account here. Ask another admin to change your role first.');

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
