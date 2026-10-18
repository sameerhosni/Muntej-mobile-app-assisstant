// Screen 23 · New agent — see design/v2/html/NewAgent.dc.html (Arabic: NewAgentAR.dc.html)
// Prompt → recipe built LOCALLY with keyword rules (src/features/agents/recipe.ts, zod-validated; no AI call yet).
// "Test it now" = live read of tasks (useTasks) → what it would do. "Turn it on" = live insert into agents
// (+ an agent_runs dry-run row), then back to 22. Optional ?template=<key> pre-fills the prompt.
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hand,
  Mail,
  MessageCircle,
  Mic,
  Search,
  Sparkles,
  X,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button, Card, Gradient, IconBadge, IconButton, StatTile } from '@/components/ui';
import { colors, fontFamily, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTasks } from '@/lib/api';
import { formatNumber, HOURLY_COST_SAR } from '@/features/home/value';
import { NS as AGENTS_NS } from '@/features/agents/strings';
import { NS } from '@/features/new-agent/strings';
import {
  autoName,
  buildRecipe,
  describeDo,
  describeFind,
  describeNotify,
  describeWhen,
  RecipeSchema,
  type Tr,
} from '@/features/agents/recipe';
import { HOURS_PER_AGENT_MONTH, isTemplateKey, useCreateAgent } from '@/features/agents/useAgents';
import { runDry, type DryRun } from '@/features/new-agent/dryRun';

type Mode = 'first' | 'auto';
type Step = 'edit' | 'tested' | 'live';

const ROW_STYLE: { key: 'when' | 'find' | 'do' | 'report'; Icon: ComponentType<LucideProps>; bg: ColorToken; fg: ColorToken }[] = [
  { key: 'when', Icon: Clock, bg: 'primaryTint', fg: 'primary' },
  { key: 'find', Icon: Search, bg: 'purpleTint', fg: 'purple' },
  { key: 'do', Icon: MessageCircle, bg: 'greenTint', fg: 'green' },
  { key: 'report', Icon: Mail, bg: 'orangeTint', fg: 'orange' },
];

const MIN_PROMPT = 8;

