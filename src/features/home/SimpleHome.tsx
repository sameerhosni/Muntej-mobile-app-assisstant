// The simple Home building blocks (manager + employee): one Saree3 status line, "Needs you" (max 3), a shortcuts row.
// Principle: Home answers "what needs me now?" — everything else is one tap away, not on the screen.
import type { ComponentType } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronRight, ClipboardCheck, Gavel, Inbox, type LucideProps } from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useDecisions, useMyProfile, useTasks, useTeam } from '@/lib/api';
import { contentDirection } from '@/features/chat/Bubbles';
import { Munti } from '@/features/munti/Munti';
import { usePerformance, type Line } from '@/features/munti/performance';
import { MUNTI_NS } from '@/features/munti/tips';
import { NS } from './strings';
import { ActionPill, useTodayActions } from './TodayHome';
import { useIncomingCount } from '@/features/incoming/api';
import { isNewFor, useMyFeatureStates } from '@/features/launch/launch';
import { NS as INCOMING_NS } from '@/features/incoming/strings';
import { AutoApproveTag } from '@/features/review/ReviewBar';
import { useReviewDeadlines } from '@/features/review/countdown';

/** Saree3's one-sentence status, in his colour, for the Home header. Tap → the tasks it names. */
export function SareeLine({ onDark = true }: { onDark?: boolean }) {
  const { t } = useScreenT(MUNTI_NS);
  const { lang } = useDirection();
  const perf = usePerformance(lang);
  if (!perf) return null;
  const say = (l: Line) => {
    const vars: Record<string, unknown> = { ...l.vars };
    if (typeof vars.color === 'string') vars.color = t(vars.color);
    return t(l.key, vars);
  };
  const text = say(perf.message);
  return (
    <Pressable
      onPress={() => perf.showMe && router.push(perf.showMe)}
      disabled={!perf.showMe}
      accessibilityRole={perf.showMe ? 'button' : 'text'}
      accessibilityLabel={`${t('name')}: ${text}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: sizes.touch,
        paddingVertical: 4,
        paddingEnd: spacing.md,
        paddingStart: 4,
        borderRadius: radius.pill,
        backgroundColor: onDark ? colors.glass : colors.surface,
        borderWidth: 1,
        borderColor: onDark ? colors.glassBorder : colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Munti size="sm" tone={perf.tone} mood={perf.mood} hyper={false} />
      <AppText variant="small" weight="semibold" color={onDark ? 'onDark' : 'text'} numberOfLines={2} style={{ flex: 1 }}>
        {text}
      </AppText>
    </Pressable>
  );
}

type Need = {
  key: string;
  Icon: ComponentType<LucideProps>;
  bg: ColorToken;
  fg: string;
  title: string;
  sub: string;
  href: Href;
  /** one-tap action on the row (Approve / Nudge); tapping the row still opens the details */
  action?: { label: string; done: string; tone: 'primary' | 'green'; run: () => Promise<boolean> };
  /** finished work: when Muntej approves it by itself */
  autoAt?: string | null;
};

/** Manager: only what needs a decision — tasks found in messages, decisions, finished work waiting for review (Approve). */
export function NeedsYou() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks();
  const decisions = useDecisions('pending');
  const { approve } = useTodayActions();
  const { t: ti } = useScreenT(INCOMING_NS);
  const incoming = useIncomingCount();
  const reviewIds = (tasks.data ?? []).filter((x) => x.status === 'submitted').map((x) => x.id);
  const deadlines = useReviewDeadlines(reviewIds);
  const meId = me.data?.id;
  const ar = lang === 'ar';
  const first = (id: string | null) => {
    const p = id ? (team.data ?? []).find((x) => x.id === id) : undefined;
    return p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : null;
  };
  const needs: Need[] = [
    // tasks Muntej found in pasted / forwarded messages, waiting for Add or Ignore
    ...(incoming.count > 0
      ? [
          {
            key: 'incoming',
            Icon: Inbox,
            bg: 'primaryTint' as ColorToken,
            fg: colors.primary,
            title: ti('homeRow', { count: incoming.count, n: incoming.count }),
            sub: ti('homeSub'),
            href: '/42-incoming' as Href,
          },
        ]
      : []),
    ...(decisions.data ?? []).map((d) => ({
      key: `d-${d.id}`,
      Icon: Gavel,
      bg: 'purpleTint' as ColorToken,
      fg: colors.purple,
      title: (ar && d.title_ar) || d.title,
      sub: t('ny_decision'),
      href: '/04-decisions' as Href,
    })),
    ...(tasks.data ?? [])
      .filter((x) => x.status === 'submitted' && x.owner_id !== meId)
      .map((x) => ({
        key: `r-${x.id}`,
        Icon: ClipboardCheck,
        bg: 'greenTint' as ColorToken,
        fg: colors.green,
        title: x.title,
        sub: t('ny_review', { name: first(x.owner_id) ?? '…' }),
        href: { pathname: '/15-review', params: { id: x.id } } as Href,
        action: { label: t('approve'), done: t('approved'), tone: 'green' as const, run: () => approve(x.id) },
        autoAt: deadlines.data?.get(x.id) ?? null,
      })),
    // late work is not here: the autopilot chases it and only brings a decision when the owner doesn't answer
  ];
  const taskIds = needs.filter((n) => n.key.startsWith('r-')).map((n) => n.key.slice(2));
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('needsYou')}
        </AppText>
        {/* the way into Incoming: paste an email / chat and Muntej pulls the tasks out */}
        <Pressable
          onPress={() => router.push('/42-incoming')}
          accessibilityRole="link"
          hitSlop={8}
          style={{ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Inbox color={colors.primary} size={15} strokeWidth={2.2} />
          <AppText variant="small" weight="bold" color="primary">
            {ti('pasteLink')}
          </AppText>
        </Pressable>
      </View>
      {needs.length === 0 ? (
        <Card padding={spacing.lg}>
          <AppText color="textMuted">{t('nothingNeeds')}</AppText>
        </Card>
      ) : (
        <Card padding={spacing.sm} style={{ gap: 0 }}>
          {needs.slice(0, 3).map((n, i) => (
            // the row opens the details; the action pill sits beside it (not nested: one button per control)
            <View
              key={n.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingEnd: spacing.sm,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Pressable
                onPress={() => router.push(n.href)}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}. ${n.sub}`}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: sizes.touch + 12,
                  paddingStart: spacing.sm,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <IconBadge size={34} bg={n.bg} round>
                  <n.Icon color={n.fg} size={16} strokeWidth={2.2} />
                </IconBadge>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ writingDirection: contentDirection(n.title) }}>
                    {n.title}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {n.sub}
                  </AppText>
                  {!!n.autoAt && <AutoApproveTag at={n.autoAt} />}
                </View>
                {!n.action && <ChevronRight color={colors.textFaint} size={16} strokeWidth={2.2} style={flip} />}
              </Pressable>
              {n.action && <ActionPill label={n.action.label} doneLabel={n.action.done} tone={n.action.tone} onPress={n.action.run} />}
            </View>
          ))}
          {needs.length > 3 && (
            <Pressable
              onPress={() =>
                router.push(taskIds.length ? { pathname: '/38-tasks', params: { ids: taskIds.slice(0, 50).join(',') } } : '/04-decisions')
              }
              accessibilityRole="link"
              style={{ minHeight: sizes.touch, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
            >
              <AppText variant="small" weight="bold" color="primary">
                {t('seeAll', { count: needs.length })}
              </AppText>
            </Pressable>
          )}
        </Card>
      )}
    </View>
  );
}

/** `feature`: a new feature this shortcut leads to — a "New" dot shows until the person has tried it */
export type Shortcut = { key: string; label: string; Icon: ComponentType<LucideProps>; href: Href; bg: ColorToken; fg: string; feature?: string };

/** A row of small, equal shortcuts (the things that used to be cards on Home). */
export function Shortcuts({ items }: { items: Shortcut[] }) {
  const me = useMyProfile();
  const states = useMyFeatureStates(me.data?.id);
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {items.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => router.push(s.href)}
          accessibilityRole="link"
          accessibilityLabel={s.label}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 76,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: radius.tile,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View>
            <IconBadge size={34} bg={s.bg} round>
              <s.Icon color={s.fg} size={17} strokeWidth={2} />
            </IconBadge>
            {s.feature && states.data && isNewFor(states.data, s.feature) && (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  end: -4,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: colors.red,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }}
              />
            )}
          </View>
          <AppText variant="micro" weight="bold" color="textSoft" align="center" numberOfLines={1}>
            {s.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
