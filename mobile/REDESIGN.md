# Phone redesign: how to build a page

The accepted design is `~/Desktop/Projects/hpc-hub-review/android/index.html`, one `data-page` per page (search it,
it is 3.4 MB). Each page has the phone design, the desktop screenshot and a "Not on the phone, or different" list.
The phone is the desktop on a narrow screen: same tokens, words, icons and order. Only what that list says differs.

The frame is done (drawer, header, tabs, dialogs, tokens, experimental switches). A page agent changes only its own
page and, when needed, the pieces below. Old pages may still use the old pieces (end of this file) until redone.

## Who owns what

| File | Owns |
| --- | --- |
| `src/App.tsx` | Which component each page shows, the Terminals page that always stays mounted, Settings over the page |
| `src/nav.tsx` | Where you are (`Place`), `go()` mapping desktop page names (`placeOf`), Back (`useBackLayer`) |
| `src/parts/Drawer.tsx` | The sidebar drawer, built from the desktop's `components/app/pages.ts` |
| `src/parts/Header.tsx` | The header bar of a page, the sidebar button or back arrow |
| `src/parts/experiments.ts` | `useExperiments()`: which experimental parts are on |
| `src/ui.tsx` | The pieces every page uses (below) |
| `src/screens/*.tsx` | One page each |
| `src/parts/<page>/` | That page's own pieces |
| `src/index.css` | Only phone-wide rules. Colors and type scale come from the desktop's `app/src/index.css` |

## A page

```tsx
export function Jobs() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Jobs" chip={<ClusterPicker />} />
      <Tabs label="Jobs" current={tab} onPick={setTab} tabs={[{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]} />
      <PageBar><span className="flex-1" /><Button kind="primary">Do it</Button></PageBar>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">content</div>
    </div>
  )
}
```

- **Header** (`parts/Header.tsx`): title centred, 48 px, the sidebar button on the left. Pass `chip` on pages that
  show one cluster at a time, as the desktop does (`app/src/App.tsx` `picksCluster`): Jobs, Usage, Files (Browse only)
  and Agents (every tab except Running). The chip is the desktop's `ClusterPicker` from
  `@shared/components/clusters/ClusterPicker`. Do not add actions to the header in a redone page: `children` is only
  for old pages. Actions go in `PageBar` or in the page.
- **Tabs** (`ui.tsx`): under the header, the desktop's `go(page, { tab })` param picks the tab (Files does this in
  `screens/Files.tsx`). They scroll sideways on their own.
- **Layout:** the shell already pays for the status bar and gesture bar (`--top`, `--bottom`). Your page is
  `h-full flex-col`; the scrolling part is `min-h-0 flex-1 overflow-y-auto`.
- Row and section padding is the desktop's: `Row`, `Section`, `List` as they are. For content inside a section use
  `px-5` (the rows' own side padding).

## Pieces (import from `src/ui.tsx`)

The left column re-exports the desktop's `components/e`, so it looks the same on both.

| Piece | For |
| --- | --- |
| `Button`, `MainButton` | `EButton`, `MainButton`: `kind`, `icon`, `small` |
| `Row`, `Section`, `List`, `ItemRow`, `ToggleRow`, `Segments`, `Field`, `TextArea`, `SearchField`, `NumberRow`, `DurationRow`, `Amount`, `StatusDot`, `EmptyState` | as on the desktop (`StatusDot` tones: `on` black, `connected` green, `busy`, `off`, `error`) |
| `Tabs`, `PageBar`, `IconBtn`, `SelectButton`, `Menu` | The design's tab row, page action row (`.epa`), 40 px icon button, select look (open a `PickDialog`), ⋮ menu (`groups` as on the desktop) |
| `Dialog`, `ConfirmDialog`, `PickDialog`, `BackLayer` | Desktop windows, centred. They close with Android's Back. `Dialog` content has no padding: rows go straight in, text in a `px-5` div. Put a desktop window that doesn't know about Back in `<BackLayer onBack=...>` |
| `useToast` | The desktop's toast, kept above the gesture bar |

Reuse a desktop component from `@shared/components/...` whenever one fits; a phone copy is the last choice.
`mobile/src/index.css` lists the desktop folders Tailwind scans (`@source`); a desktop file outside them needs a line
there or its classes come out empty.

`ClusterPicker`'s list does not answer Back (it is the desktop's). Everything else open does.

## Going places and Back

`go('jobs', { cluster })` from `@shared/nav`, as on the desktop. Older names still work (`transfers` opens Files on
that tab, `backup` opens Agents on its Backup tab). `usePhoneNav()` also gives `place` and `open(page)`; the drawer and
Settings open through it too.

Back order: whatever is open closes first (`Dialog`, `Menu`, drawer, and the old sheets), then any other page goes to
Clusters, then the app leaves. Anything new that opens over a page and is not
already one of these: call `useBackLayer(onClose, isOpen)` from `nav.tsx`. Terminals never unmounts; its Back goes to
Clusters.

## A new page or a new tab

- A tab of an existing page: a `params.tab` value, a line in `Tabs`, render by `params.tab`. If a desktop page name
  should open it, add it to `placeOf` in `nav.tsx`.
- A new page in the drawer: add it to `PhonePage` and `placeOf` in `nav.tsx` and to `PAGES` in `App.tsx`. The drawer
  shows what the desktop's `components/app/pages.ts` lists, so a page missing from the desktop needs a line there too
  (that file is the desktop's: keep it small).

## Experimental parts

`useExperiments()` from `parts/experiments.ts` gives `{ papers, skills, schedules, read }`, off until the backend
answers (backend switches `experimental_papers`, `_skills`, `_schedules`, `core/app_settings.py`). The drawer and
Agents already hide what is off; a page that shows part of an experimental feature checks the same flag. They stay
off by default. In demo mode turn them on with `?experimental=papers,skills,schedules`. Settings writes the three
switches through `preferences.set` and hands the answer to `setExperiments`.

## Trying it

`npm run dev` in `mobile/` shows the demo in a browser with the desktop's made-up data (`?theme=light|dark`).
`?page=jobs`, `?page=agents&tab=skills` or `?page=settings` open that place, plus `?experimental=` above. The older
`?tab=jobs` still works. Check at 390x844 with touch, in light and dark, and compare with the design's phone
screenshot beside it. Use made-up data only (`jdoe`, `mygroup`, `abc123`).

Copy: the design's and the desktop's words, no em or en dashes. Do not paste chat wording into the app.

## Old pieces, until the page that uses them is redone

- `Header` with `children` (actions on the right): move them into `PageBar` or the page.
- `Sheet` (full screen), `BottomSheet`, `ActionSheet`, `PromptSheet`, `ListRow`, `Card`, `Switch`, `Chips`: replace
  with `Dialog`, `PickDialog`, `Menu` and `Row`s as the design shows. `ConfirmSheet` and `PickerSheet` already are
  `ConfirmDialog` and `PickDialog`. `ActionSheet` may stay for a long press if the design has no menu there.
- `Segments` used as a cluster picker: the design has the header chip instead.
