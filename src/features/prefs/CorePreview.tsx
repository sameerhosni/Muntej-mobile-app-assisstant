// Customize Home's preview of Home's own sections: the same components Home shows, with the person's live data.
// Shown read-only (taps inside do nothing), so it's a look, not a second Home.
import { View } from 'react-native';
import { GlanceCard } from '@/features/home/GlanceCard';
import { JourneyCard } from '@/features/ladder/Journey';
import { NeedsYou } from '@/features/home/SimpleHome';
import { ConfirmNew } from '@/features/home/ConfirmNew';
import { MyRequests } from '@/features/home/MyRequests';
import { FromSaree3, TeamRisks, TeamWins } from '@/features/home/TeamRadar';
import { JobsStrip } from '@/features/saree3/JobsStrip';
import { WhatsNewStrip } from '@/features/launch/WhatsNew';
import type { HomeSection } from './appPrefs';

export function CorePreview({ section }: { section: HomeSection }) {
  const body =
    section === 'glance' ? (
      <GlanceCard />
    ) : section === 'journey' ? (
      <JourneyCard />
    ) : section === 'needs' ? (
      <NeedsYou>
        <ConfirmNew bare />
        <MyRequests bare />
      </NeedsYou>
    ) : section === 'saree3' ? (
      <FromSaree3 top={<JobsStrip />}>
        <TeamRisks embedded />
      </FromSaree3>
    ) : section === 'wins' ? (
      <TeamWins />
    ) : section === 'whatsnew' ? (
      <WhatsNewStrip />
    ) : null;
  return <View pointerEvents="none">{body}</View>;
}
