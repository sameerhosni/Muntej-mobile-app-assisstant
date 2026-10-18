// Suggested how-to questions for Screen 36 and a local matcher for free-text questions (no AI call yet).
import type { ComponentType } from 'react';
import type { Href } from 'expo-router';
import { Coins, Mic, Moon, UserPlus, CircleCheck, Users, type LucideProps } from 'lucide-react-native';
import type { ColorToken } from '@/theme/tokens';

export type QuestionId = 'task' | 'points' | 'quiet' | 'team' | 'decide' | 'joined';

export type HowToQuestion = {
  id: QuestionId;
  Icon: ComponentType<LucideProps>;
  tint: ColorToken;
  ink: ColorToken;
  /** Real route "Show me" opens. */
  href: Href;
  /** Lower-cased match words, EN + AR (Arabic already normalized, see normalize()). */
  keywords: string[];
};

export const QUESTIONS: HowToQuestion[] = [
  {
    id: 'task',
    Icon: Mic,
    tint: 'primaryTint',
    ink: 'primary',
    href: { pathname: '/02-capture', params: { mode: 'text' } },
    keywords: ['task', 'assign', 'give', 'delegate', 'create', 'new task', 'مهمه', 'مهام', 'اعطي', 'اكلف', 'اسند', 'توزيع'],
  },
  {
    id: 'points',
    Icon: Coins,
    tint: 'orangeTint',
    ink: 'orange',
    href: '/27-points-control',
    keywords: ['point', 'points', 'reward', 'rewards', 'budget', 'نقاط', 'النقاط', 'مكافا', 'مكافاه', 'ميزانيه'],
  },
  {
    id: 'quiet',
    Icon: Moon,
    tint: 'purpleTint',
    ink: 'purple',
    href: '/18-alerts',
    keywords: ['quiet', 'after hours', 'after-hours', 'night', 'prayer', 'notification', 'alerts', 'stop', 'messages', 'هدوء', 'الدوام', 'بالليل', 'صلاه', 'تنبيهات', 'اوقف', 'رسائل', 'اشعارات'],
  },
  {
    id: 'team',
    Icon: UserPlus,
    tint: 'greenTint',
    ink: 'green',
    href: '/37-grow',
    keywords: ['another team', 'new team', 'add team', 'second team', 'grow', 'فريق ثاني', 'فريق جديد', 'اضيف فريق', 'توسع'],
  },
  {
    id: 'decide',
    Icon: CircleCheck,
    tint: 'amberTint',
    ink: 'amberText',
    href: '/04-decisions',
    keywords: ['approve', 'approval', 'decision', 'decisions', 'waiting', 'pending', 'اوافق', 'موافقه', 'قرار', 'القرارات', 'ينتظرني', 'طلبات'],
  },
  {
    id: 'joined',
    Icon: Users,
    tint: 'primaryTint',
    ink: 'primary',
    href: '/31-team-launch',
    keywords: ['joined', 'join', 'invite', 'invited', 'who', 'launch', 'انضم', 'انضمام', 'دعوه', 'الدعوات', 'مين'],
  },
];

/** How many show in the "Top questions" list (the design shows four). */
export const TOP_COUNT = 4;

/** Lower-case and fold Arabic letter variants / diacritics so matching is forgiving. */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[؟?!.,،]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best local match for a typed question: keyword hits (multi-word phrases count double),
 * plus exact match on any suggested question's text. Returns null when nothing fits.
 */
export function matchQuestion(input: string, texts: Record<QuestionId, string[]>): QuestionId | null {
  const q = normalize(input);
  if (!q) return null;
  let best: QuestionId | null = null;
  let bestScore = 0;
  for (const item of QUESTIONS) {
    let score = texts[item.id].some((txt) => normalize(txt) === q) ? 100 : 0;
    for (const k of item.keywords) {
      if (q.includes(normalize(k))) score += k.includes(' ') ? 2 : 1;
    }
    if (score > bestScore) {
      best = item.id;
      bestScore = score;
    }
  }
  return best;
}
