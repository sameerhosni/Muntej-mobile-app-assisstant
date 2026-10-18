// Sample timeline from design/v2/html/Timeline.dc.html — used only when the user can see no achievements at all.
// People follow the seed team (the design's "Shahad" is Abdullah here).
import { WS_TONES, type WsTone } from '@/features/workspaces/color';

export const DEMO_WS: Record<'m' | 'n' | 'w', WsTone> = { m: WS_TONES[0], n: WS_TONES[1], w: WS_TONES[2] };
export const DEMO_PEOPLE = ['faisal', 'saad', 'noura', 'khalid', 'maha', 'abdullah'] as const;

type DemoPoint = {
  id: string;
  ws: keyof typeof DEMO_WS;
  pos: number;
  title: string;
  person: (typeof DEMO_PEOPLE)[number];
  month: number;
  day: number;
  proofs: number;
  rating: number | null;
};

export const DEMO: Record<'w' | 'm' | 'q', { count: number; delta: number; pts: DemoPoint[] }> = {
  w: {
    count: 9,
    delta: 2,
    pts: [
      { id: 'a', ws: 'm', pos: 50, title: 'pitched', person: 'faisal', month: 9, day: 15, proofs: 3, rating: 5 },
      { id: 'c', ws: 'm', pos: 92, title: 'notetakerBeta', person: 'saad', month: 9, day: 18, proofs: 5, rating: 5 },
      { id: 'b', ws: 'n', pos: 30, title: 'annualPlan', person: 'maha', month: 9, day: 14, proofs: 2, rating: 4 },
      { id: 'd', ws: 'w', pos: 10, title: 'marketSizing', person: 'abdullah', month: 9, day: 12, proofs: 4, rating: 4 },
      { id: 'e', ws: 'n', pos: 70, title: 'bugsFixed', person: 'khalid', month: 9, day: 16, proofs: 3, rating: 4 },
    ],
  },
  m: {
    count: 47,
    delta: 18,
    pts: [
      { id: 'a', ws: 'm', pos: 20, title: 'splPilot', person: 'faisal', month: 9, day: 7, proofs: 2, rating: 4 },
      { id: 'b', ws: 'm', pos: 48, title: 'newDirection', person: 'faisal', month: 9, day: 15, proofs: 3, rating: 5 },
      { id: 'c', ws: 'm', pos: 90, title: 'notetakerBeta', person: 'saad', month: 9, day: 18, proofs: 5, rating: 5 },
      { id: 'h', ws: 'm', pos: 70, title: 'agentsDesigned', person: 'noura', month: 9, day: 14, proofs: 4, rating: 4 },
      { id: 'd', ws: 'n', pos: 32, title: 'fingerprint', person: 'khalid', month: 9, day: 10, proofs: 6, rating: 5 },
      { id: 'e', ws: 'n', pos: 62, title: 'annualPlan', person: 'maha', month: 9, day: 16, proofs: 2, rating: 4 },
      { id: 'f', ws: 'w', pos: 8, title: 'landingPage', person: 'noura', month: 9, day: 3, proofs: 3, rating: 4 },
      { id: 'g', ws: 'w', pos: 42, title: 'marketSizing', person: 'abdullah', month: 9, day: 13, proofs: 4, rating: 4 },
    ],
  },
  q: {
    count: 128,
    delta: 31,
    pts: [
      { id: 'a', ws: 'm', pos: 8, title: 'mvp5', person: 'saad', month: 7, day: 12, proofs: 7, rating: 5 },
      { id: 'b', ws: 'm', pos: 40, title: 'pilot5', person: 'faisal', month: 8, day: 9, proofs: 4, rating: 4 },
      { id: 'c', ws: 'm', pos: 72, title: 'splPilot', person: 'faisal', month: 9, day: 7, proofs: 2, rating: 4 },
      { id: 'd', ws: 'm', pos: 94, title: 'notetakerLaunched', person: 'saad', month: 9, day: 18, proofs: 5, rating: 5 },
      { id: 'e', ws: 'n', pos: 18, title: 'brand', person: 'noura', month: 7, day: 20, proofs: 3, rating: 4 },
      { id: 'f', ws: 'n', pos: 58, title: 'fingerprint', person: 'khalid', month: 9, day: 10, proofs: 6, rating: 5 },
      { id: 'g', ws: 'n', pos: 86, title: 'annualPlan', person: 'maha', month: 9, day: 16, proofs: 2, rating: 4 },
      { id: 'h', ws: 'w', pos: 30, title: 'wojoodKickoff', person: 'abdullah', month: 8, day: 1, proofs: 1, rating: null },
      { id: 'i', ws: 'w', pos: 78, title: 'marketSizing', person: 'abdullah', month: 9, day: 13, proofs: 4, rating: 4 },
    ],
  },
};
