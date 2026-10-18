// Workspace colors: the DB stores a hex per workspace; the app only renders token colors,
// so each stored hex is mapped to the nearest token family (blue / green / purple / orange).
import { gradients, type ColorToken, type GradientToken } from '@/theme/tokens';

export type WsTone = { gradient: GradientToken; solid: ColorToken; tint: ColorToken; hue: number };

export const WS_TONES: WsTone[] = [
  { gradient: 'avatarBlue', solid: 'primary', tint: 'primaryTint', hue: 210 },
  { gradient: 'avatarGreen', solid: 'green', tint: 'greenTint', hue: 160 },
  { gradient: 'avatarPurple', solid: 'purple', tint: 'purpleTint', hue: 260 },
  { gradient: 'avatarOrange', solid: 'orange', tint: 'orangeTint', hue: 25 },
];

function hexHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Token family for a workspace color; falls back to a stable rotation by index. */
export function wsTone(color: string | null | undefined, index = 0): WsTone {
  const h = color ? hexHue(color) : null;
  if (h === null) return WS_TONES[index % WS_TONES.length];
  return WS_TONES.reduce((best, t) => (hueDist(t.hue, h) < hueDist(best.hue, h) ? t : best), WS_TONES[0]);
}

/** Hex to store for a new workspace: the first token family not used yet. */
export function nextWorkspaceColor(existing: (string | null)[]): string {
  const used = new Set(existing.map((c, i) => wsTone(c, i).gradient));
  const tone = WS_TONES.find((t) => !used.has(t.gradient)) ?? WS_TONES[existing.length % WS_TONES.length];
  return gradients[tone.gradient][0];
}
