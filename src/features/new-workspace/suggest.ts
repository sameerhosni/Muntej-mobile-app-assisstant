// Screen 20: local "AI" suggestions from one sentence — keyword match against roles, profile skills/titles,
// past done tasks and current load. No model call yet (will move to an Edge Function).
import { ACTIVE_STATUSES, type Profile, type TaskWithPeople } from '@/lib/api';

export type RoleKey = 'design' | 'mobile' | 'marketing' | 'sales' | 'finance' | 'product';

const ROLES: Record<RoleKey, { words: string[]; skills: string[] }> = {
  design: { words: ['design', 'ux', 'ui ', 'brand', 'مصمم', 'تصميم', 'هوية'], skills: ['design', 'ux', 'arabic-typography'] },
  mobile: {
    words: ['mobile', 'dev', 'engineer', 'flutter', 'backend', 'api', 'integrat', 'جوال', 'مطور', 'مطوّر', 'برمج', 'تكامل'],
    skills: ['mobile', 'backend', 'integrations'],
  },
  marketing: { words: ['market', 'campaign', 'launch', 'content', 'event', 'تسويق', 'حملة', 'إطلاق', 'نطلق', 'محتوى'], skills: ['marketing', 'content', 'events'] },
  sales: { words: ['sales', 'client', 'account', 'customer', 'deal', 'مبيعات', 'عميل', 'عملاء', 'حساب'], skills: ['sales', 'clients', 'presentations'] },
  finance: { words: ['financ', 'budget', 'cost', 'invoice', 'payroll', 'مالي', 'ميزاني', 'تكلف', 'فاتور', 'رواتب'], skills: ['finance', 'excel', 'reporting'] },
  product: { words: ['product', 'research', 'roadmap', 'feature', 'بحث', 'خارطة', 'ميزة'], skills: ['product', 'research', 'roadmaps'] },
};

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

const STOP = new Set([
  'app', 'application', 'project', 'the', 'a', 'an', 'new', 'for', 'our', 'we', 'need', 'build', 'platform', 'system',
  'تطبيق', 'مشروع', 'نظام', 'منصة', 'جديد', 'جديدة', 'نبي', 'نبغى', 'ابي', 'أبي', 'لـ', 'ل',
]);

export function detectRoles(sentence: string): RoleKey[] {
  const s = ` ${sentence.toLowerCase()} `;
  return ROLE_KEYS.filter((k) => ROLES[k].words.some((w) => s.includes(w)));
}

/** Short name from the first clause, minus filler words ("Loyalty app." → "Loyalty"). */
export function suggestName(sentence: string): string {
  const clause = sentence.replace(/[«»“”"']/g, '').split(/[.,،!?؟\n]/)[0] ?? '';
  const words = clause.trim().split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  const name = words.slice(0, 2).join(' ');
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

/** "in 2 months" / "بعد شهرين" / "3 weeks" → deadline date; null if none. */
export function suggestDeadline(sentence: string, now = new Date()): Date | null {
  const s = sentence.toLowerCase();
  const d = new Date(now);
  const num = (re: RegExp) => {
    const m = re.exec(s);
    return m ? parseInt(m[1], 10) : null;
  };
  const months = num(/(\d+)\s*(month|months|شهر|شهور|أشهر)/) ?? (/شهرين/.test(s) ? 2 : /\bmonth\b|شهر/.test(s) ? 1 : null);
  if (months !== null) {
    d.setMonth(d.getMonth() + months);
    return d;
  }
  const weeks = num(/(\d+)\s*(week|weeks|أسبوع|أسابيع)/) ?? (/أسبوعين/.test(s) ? 2 : null);
  if (weeks !== null) {
    d.setDate(d.getDate() + weeks * 7);
    return d;
  }
  return null;
}

export type Candidate = {
  person: Profile;
  role: RoleKey | null;
  match: number;
  skills: string[];
  doneCount: number;
  activeCount: number;
  loadPct: number;
  freeHours: number;
};

const DEFAULT_TASK_HOURS = 4;
const MAX_SHOWN = 4;

export function suggestTeam(sentence: string, team: Profile[], tasks: TaskWithPeople[], meId: string | undefined): Candidate[] {
  const roles = detectRoles(sentence);
  const people = team.filter((p) => p.id !== meId && p.role === 'employee');
  const all = people.map((person): Candidate => {
    const mine = tasks.filter((t) => t.owner_id === person.id);
    const active = mine.filter((t) => ACTIVE_STATUSES.includes(t.status));
    const doneCount = mine.filter((t) => t.status === 'done').length;
    const hours = active.reduce((h, t) => h + (t.estimate_hours ?? DEFAULT_TASK_HOURS), 0);
    const cap = Math.max(1, person.weekly_capacity_hours);
    const loadPct = Math.round((hours / cap) * 100);
    const title = `${person.title ?? ''} ${person.title_ar ?? ''}`.toLowerCase();

    let best: { role: RoleKey | null; hit: string[]; score: number } = { role: null, hit: [], score: 0 };
    for (const r of roles) {
      const hit = person.skills.filter((sk) => ROLES[r].skills.includes(sk.toLowerCase()));
      const titleHit = ROLES[r].words.some((w) => w.trim().length > 2 && title.includes(w.trim()));
      const score = hit.length * 9 + (titleHit ? 8 : 0);
      if (score > best.score) best = { role: r, hit, score };
    }
    const loadPenalty = Math.max(0, loadPct - 70) * 0.4;
    const base = best.score > 0 ? 58 + best.score : 40;
    const match = Math.round(Math.max(20, Math.min(98, base + Math.min(doneCount, 4) * 2 - loadPenalty)));
    return {
      person,
      role: best.role,
      match,
      skills: best.hit.length ? best.hit : person.skills.slice(0, 2),
      doneCount,
      activeCount: active.length,
      loadPct,
      freeHours: Math.max(0, Math.round(cap - hours)),
    };
  });

  // one best person per detected role first, then everyone else by match
  const picked: Candidate[] = [];
  for (const r of roles) {
    const top = all.filter((c) => c.role === r && !picked.includes(c)).sort((a, b) => b.match - a.match)[0];
    if (top) picked.push(top);
  }
  const rest = all.filter((c) => !picked.includes(c)).sort((a, b) => b.match - a.match);
  return [...picked.sort((a, b) => b.match - a.match), ...rest].slice(0, Math.max(MAX_SHOWN, picked.length));
}

/** Pre-selected: matched to a role and good enough. */
export function preselect(c: Candidate) {
  return c.role !== null && c.match >= 75;
}
