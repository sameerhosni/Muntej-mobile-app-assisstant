// Screen 61 · Build your team — no mockup (replaces the AddTeam demo, screen 34). Owner, 26 Oct: building the org is
// the hook, so many smart ways in: snap the org chart, upload Excel / CSV / PDF, write or paste a list (Saree3 reads
// sentences too), connect a system (Microsoft / Google / Jisr, coming), or one person by hand. Every way ends on
// Review your team (screen 62).
import { useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, ChevronLeft, ClipboardPaste, FileSpreadsheet, Image as ImageIcon, PlugZap, UserPlus, type LucideProps } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconBadge, IconButton, TextField } from '@/components/ui';
import { colors, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { canFile, canPhoto, readFile, readPhoto, readText, type Draft } from '@/features/teamImport/api';
import { TEAM_IMPORT_NS } from '@/features/teamImport/strings';

export default function BuildTeamScreen() {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const { isRTL } = useDirection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/39-team' as Href));

  const run = async (read: () => Promise<Draft | null>) => {
    setError(null);
    setBusy(true);
    try {
      const draft = await read();
      if (draft) router.push(`/62-team-review?id=${draft.id}` as Href);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'permission' ? t('permission') : t('readFailed', { why: msg }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </IconButton>
          <AppText variant="titleLg" numberOfLines={1} style={{ flex: 1 }}>
            {t('title')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Munti size="sm" mood={busy ? 'think' : 'wave'} />
          <AppText color="textSoft" style={{ flex: 1 }}>
            {busy ? t('reading') : t('sub')}
          </AppText>
        </View>
        {busy && <ActivityIndicator color={colors.primary} />}
        {!!error && (
          <AppText variant="small" color="red">
            {error}
          </AppText>
        )}

        {canPhoto && (
          <Way Icon={Camera} bg="primaryTint" fg={colors.primary} title={t('photo')} sub={t('photoSub')} disabled={busy} onPress={() => run(() => readPhoto('camera'))}>
            <Chip label={t('gallery')} onPress={() => run(() => readPhoto('library'))} />
          </Way>
        )}
        {canFile && (
          <Way Icon={FileSpreadsheet} bg="greenTint" fg={colors.green} title={t('file')} sub={t('fileSub')} disabled={busy} onPress={() => run(readFile)} />
        )}
        <Way Icon={ClipboardPaste} bg="purpleTint" fg={colors.purple} title={t('paste')} sub={t('pasteSub')} disabled={busy} onPress={() => setPasteOpen((o) => !o)}>
          {pasteOpen && (
            <View style={{ gap: spacing.sm, width: '100%' }}>
              <TextField value={text} onChangeText={setText} placeholder={t('pastePh')} multiline style={{ minHeight: 120, textAlignVertical: 'top' }} />
              <Button label={t('read')} onPress={() => run(() => readText(text))} disabled={busy || text.trim().length < 3} loading={busy} />
            </View>
          )}
        </Way>
        <Way Icon={PlugZap} bg="amberTint" fg={colors.amberText} title={t('connect')} sub={t('connectSub')} disabled badge={t('soon')} onPress={() => {}} />
        <Way Icon={UserPlus} bg="chip" fg={colors.textSoft} title={t('manual')} sub={t('manualSub')} disabled={busy} onPress={() => router.push('/39-team?add=1' as Href)} />
        {!canPhoto && <Way Icon={ImageIcon} bg="chip" fg={colors.textFaint} title={t('photo')} sub={t('photoSub')} disabled badge={t('soon')} onPress={() => {}} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Way({
  Icon,
  bg,
  fg,
  title,
  sub,
  onPress,
  disabled,
  badge,
  children,
}: {
  Icon: ComponentType<LucideProps>;
  bg: ColorToken;
  fg: string;
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <Card style={{ gap: spacing.md, opacity: disabled && badge ? 0.6 : 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, opacity: pressed ? 0.7 : 1 })}
      >
        <IconBadge size={44} bg={bg} round>
          <Icon color={fg} size={22} />
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText weight="bold">{title}</AppText>
          <AppText variant="caption" color="textMuted">
            {sub}
          </AppText>
        </View>
        {!!badge && <Chip label={badge} />}
      </Pressable>
      {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View> : null}
    </Card>
  );
}
