// Home, top: your team at a glance and what Saree3 did about it (owner: "anything about my team, risks or
// achievements, visible on Home; Saree3 acts and tells me when I open the app").
//   FromSaree3   since your last visit: tasks done, what Saree3 did (follow-ups, alerts, proof checks), tasks from
//                email waiting, decisions that need you
//   TeamRisks    late, blocked, high-priority due within 48 h, overloaded people, each with what Saree3 is doing
//   TeamWins     this week: tasks done, on-time %, who finished the most
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, Inbox, PartyPopper, ShieldCheck, Trophy } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useActivity, useMyProfile, usePendingDecisionCount, useTasks, useTeam, type TaskWithPeople } from '@/lib/api';
import { useIncomingCount } from '@/features/incoming/api';
import { formatDue } from '@/features/capture/format';
import { Munti } from '@/features/munti/Munti';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { RADAR_NS } from './radarStrings';

const LAST_VISIT = 'home.lastVisit';
const DAY = 86_400_000;
const OPEN = ['assigned', 'in_progress', 'blocked', 'submitted', 'returned'];
const first = (p: { full_name: string; full_name_ar?: string | null } | null | undefined, ar: boolean) =>
  p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : '';

/** when you were last on Home (read once per app open, then moved to now) */
function useLastVisit() {
  const [last, setLast] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem(LAST_VISIT)
      .then((v) => setLast(v ? Number(v) : null))
      .catch(() => setLast(null))
      .finally(() => AsyncStorage.setItem(LAST_VISIT, String(Date.now())).catch(() => {}));
  }, []);
  return last;
}

export function FromSaree3() {
  const { t } = useScreenT(RADAR_NS);
  const { lang } = useDirection();
  const last = useLastVisit();
  const tasks = useTasks();
  const activity = useActivity(300);
  const decisions = usePendingDecisionCount();
  const incoming = useIncomingCount();
  if (last === undefined || !tasks.data) return null;
  const since = last ?? Date.now() - DAY;
  const after = (iso: string) => Date.parse(iso) > since;
  const mine = (activity.data ?? []).filter((a) => a.actor_type === 'muntej' && after(a.created_at));
  const count = (action: string) => mine.filter((a) => a.action === action).length;
  const done = tasks.data.filter((x) => x.status === 'done' && after(x.updated_at)).length;
  const lines: { icon: ReactNode; text: string; href?: Href }[] = [];
  if (done) lines.push({ icon: <PartyPopper color={colors.green} size={16} />, text: t('done', { count: done, n: done }) });
  const follow = count('followup_sent');
  if (follow) lines.push({ icon: <BellRing color={colors.primary} size={16} />, text: t('didFollow', { count: follow, n: follow }) });
  const alerts = count('alert_sent');
  if (alerts)
    lines.push({ icon: <AlertTriangle color={colors.amberText} size={16} />, text: t('didAlert', { count: alerts, n: alerts }), href: '/18-alerts' });
  const proofs = count('proof_checked');
  if (proofs) lines.push({ icon: <ShieldCheck color={colors.primary} size={16} />, text: t('didProof', { count: proofs, n: proofs }) });
  if (incoming.count)
    lines.push({
      icon: <Inbox color={colors.primary} size={16} />,
      text: t('foundMail', { count: incoming.count, n: incoming.count }),
      href: '/42-incoming',
    });
  const need = decisions ?? 0;
  if (need)
    lines.push({ icon: <AlertTriangle color={colors.red} size={16} />, text: t('needsYou', { count: need, n: need }), href: '/04-decisions' });

  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm, borderWidth: 1.5, borderColor: colors.purpleBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti size="md" mood={need ? 'think' : lines.length ? 'star' : 'idle'} />
        <View style={{ flex: 1 }}>
          <AppText weight="extrabold" style={{ fontSize: 17 }}>
            {t('fromTitle')}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {last ? t('fromSince', { when: formatDue(new Date(last).toISOString(), lang) }) : t('fromFirst')}
          </AppText>
        </View>
      </View>
      {lines.length === 0 ? (
        <AppText color="textSoft">{t('allQuiet')}</AppText>
      ) : (
        lines.map((l) => <Line key={l.text} icon={l.icon} text={l.text} href={l.href} />)
      )}
    </Card>
  );
}

