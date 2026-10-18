// The 24 screens from docs/BRD.md, with their route and design file.

export type ScreenNum =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'
  | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23' | '24';

export type ScreenMeta = {
  num: ScreenNum;
  route: string;
  design: string;
  sprint: 1 | 2 | 3;
  tab?: boolean;
};

export const SCREENS: ScreenMeta[] = [
  { num: '01', route: '/01-home', design: '01-Home.png', sprint: 1, tab: true },
  { num: '02', route: '/02-capture', design: '02-Capture.png', sprint: 1 },
  { num: '03', route: '/03-autopilot', design: '03-Autopilot.png', sprint: 1, tab: true },
  { num: '04', route: '/04-decisions', design: '04-Decisions.png', sprint: 1, tab: true },
  { num: '05', route: '/05-brief', design: '05-Brief.png', sprint: 2, tab: true },
  { num: '06', route: '/06-employee-chat', design: '06-Employee.png', sprint: 1 },
  { num: '07', route: '/07-promise-catcher', design: '07-PromiseCatcher.png', sprint: 2 },
  { num: '08', route: '/08-pushback', design: '08-Pushback.png', sprint: 3 },
  { num: '09', route: '/09-reverse-followup', design: '09-ReverseFollowup.png', sprint: 2 },
  { num: '10', route: '/10-evidence', design: '10-Evidence.png', sprint: 2 },
  { num: '11', route: '/11-load-radar', design: '11-LoadRadar.png', sprint: 3 },
  { num: '12', route: '/12-sources', design: '12-Sources.png', sprint: 2 },
  { num: '13', route: '/13-note-taker', design: '13-NoteTaker.png', sprint: 2 },
  { num: '14', route: '/14-task-detail', design: '14-TaskDetail.png', sprint: 1 },
  { num: '15', route: '/15-review', design: '15-Review.png', sprint: 1 },
  { num: '16', route: '/16-dashboard', design: '16-Dashboard.png', sprint: 2 },
  { num: '17', route: '/17-summaries', design: '17-Summaries.png', sprint: 2 },
  { num: '18', route: '/18-alerts', design: '18-Alerts.png', sprint: 1 },
  { num: '19', route: '/19-workspaces', design: '19-Workspaces.png', sprint: 3 },
  { num: '20', route: '/20-new-workspace', design: '20-NewWorkspace.png', sprint: 3 },
  { num: '21', route: '/21-achievements', design: '21-Achievements.png', sprint: 3 },
  { num: '22', route: '/22-agents', design: '22-Agents.png', sprint: 3 },
  { num: '23', route: '/23-new-agent', design: '23-NewAgent.png', sprint: 3 },
  { num: '24', route: '/24-roadmap', design: '24-Roadmap.png', sprint: 3 },
];

export function screenMeta(num: ScreenNum): ScreenMeta {
  return SCREENS.find((s) => s.num === num)!;
}
