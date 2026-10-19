// One person in the Team tree / search list: avatar, name, title, role chip, status dot, reports, open tasks, channels.
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight, MessageCircle, Send } from 'lucide-react-native';
import { AppText, Avatar, Chip } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { displayName, displayTitle, type Person, type PersonRole, type PersonStatus } from './model';
import { NS } from './strings';

export const STATUS_DOT: Record<PersonStatus, ColorToken> = {
  active: 'green',
  pending: 'amber',
  deleted: 'textFaint',
};

export const ROLE_TONE: Record<PersonRole, 'primary' | 'purple' | 'orange' | 'neutral'> = {
  super_admin: 'orange',
  admin: 'purple',
  manager: 'primary',
  employee: 'neutral',
};

type Props = {
  person: Person;
  meId?: string;
  reports: number;
  openTasks: number;
  /** undefined = leaf (no chevron), true/false = expanded state */
  expanded?: boolean;
  onToggle?: () => void;
  onPress: () => void;
  /** Extra line under the title, e.g. the manager path in search results. */
  subtitle?: string;
};

export function PersonRow({ person, meId, reports, openTasks, expanded, onToggle, onPress, subtitle }: Props) {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const name = displayName(person, lang);
  const title = displayTitle(person, lang);
  const deleted = person.status === 'deleted';
  const hasToggle = expanded !== undefined && !!onToggle;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.tile,
        boxShadow: shadows.tile,
        opacity: deleted ? 0.6 : 1,
        minHeight: 64,
      }}
    >
      {hasToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t(expanded ? 'collapse' : 'expand', { name })}
          style={{ width: sizes.touch, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}
        >
          <Chevron
            color={colors.textMuted}
            size={18}
            strokeWidth={2.2}
            style={!expanded ? { transform: [{ scaleX: isRTL ? -1 : 1 }] } : undefined}
          />
        </Pressable>
      ) : (
        <View style={{ width: spacing.md }} />
      )}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('nodeA11y', { name, title: title || t(`role_${person.role}`) })}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingEnd: spacing.lg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View>
          <Avatar name={name} size={38} />
          <View
            style={{
              position: 'absolute',
              bottom: -1,
              end: -1,
              width: 12,
              height: 12,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: colors.surface,
              backgroundColor: colors[STATUS_DOT[person.status]],
            }}
            accessibilityLabel={t(`status_${person.status}`)}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </AppText>
            {person.id === meId && (
              <AppText variant="micro" weight="bold" color="primary">
                {t('you')}
              </AppText>
            )}
            {person.whatsapp_connected && (
              <MessageCircle color={colors.green} size={14} strokeWidth={2.2} accessibilityLabel={t('whatsapp')} />
            )}
            {person.telegram_connected && (
              <Send color={colors.primaryLight} size={13} strokeWidth={2.2} accessibilityLabel={t('telegram')} />
            )}
          </View>
          {!!title && (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {title}
            </AppText>
          )}
          {!!subtitle && (
            <AppText variant="micro" color="textFaint" numberOfLines={1}>
              {subtitle}
            </AppText>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
            <Chip label={t(`role_${person.role}`)} tone={ROLE_TONE[person.role]} />
            {person.status !== 'active' && (
              <Chip label={t(`status_${person.status}`)} tone={person.status === 'pending' ? 'amber' : 'neutral'} dot />
            )}
            {reports > 0 && (
              <AppText variant="micro" color="textMuted">
                {reports === 1 ? t('reports_one') : t('reports', { n: formatNumber(reports, lang) })}
              </AppText>
            )}
            {reports > 0 && openTasks > 0 && (
              <AppText variant="micro" color="textFaint">
                ·
              </AppText>
            )}
            {openTasks > 0 && (
              <AppText variant="micro" weight="bold" color="primary">
                {t('openTasks', { n: formatNumber(openTasks, lang) })}
              </AppText>
            )}
          </View>
        </View>
      </Pressable>
    </View>
  );
}