export function TeamRisks() {
  const { t } = useScreenT(RADAR_NS);
  const { lang } = useDirection();
  const ar = lang === 'ar';
  const me = useMyProfile();
  const tasks = useTasks();
  const team = useTeam();
  const activity = useActivity(300);
  const rows = useMemo(() => {
    if (!tasks.data || !me.data) return null;
    const now = Date.now();
    // Saree3 followed this task up today?
    const followed = new Set(
      (activity.data ?? [])
        .filter((a) => a.actor_type === 'muntej' && a.action === 'followup_sent' && now - Date.parse(a.created_at) < DAY)
        .map((a) => a.task_id),
    );
    const act = (x: TaskWithPeople) => (followed.has(x.id) ? t('actFollowed') : t('actWatching'));
    const open = tasks.data.filter((x) => OPEN.includes(x.status) && x.owner_id && x.owner_id !== me.data!.id);
    const out: { key: string; text: string; act: string; tone: 'red' | 'amber'; href: Href }[] = [];
    for (const x of open.filter((x) => x.status === 'blocked'))
      out.push({
        key: `b${x.id}`,
        text: t('blocked', { title: x.title }),
        act: act(x),
        tone: 'red',
        href: { pathname: '/14-task-detail', params: { id: x.id } },
      });
    for (const x of open.filter((x) => x.due_at && Date.parse(x.due_at) < now && x.status !== 'blocked'))
      out.push({
        key: `l${x.id}`,
        text: t('late', { title: x.title }),
        act: act(x),
        tone: 'red',
        href: { pathname: '/14-task-detail', params: { id: x.id } },
      });
    for (const x of open.filter(
      (x) => (x.priority === 'high' || x.priority === 'urgent') && x.due_at && Date.parse(x.due_at) >= now && Date.parse(x.due_at) - now < 2 * DAY,
    ))
      out.push({
        key: `s${x.id}`,
        text: t('soon', { title: x.title, when: formatDue(x.due_at!, lang) }),
        act: act(x),
        tone: 'amber',
        href: { pathname: '/14-task-detail', params: { id: x.id } },
      });
    // overloaded: 8+ open tasks on one person
    const byOwner = new Map<string, number>();
    for (const x of open) byOwner.set(x.owner_id!, (byOwner.get(x.owner_id!) ?? 0) + 1);
    for (const [id, n] of byOwner)
      if (n >= 8) {
        const p = (team.data ?? []).find((q) => q.id === id);
        out.push({ key: `o${id}`, text: t('overloaded', { name: first(p, ar), n }), act: t('actAskedHelp'), tone: 'amber', href: '/11-load-radar' });
      }
    return out.slice(0, 5);
  }, [tasks.data, me.data, team.data, activity.data, t, lang, ar]);
  if (!rows || me.data?.role === 'employee') return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="section">{t('risksTitle')}</AppText>
      {rows.length === 0 ? (
        <Card padding={spacing.lg}>
          <AppText color="textSoft">{t('risksNone')}</AppText>
        </Card>
      ) : (
        rows.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => router.push(r.href)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: sizes.touch + 12,
              padding: spacing.md,
              borderRadius: radius.tile,
              backgroundColor: r.tone === 'red' ? colors.redTint : colors.amberTint,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AlertTriangle color={r.tone === 'red' ? colors.red : colors.amberText} size={18} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold" numberOfLines={2}>
                {r.text}
              </AppText>
              <AppText variant="caption" color="textSoft">
                {`🤖 ${r.act}`}
              </AppText>
            </View>
            <Chevron />
          </Pressable>
        ))
      )}
      {/* progress people report vs the proof behind it (Saree3 checks; you look only if you want) */}
      <Line icon={<ShieldCheck color={colors.primary} size={16} />} text={t('proofGaps')} href="/10-evidence" />
    </View>
  );
}

export function TeamWins() {
  const { t } = useScreenT(RADAR_NS);
  const { lang } = useDirection();
  const ar = lang === 'ar';
  const me = useMyProfile();
  const tasks = useTasks();
  const team = useTeam();
  const wins = useMemo(() => {
    if (!tasks.data) return null;
    // the Saudi week starts on Sunday (Riyadh time)
    const now = new Date(Date.now() + 3 * 3_600_000);
    const sunday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()) - 3 * 3_600_000;
    const done = tasks.data.filter((x) => x.status === 'done' && Date.parse(x.updated_at) >= sunday);
    const onTime = done.filter((x) => !x.due_at || Date.parse(x.updated_at) <= Date.parse(x.due_at)).length;
    const by = new Map<string, number>();
    for (const x of done) if (x.owner_id) by.set(x.owner_id, (by.get(x.owner_id) ?? 0) + 1);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    const star = top ? (team.data ?? []).find((p) => p.id === top[0]) : undefined;
    return {
      done: done.length,
      pct: done.length ? Math.round((100 * onTime) / done.length) : 0,
      star: star ? first(star, ar) : null,
      starN: top?.[1] ?? 0,
    };
  }, [tasks.data, team.data, ar]);
  if (!wins || me.data?.role === 'employee') return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="section">{t('winsTitle')}</AppText>
      <Card padding={spacing.lg} style={{ gap: spacing.sm, backgroundColor: colors.greenTint }}>
        {wins.done === 0 ? (
          <AppText color="textSoft">{t('winsNone')}</AppText>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Trophy color={colors.green} size={18} />
              <AppText weight="bold">
                {t('winsDone', { count: wins.done, n: wins.done })} · {t('winsOnTime', { pct: wins.pct })}
              </AppText>
            </View>
            {!!wins.star && <AppText weight="semibold">{t('winsStar', { name: wins.star, n: wins.starN })}</AppText>}
          </>
        )}
      </Card>
      {/* the week in more depth: the receipt (what Saree3 saved you), performance, the wins timeline */}
      <TourTarget id="home.week">
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(
            [
              ['weekReceipt', '/32-receipt'],
              ['weekPerformance', '/16-dashboard'],
              ['weekWins', '/21-achievements'],
            ] as const
          ).map(([k, href]) => (
            <Pressable
              key={k}
              onPress={() => router.push(href)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: sizes.touch,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing.sm,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText variant="small" weight="bold" color="primary" numberOfLines={1}>
                {t(k)}
              </AppText>
            </Pressable>
          ))}
        </View>
      </TourTarget>
    </View>
  );
}

function Line({ icon, text, href }: { icon: ReactNode; text: string; href?: Href }) {
  const { t } = useScreenT(RADAR_NS);
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: href ? sizes.touch : 28 }}>
      {icon}
      <AppText style={{ flex: 1 }}>{text}</AppText>
      {!!href && (
        <AppText variant="small" weight="bold" color="primary">
          {t('open')}
        </AppText>
      )}
    </View>
  );
  return href ? (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

function Chevron() {
  const { isRTL } = useDirection();
  return isRTL ? <ChevronLeft color={colors.textMuted} size={18} /> : <ChevronRight color={colors.textMuted} size={18} />;
}
