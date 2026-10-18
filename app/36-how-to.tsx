// Screen 36 · Ask Muntej how — see design/v2/html/HowTo.dc.html (Arabic: HowToAR.dc.html)
// Demo: suggested questions + local free-text matching (no AI call yet). "Show me" opens the real route;
// "Do it for me" is a demo confirmation state.
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, BookX, Check, ChevronLeft, ChevronRight, Clock, Mic, SendHorizontal, Sparkles } from 'lucide-react-native';
import { AppText, Button, Card, Gradient, IconBadge, StatTile } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/howTo/strings';
import { matchQuestion, QUESTIONS, TOP_COUNT, type QuestionId } from '@/features/howTo/questions';
import { LightHeader } from '@/features/addTeam/LightHeader';

const FOOTER_SPACE = 170;

export default function HowToScreen() {
  const { t } = useScreenT(NS);
  const { i18n } = useTranslation();
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<QuestionId>('task');
  const [done, setDone] = useState<Partial<Record<QuestionId, boolean>>>({});
  const [ask, setAsk] = useState('');
  const [noMatch, setNoMatch] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const cur = QUESTIONS.find((q) => q.id === selected) ?? QUESTIONS[0];
  const did = !!done[selected];
  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  // Both languages' question texts, so an Arabic question matches while the UI is in English and vice versa.
  const texts = useMemo(() => {
    const out = {} as Record<QuestionId, string[]>;
    for (const q of QUESTIONS) {
      out[q.id] = (['en', 'ar'] as const).map((lng) => i18n.t(`${NS}.q.${q.id}.text`, { lng }));
    }
    return out;
  }, [i18n]);

  const top = QUESTIONS.slice(0, TOP_COUNT);
  // A matched question outside the top four still shows in the list so the selection is visible.
  const listed = top.some((q) => q.id === selected) ? top : [...top, cur];

  const submit = () => {
    if (!ask.trim()) {
      inputRef.current?.focus();
      return;
    }
    const hit = matchQuestion(ask, texts);
    if (hit) {
      setSelected(hit);
      setNoMatch(false);
      setAsk('');
    } else {
      setNoMatch(true);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingBottom: FOOTER_SPACE + insets.bottom, gap: spacing.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LightHeader
          title={t('title')}
          backLabel={t('back')}
          bandHeight={110}
          pills={[
            { label: t('fast'), Icon: Clock, color: 'primary' },
            { label: t('noManuals'), Icon: Check, color: 'purple' },
          ]}
        />

        {/* Suggested questions */}
        <View style={{ gap: spacing.sm, marginTop: 4 }}>
          <AppText variant="caption" weight="bold" color="textMuted">
            {t('top')}
          </AppText>
          {listed.map((q) => {
            const on = q.id === selected;
            return (
              <Pressable
                key={q.id}
                onPress={() => {
                  setSelected(q.id);
                  setNoMatch(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  minHeight: 50,
                  borderRadius: radius.tile,
                  borderWidth: 1,
                  borderColor: on ? colors.primary : colors.surface,
                  backgroundColor: on ? colors.primaryTint : colors.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingStart: spacing.sm,
                  paddingEnd: spacing.lg,
                  boxShadow: shadows.tile,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <IconBadge size={34} bg={on ? 'surface' : q.tint}>
                  <q.Icon color={colors[q.ink]} size={17} strokeWidth={1.9} />
                </IconBadge>
                <AppText weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                  {t(`q.${q.id}.text`)}
                </AppText>
                <Chevron color={colors.primary} size={16} strokeWidth={2.2} />
              </Pressable>
            );
          })}
        </View>

        {noMatch && (
          <Card tone="amber" padding={spacing.lg}>
            <AppText variant="small" color="amberStrong">
              {t('noMatch')}
            </AppText>
          </Card>
        )}

        {/* Answer: 3 steps + actions */}
        <Card padding={0} elevation="raised" style={{ overflow: 'hidden', gap: 0 }}>
          <View style={{ backgroundColor: colors.primaryTint, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Gradient name="heroManager" style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles color={colors.onDark} fill={colors.onDark} size={12} strokeWidth={1.5} />
                </Gradient>
                <AppText variant="caption" weight="extrabold" color="primary">
                  {t('muntej')}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                <Clock color={colors.green} size={11} strokeWidth={2.6} />
                <AppText variant="micro" weight="extrabold" color="greenText">
                  {t(`q.${cur.id}.val`)}
                </AppText>
              </View>
            </View>
            <AppText variant="lead" weight="extrabold" accessibilityRole="header">
              {t(`q.${cur.id}.title`)}
            </AppText>
          </View>
          <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.xl, paddingHorizontal: spacing.xxl, gap: 9 }}>
            {(['s1', 's2', 's3'] as const).map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Gradient name="avatarBlue" style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <AppText variant="caption" weight="extrabold" color="onDark">
                    {formatNumber(i + 1, lang)}
                  </AppText>
                </Gradient>
                <AppText weight="semibold" color="textSoft" style={{ flex: 1 }}>
                  {t(`q.${cur.id}.${s}`)}
                </AppText>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
              <Button label={t('showMe')} size="md" onPress={() => router.push(cur.href)} style={{ flex: 1 }} />
              {did ? (
                <View
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${t('done')} ${t(`q.${cur.id}.act`)}`}
                  style={{ flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderBlue, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}
                >
                  <AppText variant="cardTitle" weight="bold" color="greenText">
                    {t('done')}
                  </AppText>
                </View>
              ) : (
                <Button
                  label={t('doIt')}
                  size="md"
                  variant="outline"
                  onPress={() => setDone((d) => ({ ...d, [selected]: true }))}
                  style={{ flex: 1 }}
                />
              )}
            </View>
            {did && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check color={colors.green} size={14} strokeWidth={2.6} />
                <AppText variant="caption" weight="semibold" color="greenText">
                  {t(`q.${cur.id}.act`)}
                </AppText>
              </View>
            )}
          </View>
        </Card>
      </ScrollView>

      {/* Sticky footer: value tiles + ask bar */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.sm,
          backgroundColor: colors.bg,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile icon={<Clock color={colors.primary} size={15} strokeWidth={2} />} iconBg="primaryTint" value={t('secValue', { n: formatNumber(3, lang) })} label={t('perAnswer')} />
          <StatTile icon={<BookX color={colors.orange} size={15} strokeWidth={2} />} iconBg="orangeTint" value={formatNumber(0, lang)} label={t('manuals')} />
          <StatTile icon={<Banknote color={colors.green} size={15} strokeWidth={2} />} iconBg="greenTint" value={formatNumber(0, lang)} label={t('training')} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.pill,
            paddingVertical: 6,
            paddingStart: 18,
            paddingEnd: 6,
            boxShadow: shadows.raised,
          }}
        >
          <TextInput
            ref={inputRef}
            value={ask}
            onChangeText={(v) => {
              setAsk(v);
              if (noMatch) setNoMatch(false);
            }}
            onSubmitEditing={submit}
            returnKeyType="send"
            placeholder={t('askPlaceholder')}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.primary}
            accessibilityLabel={t('askLabel')}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: sizes.touch,
              color: colors.text,
              fontSize: fontSize.body,
              fontFamily: fontFamily[lang].medium,
              textAlign: isRTL ? 'right' : 'left',
              writingDirection: isRTL ? 'rtl' : 'ltr',
            }}
          />
          <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel={t('send')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, borderRadius: sizes.touch / 2, boxShadow: shadows.mic })}>
            <Gradient name="heroManager" style={{ width: sizes.touch, height: sizes.touch, borderRadius: sizes.touch / 2, alignItems: 'center', justifyContent: 'center' }}>
              {ask.trim() ? (
                <SendHorizontal color={colors.onDark} size={19} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
              ) : (
                <Mic color={colors.onDark} size={20} strokeWidth={1.9} />
              )}
            </Gradient>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
