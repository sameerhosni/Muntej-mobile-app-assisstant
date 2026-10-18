// Demo promises caught in a meeting (Promise Catcher, screen 07). Text lives in strings.ts under `promises.<id>`.
//
// TODO(promise-catcher → tasks): "Confirm" / "Confirm all" only flip local state today.
// Wire each confirmed promise to `createTask` from '@/features/capture/api':
//   - build a ParsedTask per promise: title = task text, owner_id = the speaker's profile id (useTeam(), match by
//     name; "You" = useMyProfile()), due_at = resolved due date, transcript = the quote, language = current lang,
//     priority 'medium', missing = [], followup_plan from the parse-task function (or call parseTask(quote) first);
//   - call createTask(parsed, ...) — the RPC's `source` should become 'meeting' (task_source enum already has it;
//     createTask's signature currently only accepts 'voice' | 'text', so that needs a shared change);
//   - make sure the RPC writes an activity_log row ("Created task from meeting promise", undoable);
//   - invalidate the tasks / homeStats queries, and disable the buttons while saving.
// The promise list itself should come from the meeting-extraction Edge Function (Note Taker → "Stop & extract tasks").
import type { GradientToken } from '@/theme/tokens';

export type PromiseId = 'a' | 'b' | 'c' | 'd';

export type DemoPromise = {
  id: PromiseId;
  /** Person id from src/features/demo/team.ts; 'me' = the signed-in manager. */
  personId: string;
  gradient: GradientToken;
  /** Timestamp in the meeting recording (mm:ss). */
  time: string;
};

export const MEETING_MINUTES = 42;

export const DEMO_PROMISES: DemoPromise[] = [
  { id: 'a', personId: 'faisal', gradient: 'avatarBlue', time: '12:04' },
  { id: 'b', personId: 'abdullah', gradient: 'avatarPurple', time: '18:41' },
  { id: 'c', personId: 'noura', gradient: 'avatarOrange', time: '27:10' },
  { id: 'd', personId: 'me', gradient: 'heroManager', time: '39:55' },
];

/** Demo value figures from the design. */
export const DEMO_VALUE = { forgotten: 0, notesMinutes: 40, sar: 133 };
