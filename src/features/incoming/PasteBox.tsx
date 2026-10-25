// Paste a message (notes, a chat you copied…) and Saree3 finds the tasks in it; they wait for your OK like any tool's.
// Lives on the "Pasted & shared" tool page (screen 55); `initial` is text shared into Muntej from another app.
import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { AppText, Button, Card } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { contentDirection } from '@/features/chat/Bubbles';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { useIncomingActions } from './api';
import { NS } from './strings';

export function PasteBox({ initial }: { initial?: string }) {
  const { t } = useScreenT(NS);
  const actions = useIncomingActions();
  const [text, setText] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (initial) setText(initial);
  }, [initial]);

  const find = async () => {
    setBusy(true);
    setNote(null);
    try {
      const item = await actions.ingest(text, initial ? 'share' : 'paste');
      featureUsed('incoming');
      setText('');
      const auto = item.suggestions.filter((s) => s.auto).length;
      if (item.duplicate_message) setNote(t('sameMessage'));
      else if (!item.suggestions.length) setNote(t('foundNone'));
      else if (auto) setNote(t('autoAdded', { count: auto, n: auto }));
    } catch (e) {
      setNote((e as Error).message || t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Spotlight id="incoming.paste">
      <Card style={{ gap: spacing.md }}>
        <AppText variant="small" weight="semibold" color="textMuted">
          {t('pasteLabel')}
        </AppText>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={t('pastePlaceholder')}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          accessibilityLabel={t('pasteLabel')}
          style={{
            minHeight: 110,
            maxHeight: 240,
            borderWidth: 1,
            borderColor: colors.borderBlue,
            borderRadius: radius.tile,
            padding: spacing.lg,
            color: colors.text,
            fontSize: fontSize.body,
            fontFamily: fontFamily.en.medium,
            textAlignVertical: 'top',
            writingDirection: contentDirection(text),
            textAlign: contentDirection(text) === 'rtl' ? 'right' : 'left',
          }}
        />
        <Button label={t('find')} size="md" loading={busy} disabled={!text.trim()} onPress={find} />
        {note && (
          <AppText variant="small" color="textMuted" align="center">
            {note}
          </AppText>
        )}
      </Card>
    </Spotlight>
  );
}
