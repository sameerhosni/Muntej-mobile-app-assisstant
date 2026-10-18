# How to build a Muntej screen (v2)

Reference implementation: `app/(tabs)/03-autopilot.tsx` + `src/features/autopilot/strings.ts`.

## Source of truth
- Design: `design/v2/html/<Design>.dc.html` (English) and `<Design>AR.dc.html` (Arabic). Read BOTH.
  The route ↔ design-file map is `src/features/screens/registry.ts` (`design` field).
- The `<script data-dc-script>` block at the end of each design shows the screen's interactions and demo values.
- Prototype tip for the screen: `src/features/prototype/strings.ts` keys `tNN` — the screen must make that tip work.
- Tokens: `src/theme/tokens.ts` (colors, gradients, shadows, radius, spacing). Never hard-code a color.

## Files you own (do NOT edit shared files)
- `app/NN-name.tsx` (or `app/(tabs)/NN-name.tsx` for tab screens) — replace the placeholder. Keep the header comment:
  `// Screen NN · Name — see design/v2/html/<Design>.dc.html (Arabic: <Design>AR.dc.html)`
- `src/features/<feature>/strings.ts` — `export const NS = registerStrings('sNN', { en, ar })`. `ar` is typed `typeof en`.
  Saudi conversational Arabic, like the AR design file.
- `src/features/<feature>/demo.ts` — demo data when no backend exists yet (people from `src/features/demo/team.ts`).
- `src/features/<feature>/*.tsx|ts` — local components and hooks.
- Do NOT edit: `src/lib/i18n/en.ts|ar.ts`, `src/lib/api/*`, `src/components/ui/*`, `src/theme/*`, the registry,
  `src/features/prototype/*`, `app/_layout.tsx`, other screens. Need something shared? Build it locally in your feature folder.

## Data
- Live data where the table exists (`src/lib/api` hooks: useTasks, useTask, useDecisions, useActivity, useTeam,
  useMyProfile, useHomeStats; tables in `src/lib/api/database.types.ts`). Writes: call `supabase` from a local hook in
  your feature folder with TanStack `useMutation`, then `queryClient.invalidateQueries`. RLS already scopes rows.
- Otherwise demo data (points, rewards, badges, quests, invites, receipts…). Keep it realistic and consistent with the
  seed team (Ahmed manager; Faisal, Abdullah, Noura, Khalid, Saad, Maha). Interactions update local state (useState).

## UI kit (`@/components/ui`)
AppText (variant: micro, caption, small, body, cardTitle, lead, section, stat, title, titleLg, big, hero; `display`
for Playfair/Tajawal headings; `color` = token), Card (tone, elevation, padding, onPress), Button (primary gradient
pill / outline / ghost; tone blue|purple|amber), Chip (static or selectable), Toggle, Avatar (gradient), ProgressBar,
StatTile (card|glass), SectionTitle, BottomCTA (+ BOTTOM_CTA_SPACE), TextField, Gradient, IconBadge, Hero
(manager|employee, `overlap`), IconButton (white|glass), PointsCoin, PointsPill. Icons: `lucide-react-native`.

## Layout rules
- Screens with a gradient header use `<Hero>`; others use a white `IconButton` back/close + `AppText variant="titleLg"`.
- Non-tab screens need a back button: `router.canGoBack() ? router.back() : router.replace('/')`.
- RTL: use `start`/`end`, `paddingStart/End`, `marginStart/End`; flip chevrons/arrows with
  `transform: [{ scaleX: isRTL ? -1 : 1 }]` (`useDirection()` from `@/lib/i18n`). Numbers via `formatNumber`
  (`@/features/home/value`). No hard-coded strings — every visible string goes through your `strings.ts`.
- Touch targets ≥ 44px. Accessibility labels on icon-only buttons. ScrollView for content; tab screens get the tab bar
  automatically (leave ~32px bottom padding); non-tab screens with a sticky action use `BottomCTA`.
- No status-bar mockups, no fake device chrome from the HTML.

## Done =
`npx tsc --noEmit` shows no errors in your files; the screen matches the EN and AR designs; the prototype tip works.
