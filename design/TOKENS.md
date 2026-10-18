# Design tokens — v2 (light theme)

Source: `design/v2/html/*.dc.html` (37 screens, EN + AR). Code: `src/theme/tokens.ts`.
The previous dark theme (design/screens, design/html) is superseded.

## Colors
| Token | Hex | Use |
|---|---|---|
| bg | #F3F6FB | App background |
| surface | #FFFFFF | Cards, tab bar, sheets |
| surfaceMuted | #F6F8FC | Inset rows inside cards |
| chip / track | #E9EEF6 | Day separators, progress-bar track |
| border | #E6EBF3 | Dividers |
| borderBlue | #D6E2F5 | Outline buttons |
| text | #0B1A33 | Primary text |
| textSoft | #3B475E | Body on cards |
| textMuted | #66728A | Secondary text, labels |
| textFaint | #97A1B5 | Inactive tab icons |
| primary | #1F6FEB | Manager accent, links, CTAs |
| primaryLight / primaryTint | #2E9BF0 / #E8F0FE | Button gradient end / tinted icon bg |
| navy / cyan | #0B2A5B / #2EC4D6 | Hero gradient ends |
| purple / purpleTint | #6D4AFF / #EFEBFF | Employee accent |
| green / greenTint | #16A37A / #E3F7EF | Success, money saved, on track |
| amber / amberText / amberTint | #F59E0B / #E8900C / #FFF4E0 | Decisions, at risk, priority high |
| red / redTint | #E5484D / #FDECEC | Late, urgent |
| orange / orangeText / orangeTint | #F26A1B / #E2580B / #FFF1E8 | Points |

Gradients (150°): manager hero `#0B2A5B → #1F6FEB → #2EC4D6`; employee hero `#3B1E8F → #6D4AFF → #2EC4D6`;
primary button `#1F6FEB → #2E9BF0`; points coin `#FFB547 → #F26A1B`; success `#16A37A → #34D399`.

Shadows: cards `0 4 18 rgba(11,42,91,.07)`, raised `0 8 24 rgba(11,42,91,.10)`, primary button `0 8 20 rgba(31,111,235,.30)`.

## Type
- English body & numbers: Karla (400–800). English headings: Playfair Display 600.
- Arabic: Tajawal (400/500/700/800) for body and headings.
- Sizes: hero number 60/800, screen title 26 display, section 17 display, card title 15/700, stat 18/800, body 14, caption 12, micro 11.

## Shape & spacing
- Screen padding 22; hero bottom radius 28; cards 20–22; stat tiles 16; buttons pill (999) height 52; tab bar 84 with 24 top radius.
- Manager tabs: Home · Autopilot · (centre mic 64) · Decisions · Brief. Employee tabs: Home · My tasks · Rewards · Badges.
- Icons: 1.8–2.2 stroke line icons (lucide-react-native), often inside a 26–44 rounded tinted square.
