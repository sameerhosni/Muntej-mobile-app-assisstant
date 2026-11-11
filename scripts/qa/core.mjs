// Which QA checks run on every release, and which run only when their part of Muntej changed (owner, 11 Nov: "QA takes
// much time now, let's choose the most important test cases and run it every time … the other minor and low priority
// cases to be done later if needed or if we are testing anything related to it").
//   core      the checks that touch the whole system: every release
//   related   an area's other checks: when a file of that area changed since the last test release (git tag `testing`)
//   --full    everything (before --live, or on request: `npm run qa -- --full`)

/** core checks, by their exact name; one ending in * matches by its start (a templated or long name) */
export const CORE = [
  // code
  'App type-check (tsc)',
  'Every app string has Hindi',
  'No pull-to-refresh spinner unless you pulled',
  'Edge functions type-check (deno)',
  // server
  'Reset the test company',
  'Test sign-in (one-time link)',
  'Saree3 chat answers a question',
  'Report: daily',
  'Proof: adding it re-checks the work',
  // WhatsApp
  '“مساعدة”',
  '“وش يحتاجني”',
  'A typed answer goes to the seat that asked for it*',
  'A found task shows all its details, three buttons*',
  // permissions
  'You can give tasks to your team and to people at your level in other teams',
  'You can’t give tasks upward or to another level of another team',
  'Your team’s tasks, tasks your team gave, tasks naming you*',
  'Only whoever gave a task (or above) can cancel it*',
  'One alert per action, never to yourself',
  'No database function points at a column or table that isn’t there',
  // tasks from your tools
  'A direct ask to you becomes your task',
  'Not a task: a vendor’s sales pitch*',
  'A direct message telling someone goes to them, not you',
  'Tools: your own ask in a group chat never waits on your list',
  // chat
  'One task for each person, each in their field',
  '“Update Saad’s task” changes it, no duplicate',
  // invites and requests
  // (its setup: the invitation and the login it reads — reviewer, 11 Nov: a core check never reads non-core state)
  'Sending the invitation doesn’t make them active',
  'Their first sign-in makes them active and tells the manager',
  'An ask to your manager reaches them as a request*',
  'Your own task cancels and comes back*',
  'Nothing goes to the AI before the person allows it',
  // translation, Hindi
  'A task written in English reaches an Arabic reader in Arabic*',
  'A task reaches someone who chose Hindi in Hindi',
  // delivery
  'The super admin’s console seat sends nothing*',
  'Muntej’s WhatsApp number is alive at Meta',
  'Email can reach people*',
  // screens
  'Sign in with the test link',
  'Arabic reads from the right, an English sentence from the left',
  'Open /',
  'Open /38-tasks',
  'Open /04-decisions',
  'Open /18-alerts',
  'Open /settings',
  '«يحتاجك» holds everything waiting on you*',
];

/** every QA area (a change nothing below explains selects all of them) */
export const ALL_AREAS = ['code', 'server', 'whatsapp', 'tasks', 'translation', 'hindi', 'invites', 'testing', 'team', 'rules', 'inbox', 'chat', 'numbers', 'ai', 'review', 'deletion', 'delivery', 'emails', 'screens', 'flows'];
const SERVER_AREAS = ALL_AREAS.filter((a) => !['screens', 'flows', 'hindi'].includes(a));

/** which files belong to which QA areas: a change there runs the area's other checks too */
export const AREA_PATHS = [
  [/^supabase\/functions\/(whatsapp|_shared\/wa|_shared\/notify|_shared\/push)/, ['whatsapp', 'delivery', 'invites']],
  [/^supabase\/functions\/(intake|connect|sync-sources|public-api|_shared\/(intake-core|connections|providers|review))/, ['inbox', 'team']],
  [/^supabase\/functions\/(muntej-chat|parse-task|_shared\/chat)/, ['chat', 'numbers']],
  [/^supabase\/functions\/(translate|localize|_shared\/(localize|task-text))/, ['translation', 'hindi']],
  [/^supabase\/functions\/(daily-summary|send-followups|team-alerts|autopilot)/, ['server', 'numbers', 'delivery', 'emails']],
  [/^supabase\/functions\/(invite|phone-auth|delete-account)/, ['invites', 'deletion']],
  // the database and the shared basics every function reads: every server area (reviewer, 11 Nov)
  [/^supabase\/(migrations\/|functions\/_shared\/(http|ai-consent|when|invite|invite-send|email|directory|team-reader|phone-session|followup-plan)\.ts)/, SERVER_AREAS],
  [/^scripts\/qa\/seed\.sql$/, ALL_AREAS],
  [/^(src\/lib\/i18n\/|scripts\/i18n\/|src\/features\/.*strings\.ts$)/, ['hindi']],
  [/^(app|src)\//, ['screens', 'flows']],
];

/** the areas a set of changed files selects; anything under supabase/ that no rule explains selects every area */
export function areasFor(files) {
  const out = new Set();
  for (const f of files) {
    let hit = false;
    for (const [re, areas] of AREA_PATHS)
      if (re.test(f)) {
        hit = true;
        for (const a of areas) out.add(a);
      }
    if (!hit && /^supabase\//.test(f)) for (const a of ALL_AREAS) out.add(a);
  }
  return out;
}