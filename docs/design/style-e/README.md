# Style E on the phone

The owner's pick (rule 18 in `../feedback-rules.md`): black and white rows, like GitHub and Linear on a phone.
`E.html` and the `E-*.png` pictures are the reference. This page says how to build a screen with it.

Reference screens built this way: the node screen (`mobile/src/parts/NodeSheet.tsx`) and Clusters
(`mobile/src/screens/Clusters.tsx`, `mobile/src/parts/ClusterCard.tsx`).

## The look

- A plain background (white, or #0b0b0b on dark). No cards with shadows, no tinted boxes.
- Rows edge to edge, 56 px tall, a hairline under each. Label on the left, value on the right.
- Greys for everything that isn't the main action. The accent is black on light and white on dark, used only for
  the main button and the current choice (a chosen segment, a switch that is on).
- Red only for errors and destructive buttons.
- Icons grey (`text-dim`), never colored. The AI products' own logos are the one exception (rule 12).
- Text wraps; nothing is cut off at 360 wide.

## Tokens

`mobile/src/index.css` redefines the shared color tokens for the phone only (the desktop keeps its look). Use the
token names, never hex values: `bg-window`, `text-text`, `text-dim`, `border-line`, `border-line-strong`, `bg-soft`
(the grey of an open row), `bg-pressed` (pressed), `bg-accent` with `text-on-accent`, `text-bad` and `bg-bad-fill`.
`ok` and `warn` are grey now, so old status colors turn neutral by themselves.

## Pieces (`mobile/src/ui.tsx`)

| Piece | What it is |
|---|---|
| `Sheet` | A full screen: X, title, content, actions at the bottom. `flush` for screens made of rows. |
| `List`, `Section` | Rows with a hairline on top; `Section` adds a small grey title and a note. |
| `Row` | `label`, `sub`, `value`, `icon`, `onPress`. `opens` adds a chevron: only when it opens another screen. |
| `NumberRow` | A number row. Tap it and it opens in place as a big input with its limit. Any whole number can be typed (`inputMode="numeric"`); out of range the limit turns red. Disable the main button with `inRange`. |
| `DurationRow` | Time typed as days, hours and minutes, with the longest allowed. |
| `ToggleRow` | A label and a switch as a row. `Switch` is the same inside padded content. |
| `Segmented` (`Segments`) | A few choices side by side; the chosen one is solid. `value=''` when none is. |
| `MainButton` | The screen's one main action, full width, solid. |
| `Button` | `primary` (one per screen), `plain` (outlined), `danger` (solid red), `quiet` (text only). |
| `ActionSheet` | What ⋮ offers: rows. The dimmed part and Back close it; no Cancel button. |
| `ConfirmSheet` | `keep` and `confirm` say what they do ("Keep it" / "Release node"). `danger` is solid red. `keep` is required. |
| `PickerSheet` | Pick one of many; a check on the current one. |
| `Chips` | Filters, outlined; on is solid. 48 px tall to tap. |
| `StatusDot` | `on` solid, `busy` breathing, `off` hollow, `error` red. Put the word next to it. |
| `EmptyState` | A grey icon, what is missing, what to do. |
| `Field`, `TextArea`, `SearchField` | Outlined fields; the search field is a grey well. |
| `Amount` | A number with its unit smaller and grey: 8 GB. |

The tab bar (`mobile/src/App.tsx`) keeps Material 3's sizes in black and white; `parts/Header.tsx` is the title.

## Building a screen

1. Rows, not cards: `List` or `Section` of `Row`s. A row that opens a screen gets `opens`; a number gets
   `NumberRow` (never a stepper on its own, rule 16); a setting gets `ToggleRow`.
2. One `MainButton` per screen, in `Sheet` actions or at the bottom. Everything else is `plain` or a row.
3. A destructive step goes through `ConfirmSheet` with its own `keep` words.
4. Limits come from the cluster (`clusters.partitions` gives `longest`, `cores` and `memory_gb` for the queue);
   never hard-code them.
5. Check the screen against all rules in `../feedback-rules.md` at 360 and 390 wide, light and dark.
