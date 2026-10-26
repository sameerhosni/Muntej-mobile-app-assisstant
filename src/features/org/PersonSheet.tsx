// Person details for screen 39: fields, skills with level bars, contact, live task numbers, permitted actions.
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Mail, MessageCircle, Phone, Send, UserPlus, Pencil, Trash2, RotateCcw } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Chip, StatTile } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import type { TaskWithPeople } from '@/lib/api';
import {
  canAddUnder,
  displayName,
  displayTitle,
  editLevel,
  serverErrorKey,
  skillsOf,
  statsFor,
  useUpsertPerson,
  type OrgIndex,
  type Person,
} from './model';
import { ROLE_TONE, STATUS_DOT } from './PersonRow';
import { NS } from './strings';
import { InviteStatus } from '@/features/invite/InviteStatus';

type Props = {
  person: Person;
  me: Person | undefined;
  people: Person[];
  index: OrgIndex;
  tasks: TaskWithPeople[] | undefined;
  onEdit: () => void;
  onAddUnder: () => void;
};

export function PersonSheet({ person, me, people, index, tasks, onEdit, onAddUnder }: Props) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const upsert = useUpsertPerson();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = displayName(person, lang);
  const title = displayTitle(person, lang);
  const manager = person.manager_id ? index.byId.get(person.manager_id) : undefined;
  const reports = (index.children.get(person.id) ?? []).filter((p) => p.status !== 'deleted');
  const skills = skillsOf(person);
  const stats = statsFor(person.id, tasks);
  const level = editLevel(me, person, index.byId);
  const canAdd = canAddUnder(me, person, people, index.byId);
  const canDelete = level === 'full' && person.id !== me?.id;
  const n = (v: number) => formatNumber(v, lang);

  const setStatus = (status: 'deleted' | 'active') => {
    setError(null);
    upsert.mutate(
      { id: person.id, status },
      {
        onSuccess: () => setConfirmDelete(false),
        onError: (e) => {
          const key = serverErrorKey(e.message);
          setError(key ? t(key) : t('err_generic', { msg: e.message }));
        },
      },
    );
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <View>
          <Avatar name={name} size={60} />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              end: 0,
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 3,
              borderColor: colors.bg,
              backgroundColor: colors[STATUS_DOT[person.status]],
            }}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="title">{name}</AppText>
          {!!title && (
            <AppText variant="small" color="textMuted">
              {title}
            </AppText>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Chip label={t(`role_${person.role}`)} tone={ROLE_TONE[person.role]} />
            <Chip
              label={t(`status_${person.status}`)}
              tone={person.status === 'active' ? 'green' : person.status === 'pending' ? 'amber' : 'neutral'}
              dot
            />
          </View>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile value={n(stats.open)} label={t('s_open')} />
          <StatTile value={n(stats.doneMonth)} label={t('s_doneMonth')} iconBg="greenTint" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile value={stats.onTimePct === null ? '—' : `${n(stats.onTimePct)}%`} label={t('s_onTime')} />
          <StatTile value={n(stats.late)} label={t('s_late')} />
        </View>
        <AppText variant="micro" color="textFaint">
          {t('statsNote')}
        </AppText>
      </View>

      <Card>
        <AppText variant="cardTitle">{t('details')}</AppText>
        <InfoRow
          label={t('manager')}
          value={manager ? displayName(manager, lang) : t('noManager')}
        />
        <InfoRow label={t('directReports')} value={n(reports.length)} />
        <InfoRow label={t('weeklyHours')} value={t('hoursValue', { n: n(Number(person.weekly_capacity_hours)) })} />
        <InfoRow
          label={t('experience')}
          value={person.years_experience === null ? '—' : t('yearsValue', { n: n(Number(person.years_experience)) })}
        />
      </Card>

      <Card>
        <AppText variant="cardTitle">{t('contact')}</AppText>
        {!person.phone && !person.email && (
          <AppText variant="small" color="textMuted">
            {t('noContact')}
          </AppText>
        )}
        {!!person.phone && (
          <ContactRow
            icon={<Phone color={colors.primary} size={17} strokeWidth={2} />}
            text={`+${person.phone}`}
            label={t('call', { phone: `+${person.phone}` })}
            onPress={() => Linking.openURL(`tel:+${person.phone}`).catch(() => {})}
          />
        )}
        {!!person.email && (
          <ContactRow
            icon={<Mail color={colors.primary} size={17} strokeWidth={2} />}
            text={person.email}
            label={t('mail', { email: person.email })}
            onPress={() => Linking.openURL(`mailto:${person.email}`).catch(() => {})}
          />
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MessageCircle color={person.whatsapp_connected ? colors.green : colors.textFaint} size={15} strokeWidth={2} />
            <AppText variant="caption" color={person.whatsapp_connected ? 'greenText' : 'textMuted'}>
              {`${t('wa')}: ${t(person.whatsapp_connected ? 'connected' : 'notConnected')}`}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Send color={person.telegram_connected ? colors.primaryLight : colors.textFaint} size={14} strokeWidth={2} />
            <AppText variant="caption" color={person.telegram_connected ? 'primary' : 'textMuted'}>
              {`${t('tg')}: ${t(person.telegram_connected ? 'connected' : 'notConnected')}`}
              {person.telegram_connected && person.telegram_handle ? ` (@${person.telegram_handle.replace(/^@/, '')})` : ''}
            </AppText>
          </View>
        </View>
      </Card>

      {/* their invitation: status and Invite / Send again (people who manage them) */}
      {person.id !== me?.id && <InviteStatus person={person} />}

      <Card>
        <AppText variant="cardTitle">{t('skills')}</AppText>
        {skills.length === 0 && (
          <AppText variant="small" color="textMuted">
            {t('noSkills')}
          </AppText>
        )}
        {skills.map((s, i) => (
          <View
            key={`${s.name}-${i}`}
            style={{ gap: 4, paddingTop: i ? spacing.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText weight="bold" style={{ flex: 1 }} numberOfLines={1}>
                {s.name}
              </AppText>
              {s.years !== null && s.years !== undefined && !Number.isNaN(s.years) && (
                <AppText variant="caption" color="textMuted">
                  {t('skillYears', { n: n(s.years) })}
                </AppText>
              )}
            </View>
            <LevelBars level={s.level} label={t('levelA11y', { n: n(s.level) })} />
            {!!s.notes && (
              <AppText variant="caption" color="textMuted">
                {s.notes}
              </AppText>
            )}
          </View>
        ))}
      </Card>

      {error && (
        <Card tone="red" padding={spacing.lg}>
          <AppText variant="small" color="red">
            {error}
          </AppText>
        </Card>
      )}

      {level !== 'none' && (
        <Button
          label={level === 'self' ? t('editMine') : t('edit')}
          icon={<Pencil color={colors.onDark} size={17} strokeWidth={2} />}
          onPress={onEdit}
        />
      )}
      {canAdd && (
        <Button
          label={t('addUnder', { name })}
          variant="outline"
          icon={<UserPlus color={colors.primary} size={17} strokeWidth={2} />}
          onPress={onAddUnder}
        />
      )}
      {canDelete && person.status === 'deleted' && (
        <Button
          label={t('restore')}
          variant="outline"
          icon={<RotateCcw color={colors.primary} size={17} strokeWidth={2} />}
          loading={upsert.isPending}
          onPress={() => setStatus('active')}
        />
      )}
      {canDelete && person.status !== 'deleted' && !confirmDelete && (
        <Button
          label={t('markDeleted')}
          variant="ghost"
          icon={<Trash2 color={colors.primary} size={17} strokeWidth={2} />}
          onPress={() => setConfirmDelete(true)}
        />
      )}
      {canDelete && person.status !== 'deleted' && confirmDelete && (
        <Card tone="red">
          <AppText variant="small">{t('confirmDelete', { name })}</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={t('cancel')}
              variant="outline"
              size="md"
              style={{ flex: 1 }}
              onPress={() => setConfirmDelete(false)}
            />
            <Button
              label={t('yesDelete')}
              variant="outline"
              tone="amber"
              size="md"
              style={{ flex: 1 }}
              loading={upsert.isPending}
              onPress={() => setStatus('deleted')}
            />
          </View>
        </Card>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 }}>
      <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="small" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
        {value}
      </AppText>
    </View>
  );
}

function ContactRow({ icon, text, label, onPress }: { icon: React.ReactNode; text: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.primaryTint : colors.surfaceMuted,
      })}
    >
      {icon}
      <AppText weight="semibold" color="primary" style={{ flex: 1, writingDirection: 'ltr' }} numberOfLines={1}>
        {text}
      </AppText>
    </Pressable>
  );
}

export function LevelBars({ level, label }: { level: number; label: string }) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: i <= level ? colors.primary : colors.track,
          }}
        />
      ))}
    </View>
  );
}