export default function NewAgentScreen() {
  const { t } = useScreenT(NS);
  const { t: ta } = useScreenT(AGENTS_NS);
  const tr: Tr = (k, o) => t(k, o) as string;
  const tra: Tr = (k, o) => ta(k, o) as string;
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ template?: string }>();
  const template = isTemplateKey(params.template) ? params.template : undefined;

  const templatePrompt = template ? tra(`tpl.${template}.prompt`) : null;
  const [prompt, setPrompt] = useState(() => templatePrompt ?? tr('defaultPrompt'));
  const [mode, setMode] = useState<Mode>('first');
  const [step, setStep] = useState<Step>('edit');
  const [dry, setDry] = useState<DryRun | null>(null);
  const [runNotSaved, setRunNotSaved] = useState(false);

  // Language switched while untouched → follow it.
  const lastDefault = useRef(prompt);
  useEffect(() => {
    const next = templatePrompt ?? tr('defaultPrompt');
    if (prompt === lastDefault.current && next !== prompt) {
      setPrompt(next);
      lastDefault.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const tasks = useTasks();
  const create = useCreateAgent();

  const recipe = useMemo(() => buildRecipe(prompt, template), [prompt, template]);
  const valid = useMemo(() => RecipeSchema.safeParse(recipe).success, [recipe]);
  const tooShort = prompt.trim().length < MIN_PROMPT;
  const canRun = valid && !tooShort;

  const rows: Record<(typeof ROW_STYLE)[number]['key'], string> = {
    when: describeWhen(recipe, tra, true),
    find: describeFind(recipe, tra),
    do: describeDo(recipe, tra),
    report: describeNotify(recipe, tra),
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const seeAll = () => router.dismissTo('/22-agents');

  // After turning it on, show the success card briefly, then go to the list.
  useEffect(() => {
    if (step !== 'live') return;
    const id = setTimeout(seeAll, 2500);
    return () => clearTimeout(id);
  }, [step]);

  const onEdit = (text: string) => {
    setPrompt(text);
    if (step === 'tested') setStep('edit');
    setDry(null);
    create.reset();
  };

  const test = () => {
    if (!canRun || tasks.isLoading) return;
    setDry(runDry(recipe, tasks.data ?? [], tr, lang));
    setStep('tested');
  };

  const turnOn = () => {
    if (!canRun || create.isPending) return;
    const result = dry ?? runDry(recipe, tasks.data ?? [], tr, lang);
    const name = template && prompt === templatePrompt ? tra(`tpl.${template}.name`) : autoName(recipe, tra);
    create.mutate(
      {
        name,
        prompt: prompt.trim(),
        recipe,
        autonomy: mode === 'first' ? 'ask_first' : 'always_run',
        dryRunOutput: { ...result.output, title: result.title },
      },
      {
        onSuccess: (r) => {
          setRunNotSaved(!r.runSaved);
          setStep('live');
        },
      },
    );
  };

  const hours = HOURS_PER_AGENT_MONTH;
  const modeNote = t(`modeNote.${mode}`);
  const liveNote =
    recipe.trigger.type === 'schedule'
      ? t('liveNote', { when: describeWhen(recipe, tra), mode: modeNote })
      : t('liveNoteEvent', { mode: modeNote });
  const errorMsg = create.error
    ? t('saveError', { msg: create.error.message === 'no-profile' ? t('noProfile') : create.error.message })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: (step === 'edit' ? 120 : 300) + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.screen, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <IconButton label={t('back')} onPress={goBack}>
            <BackIcon color={colors.text} size={20} strokeWidth={2} />
          </IconButton>
          <AppText variant="titleLg" style={{ fontSize: 24 }}>
            {t('title')}
          </AppText>
        </View>

        <View style={{ paddingHorizontal: spacing.screen, paddingTop: spacing.xl, gap: spacing.xxl }}>
          {/* Request */}
          <Card padding={spacing.xxl} style={{ gap: spacing.sm, borderStartWidth: 4, borderStartColor: colors.primary, paddingVertical: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Mic color={colors.primary} size={14} strokeWidth={2} />
              <AppText variant="caption" weight="bold" color="primary">
                {t('request')}
              </AppText>
            </View>
            <TextInput
              value={prompt}
              onChangeText={onEdit}
              multiline
              placeholder={t('placeholder')}
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.primary}
              accessibilityLabel={t('requestLabel')}
              style={{
                minHeight: 44,
                color: colors.textSoft,
                fontSize: 15,
                lineHeight: 22,
                fontFamily: fontFamily[lang].medium,
                textAlign: isRTL ? 'right' : 'left',
                writingDirection: isRTL ? 'rtl' : 'ltr',
                textAlignVertical: 'top',
                padding: 0,
              }}
            />
          </Card>

          {/* Recipe */}
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Gradient name="purple" style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles color={colors.onDark} fill={colors.onDark} size={12} strokeWidth={1.5} />
              </Gradient>
              <AppText weight="bold" color="navy">
                {t('recipe')}
              </AppText>
            </View>
            <Card padding={spacing.xl} style={{ paddingVertical: 4, gap: 0, opacity: canRun ? 1 : 0.6 }}>
              {ROW_STYLE.map((r, i) => (
                <View
                  key={r.key}
                  accessible
                  accessibilityLabel={`${t(`rows.${r.key}`)}: ${rows[r.key]}`}
                  style={{
                    minHeight: 54,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.lg,
                    paddingVertical: 6,
                    borderBottomWidth: i === ROW_STYLE.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <IconBadge size={40} bg={r.bg}>
                    <r.Icon color={colors[r.fg]} size={20} strokeWidth={1.8} />
                  </IconBadge>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="caption" color="textMuted">
                      {t(`rows.${r.key}`)}
                    </AppText>
                    <AppText weight="bold">{rows[r.key]}</AppText>
                  </View>
                </View>
              ))}
            </Card>
            {(tooShort || !valid) && (
              <AppText variant="caption" color="red">
                {tooShort ? t('tooShort') : t('invalid')}
              </AppText>
            )}
          </View>

          {/* Autonomy */}
          <View style={{ gap: spacing.sm }}>
            <AppText variant="small" weight="semibold" color="textMuted">
              {t('autonomy')}
            </AppText>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['first', 'auto'] as Mode[]).map((m) => {
                const sel = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sel }}
                    accessibilityLabel={`${t(`modes.${m}.label`)}, ${t(`modes.${m}.sub`)}`}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 62,
                      borderRadius: radius.button,
                      borderWidth: sel ? 2 : 1,
                      borderColor: sel ? colors.primary : colors.border,
                      backgroundColor: sel ? colors.primaryTint : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      boxShadow: shadows.tile,
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <AppText weight="bold">{t(`modes.${m}.label`)}</AppText>
                    <AppText variant="micro" color="textMuted">
                      {t(`modes.${m}.sub`)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Savings (estimate) */}
          <View style={{ gap: spacing.sm }}>
            <AppText variant="small" weight="semibold" color="textMuted">
              {t('saves')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <StatTile
                icon={<Clock color={colors.primary} size={15} strokeWidth={2} />}
                iconBg="primaryTint"
                value={t('savedValue', { n: formatNumber(hours, lang) })}
                label={t('saved')}
              />
              <StatTile
                icon={<Banknote color={colors.green} size={15} strokeWidth={2} />}
                iconBg="greenTint"
                value={formatNumber(hours * HOURLY_COST_SAR, lang)}
                label={t('sar')}
              />
              <StatTile
                icon={<Hand color={colors.orange} size={15} strokeWidth={2} />}
                iconBg="orangeTint"
                value={formatNumber(0, lang)}
                label={t('chases')}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom: actions → test result → live */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.sm }}>
        {errorMsg && (
          <View style={{ marginHorizontal: spacing.screen, marginBottom: spacing.sm }}>
            <Card tone="red" padding={spacing.lg}>
              <AppText variant="small" color="red">
                {errorMsg}
              </AppText>
            </Card>
          </View>
        )}

        {step === 'edit' && (
          <View style={{ paddingHorizontal: spacing.screen, paddingTop: spacing.lg, backgroundColor: colors.bg, flexDirection: 'row', gap: spacing.md }}>
            <Button
              label={tasks.isLoading ? t('testing') : t('test')}
              variant="outline"
              onPress={test}
              disabled={!canRun || tasks.isLoading}
              style={{ flex: 1 }}
            />
            <Button label={t('turnOn')} onPress={turnOn} loading={create.isPending} disabled={!canRun} style={{ flex: 1 }} />
          </View>
        )}

        {step === 'tested' && dry && (
          <View
            style={{
              marginHorizontal: spacing.xxl,
              backgroundColor: colors.surface,
              borderRadius: radius.cardLg,
              padding: spacing.xl,
              gap: spacing.sm,
              boxShadow: shadows.raised,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cyan }} />
              <AppText variant="caption" weight="bold" color="primary" style={{ flex: 1 }}>
                {dry.title}
              </AppText>
              <Pressable
                onPress={() => setStep('edit')}
                accessibilityRole="button"
                accessibilityLabel={t('closeTest')}
                hitSlop={12}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <X color={colors.textFaint} size={16} strokeWidth={2.2} />
              </Pressable>
            </View>
            {dry.detail && (
              <AppText variant="small" color="textSoft">
                {dry.detail}
              </AppText>
            )}
            {dry.lines.map((line) => (
              <View
                key={line}
                style={{
                  backgroundColor: colors.greenTint,
                  borderRadius: 14,
                  borderBottomStartRadius: 4,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <AppText variant="small" color="textSoft" style={{ lineHeight: 20 }}>
                  {line}
                </AppText>
              </View>
            ))}
            {dry.more && (
              <AppText variant="caption" color="textMuted">
                {dry.more}
              </AppText>
            )}
            <Button label={t('great')} onPress={turnOn} loading={create.isPending} disabled={!canRun} />
          </View>
        )}

        {step === 'live' && (
          <View
            style={{
              marginHorizontal: spacing.xxl,
              backgroundColor: colors.greenTint,
              borderWidth: 1,
              borderColor: colors.greenLight,
              borderRadius: radius.cardLg,
              padding: spacing.xxl,
              flexDirection: 'row',
              gap: spacing.lg,
              boxShadow: shadows.raised,
            }}
          >
            <IconBadge size={40} gradient="success">
              <Check color={colors.onDark} size={20} strokeWidth={2.4} />
            </IconBadge>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="title" color="greenText" style={{ fontSize: 19 }}>
                {t('liveTitle')}
              </AppText>
              <AppText variant="small" color="greenText" style={{ lineHeight: 20 }}>
                {liveNote}
              </AppText>
              {runNotSaved && (
                <AppText variant="caption" color="amberStrong">
                  {t('runNotSaved')}
                </AppText>
              )}
              <Pressable onPress={seeAll} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <AppText weight="bold" color="primary">
                  {t('seeAll')}
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
