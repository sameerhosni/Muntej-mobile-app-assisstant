// Screen 60 · Wish list (super admin only) — no mockup. Every idea, problem and like from every company, newest first,
// filtered by kind and status, with who sent it, their company and the screen it came from. Tap a status to change it
// and/or write a reply: the person hears it from Saree3 (database trigger → alert idea_update). Also in PostHog.
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Button, Card, Chip, FilterChips, IconButton, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { IDEA_KINDS, IDEA_STATUSES, useAllIdeas, useUpdateIdea, type Idea, type IdeaKind, type IdeaStatus } from '@/features/ideas/api';
import { IDEAS_NS } from '@/features/ideas/strings';
import { STATUS_TONE } from '@/features/ideas/look';

export default function WishListScreen() {
  const { t } = useScreenT(IDEAS_NS);
  const { isRTL, lang } = useDirection();
  const me = useMyProfile();
  const ideas = useAllIdeas();
  const [kind, setKind] = useState<IdeaKind | 'all'>('all');
  const [status, setStatus] = useState<IdeaStatus | 'all'>('all');
  const all = useMemo(() => ideas.data ?? [], [ideas.data]);
  const list = all.filter((i) => (kind === 'all' || i.kind === kind) && (status === 'all' || i.status === status));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/44-more' as Href));

  if (me.data && (me.data.actual_role ?? me.data.role) !== 'super_admin') return <Redirect href={'/' as Href} />;

  const count = (f: (i: Idea) => boolean) => all.filter(f).length;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
            {t('wTitle')}
          </AppText>
        </View>
        <AppText color="textMuted">{t('wSub')}</AppText>
        <FilterChips
          options={[{ key: 'all' as const, label: t('wAll'), count: all.length }, ...IDEA_KINDS.map((k) => ({ key: k, label: t(`kind_${k}`), count: count((i) => i.kind === k) }))]}
          value={kind}
          onChange={setKind}
        />
        <FilterChips
          options={[
            { key: 'all' as const, label: t('wAll') },
            ...IDEA_STATUSES.map((s) => ({ key: s, label: t(`status_${s}`), count: count((i) => i.status === s) })),
          ]}
          value={status}
          onChange={setStatus}
        />
        {!list.length && !ideas.isLoading ? <AppText color="textMuted">{t('wEmpty')}</AppText> : list.map((i) => <WishRow key={i.id} idea={i} lang={lang} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

function WishRow({ idea: i, lang }: { idea: Idea; lang: string }) {
  const { t } = useScreenT(IDEAS_NS);
  const update = useUpdateIdea();
  const [reply, setReply] = useState(i.reply ?? '');
  const who = (lang === 'ar' && i.person?.full_name_ar) || i.person?.full_name || '…';
  const date = new Date(i.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Chip label={t(`kind_${i.kind}`)} />
        <AppText variant="small" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {who} · {i.account?.name ?? ''}
        </AppText>
        <AppText variant="caption" color="textFaint" style={{ marginStart: 'auto' }}>
          {date}
        </AppText>
      </View>
      <AppText>{i.body}</AppText>
      {!!i.screen && (
        <AppText variant="caption" color="textMuted">
          {t('from', { screen: i.screen })}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {IDEA_STATUSES.map((s) => (
          <Chip
            key={s}
            label={t(`status_${s}`)}
            tone={STATUS_TONE[s]}
            selected={i.status === s}
            onPress={() => i.status !== s && update.mutate({ id: i.id, status: s })}
          />
        ))}
      </View>
      <TextField value={reply} onChangeText={setReply} placeholder={t('wReply')} multiline />
      {reply.trim() !== (i.reply ?? '') && (
        <Button label={t('wSave')} variant="outline" size="md" loading={update.isPending} onPress={() => update.mutate({ id: i.id, reply })} />
      )}
    </Card>
  );
}
