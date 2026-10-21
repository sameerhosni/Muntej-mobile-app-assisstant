// The 37 v2 screens (design/v2/canvas.json), with their route, design file and sprint,
// plus 38 Tasks, 39 Team, 40 Objectives, 41 Objective detail and 42 Incoming (no mockup; v2 light style per design/TOKENS.md).

export type ScreenNum =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | '13'
  | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23' | '24' | '25' | '26'
  | '27' | '28' | '29' | '30' | '31' | '32' | '33' | '34' | '35' | '36' | '37' | '38' | '39' | '40' | '41' | '42';

export type Role = 'manager' | 'employee';

export type ScreenMeta = {
  num: ScreenNum;
  route: string;
  /** design/v2/html/<design>.dc.html (+ <design>AR.dc.html) */
  design: string;
  sprint: 1 | 2 | 3;
  /**
   * Lives in the tab navigator. A role name means the screen shows that role's bar;
   * 'both' means it is in both bars and shows the signed-in user's bar.
   */
  tab?: Role | 'both';
};

export const SCREENS: ScreenMeta[] = [
  { num: '01', route: '/01-home', design: 'Main', sprint: 1, tab: 'manager' },
  { num: '02', route: '/02-capture', design: 'Capture', sprint: 1 },
  { num: '03', route: '/03-autopilot', design: 'Autopilot', sprint: 1, tab: 'manager' },
  { num: '04', route: '/04-decisions', design: 'Decisions', sprint: 1, tab: 'manager' },
  { num: '05', route: '/05-brief', design: 'Brief', sprint: 2, tab: 'manager' },
  { num: '06', route: '/06-employee-chat', design: 'Employee', sprint: 1, tab: 'employee' },
  { num: '07', route: '/07-promise-catcher', design: 'PromiseCatcher', sprint: 2 },
  { num: '08', route: '/08-pushback', design: 'Pushback', sprint: 3 },
  { num: '09', route: '/09-reverse-followup', design: 'ReverseFollowup', sprint: 2 },
  { num: '10', route: '/10-evidence', design: 'Evidence', sprint: 2 },
  { num: '11', route: '/11-load-radar', design: 'LoadRadar', sprint: 3 },
  { num: '12', route: '/12-sources', design: 'Sources', sprint: 2 },
  { num: '13', route: '/13-note-taker', design: 'NoteTaker', sprint: 2 },
  { num: '14', route: '/14-task-detail', design: 'TaskDetail', sprint: 1 },
  { num: '15', route: '/15-review', design: 'Review', sprint: 1 },
  { num: '16', route: '/16-dashboard', design: 'Dashboard', sprint: 2 },
  { num: '17', route: '/17-summaries', design: 'Summaries', sprint: 2 },
  { num: '18', route: '/18-alerts', design: 'Alerts', sprint: 1 },
  { num: '19', route: '/19-workspaces', design: 'Workspaces', sprint: 3 },
  { num: '20', route: '/20-new-workspace', design: 'NewWorkspace', sprint: 3 },
  { num: '21', route: '/21-achievements', design: 'Timeline', sprint: 3 },
  { num: '22', route: '/22-agents', design: 'Agents', sprint: 3 },
  { num: '23', route: '/23-new-agent', design: 'NewAgent', sprint: 3 },
  { num: '24', route: '/24-roadmap', design: 'ProjectRoadmap', sprint: 3 },
  { num: '25', route: '/25-employee-home', design: 'EmployeeHome', sprint: 1, tab: 'employee' },
  { num: '26', route: '/26-rewards', design: 'Rewards', sprint: 1, tab: 'employee' },
  { num: '27', route: '/27-points-control', design: 'PointsControl', sprint: 1 },
  { num: '28', route: '/28-kudos', design: 'Kudos', sprint: 2 },
  { num: '29', route: '/29-badges', design: 'Badges', sprint: 2, tab: 'employee' },
  { num: '30', route: '/30-team-quests', design: 'TeamQuests', sprint: 2 },
  { num: '31', route: '/31-team-launch', design: 'TeamLaunch', sprint: 1 },
  { num: '32', route: '/32-receipt', design: 'Receipt', sprint: 1 },
  { num: '33', route: '/33-setup-quest', design: 'SetupQuest', sprint: 1 },
  { num: '34', route: '/34-add-team', design: 'AddTeam', sprint: 1 },
  { num: '35', route: '/35-first-run', design: 'FirstRun', sprint: 1 },
  { num: '36', route: '/36-how-to', design: 'HowTo', sprint: 1 },
  { num: '37', route: '/37-grow', design: 'Grow', sprint: 2 },
  { num: '38', route: '/38-tasks', design: 'Tasks', sprint: 1, tab: 'both' },
  { num: '39', route: '/39-team', design: 'Team', sprint: 1 },
  { num: '40', route: '/40-objectives', design: 'Objectives', sprint: 1 },
  { num: '41', route: '/41-objective', design: 'Objective', sprint: 1 },
  { num: '42', route: '/42-incoming', design: 'Incoming', sprint: 2 },
];

export function screenMeta(num: ScreenNum): ScreenMeta {
  return SCREENS.find((s) => s.num === num)!;
}

// admins and super admins use the manager home
export function homeRouteFor(role: Role | 'admin' | 'super_admin' | undefined) {
  return role === 'employee' ? '/25-employee-home' : '/01-home';
}
