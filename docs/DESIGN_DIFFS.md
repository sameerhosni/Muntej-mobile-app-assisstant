# Design vs app differences (v2, Arabic, 390×844)

Compared each `design/v2/html/<Name>AR.dc.html` (served by `node scripts/serve-design.js`) with the app screen.

## 01 Home (Main)
- Missing "Team energy this week" card (حماس الفريق هالأسبوع): points 2,340 ▲18%, "pts earned · 3 on a streak",
  avatars Khalid+Saad "did great", Recognize button → /28-kudos, "Points settings" link → /27-points-control. Demo values.
- When no decisions are pending, the hero overlap leaves "Ask Muntej" title overlapping the gradient. The design always
  has a card overlapping the hero edge: keep the decisions card position; if 0 pending, the energy card should take that slot
  (or remove the overlap).

## 02 Capture
- Very close. Missing: recording duration chip in the transcript card (e.g. "0:09", keep the real duration for voice),
  6th "understood" cell with the points reward (+65 pts · "+20 if early", demo rule: 50 on time + 15 proof), check icon in
  the "Done, forget it" button, auto-plan step labels are long AI sentences — design shows 1–3 word labels
  (parse-task should return a short `label` per step; until then truncate to 2 lines).

## 03 Autopilot
- Entries must be compact like the design: title max 2 lines (numberOfLines 2), ONE chip under it.
- Remove the `reason` line (it shows English "From: '…'" text even in Arabic).
- "Auto · your rules" chip only for actor_type === 'muntej' (not for user-created tasks).
- For update_received entries with a % in the summary, show the design's thin progress bar + "70%" instead of a chip.

## 04 Decisions — matches (sample mode checked).

## 05 Brief
- Audio player card: add the waveform bars between play button and title (design), not only a progress line.
- Team pulse bars: gradient per level like the design (≥85% blue, 70–84% purple, <70% orange), value % on the left end.
- Stat tile "hours" value is truncated ("0.3 …"): keep the unit out of the value or allow 2 lines/shrink.

## 06 Employee chat — matches.
## 07 Promise Catcher — matches.

## 08 Pushback
- Hero title "مهمة جديدة" wraps to 2 lines and is oversized: design is one line (titleLg 26), subtitle under it.
- Stat value truncated ("0 ي"). (Global StatTile fix: never ellipsize values.)

## 09 Reverse follow-up — matches. Minor: "Nudge" button is a compact pill at start in the design, not full width.
## 10 Evidence — matches.
## 11 Load Radar — matches structure. Minor: send button has a paper-plane icon in the design.
## 12 Sources — matches structure.
## 13 Note Taker — matches. (Fixed: svg a11y props warning.)
## 14 Task detail — matches. Minor: send icon in "Submit for review".
## 15 Review — matches.
## 16 Dashboard — matches structure.
## 17 Summaries — matches; stat value "2 سا…" and grid label "النقاط والأوس…" truncated (allow 2 lines).
## 18 Alerts — matches.
## 19 Workspaces — matches. Minor: "+" icon on New workspace and refresh icon on Agents buttons.
## 20 New workspace
- Skill tags show raw English slugs in Arabic ("design, ux, arabic-typography"). Map skill slugs → localized labels
  (EN + AR) in the feature folder; show max 3.

## 21 Achievements
- Missing timeline legend under the slider (● منتج AI · ● نظامي · ● وجود — dot colours per source).
- Missing icons: share icon on "شارك", sparkle icon on "تقرير للإدارة".
- Header count has a delta chip under it in the design (e.g. "+3 هالأسبوع").
## 22 Agents — matches (live: empty state + templates).
## 23 New agent — matches.
## 24 Roadmap
- RTL bug: Gantt bars are positioned from the left; in Arabic the time axis runs right→left so bars land on the wrong
  side (15–31 Oct bar sits at the far left next to "13 Dec"). Position bars from the start edge (right in RTL).
- Bar date labels overlap each other on short bars: start date above the bar, end date below it (design).
## 25 Employee home — matches.
## 26 Rewards — back button uses an arrow (design: chevron in glass circle, like other screens) — fixed.
  Cost chip truncates ("2,500 نـ…", "1,500 ر…"): don't truncate; wrap the SAR chip to the next line.
## 27 Points control — matches. Minor: design rule rows show a +/- stepper on the points chip.
## 28 Kudos — matches (StatTile value truncation — global fix).
## 29 Badges — back button arrow → chevron — fixed.
## 30 Team quests — matches (Me tab holds the weekly-performance cards). Back arrow → chevron — fixed.
## 31 Team launch — matches (StatTile label truncation — global fix).
## 32 Receipt — matches.
## 33 Setup quest — matches.
## 34 Add team — matches.
## 35 First run — matches.
## 36 How-to — matches.
## 37 Grow — matches. Back arrow → chevron — fixed.

## Global
- StatTile values never ellipsize: size steps down for long values (fixed in `src/components/ui/StatTile.tsx`).
