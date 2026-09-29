# Generic Plate Presentation — Plan

**Document type:** Implementation plan
**Status:** Proposed — not built
**Revision:** Rewritten against the existing molecular implementation. The plate-size
ladder, the well normaliser and the row+column helper already exist; this plan extends
them rather than introducing a parallel geometry model.

---

## 1. What already exists

Most of the machinery is in `src/`. The gap is narrower than it first appears.

| Piece | Where | State |
|---|---|---|
| `PlateSize = 96 \| 384 \| 1536` + `PLATE_SIZE_OPTIONS` | `types/index.ts:1` | **Exists** — only 96 and 384 are in scope |
| "Plate selection" dropdown in the upload modal | `UploadMolecularResultsModal.tsx:185` | **Exists** |
| `plateSize` threaded upload → validation | `App.tsx:86` → `buildValidationData.ts:367` | **Exists**, but only feeds `plateSummary.totalWells` |
| `normalizeWell` — `A1`, `A01`, `A-1`, `A:1`, `1A`, `WELLA1` | `wellPosition.ts:22` | **Exists**, capped at `A–H` / `1–12` |
| `indexToWell` — sequential index → well, **row-major** | `wellPosition.ts:8` | **Exists**, capped at 96 |
| `combineRowCol(row, col)` — two-column address | `wellPosition.ts:66` | **Exists**, currently unused |
| `well` and `plateId` as separate mapping fields | `parseMolecularFile.ts:33,40` | **Exists** |

**What is missing:**

1. **No auto-escalation.** `plateSize` is `useState(96)` and only ever changes when the user picks from the dropdown. Nothing inspects the data.
2. **`normalizeWell` is 96-only.** `PLATE_WELL_RE = /^[A-H](?:[1-9]|1[0-2])$/`, and `indexToWell` returns `null` above 96 and divides by a hard-coded 12. A 384-plate well `J17` normalises to nothing usable.
3. **`PlateView` is hard-coded 8x12** (`PlateView.tsx:10-11`). Selecting 384 changes a count in the summary and nothing on screen.
4. **`combineRowCol` has no mapping field behind it.** `MappingTargetKey` has no `wellRow` / `wellColumn`, so the two-column form cannot be reached from the UI.

So "96 or 384 selection, escalating past 96" is true of the *selector* and not yet of the *data path*. That is the work.

---

## 2. The trap that shapes the validation

`frank091526p2_full.csv` has `Block #` and `Row #` columns. They read exactly like a plate address. They are not.

- `Block #` runs **1–151**, one per **compound** — Block 1 = 6-MAM, Block 3 = Codeine, Block 151 = GHB
- `Row #` runs **1–25**, one per **injection** — Row 1 = Cal_1, Row 6 = 26091895U

They are result-table coordinates. That file's plate address is `Vial` + `Tray`, two different columns.

No heuristic separates "block/row that is a plate address" from "block/row that is a result index" — both are small integers in adjacent columns. But **the plate-size ladder already answers it**, which is the nice part: 151 distinct rows exceeds 16, the row count of a 384 plate and the largest we support, so the address does not fit any plate and the mapping is refused with a reason. The existing ladder is the validator.

---

## 3. Design: one address model, sized by the existing ladder

### 3.1 Plate geometry comes from `PlateSize`

Extend the existing ladder into real geometry rather than inventing a new config:

**Two plate sizes are in scope**, per the product decision — 96 and 384. `PlateSize` keeps its 1536 member for type compatibility, but it is not offered and not rendered.

| `PlateSize` | Rows | Columns | Supported |
|---|---|---|---|
| 96 | A–H (8) | 1–12 | yes |
| 384 | A–P (16) | 1–24 | yes |
| 1536 | A–AF (32) | 1–48 | no — out of scope |

```ts
export const PLATE_GEOMETRY: Record<PlateSize, { rows: number; cols: number }> = {
  96:   { rows: 8,  cols: 12 },
  384:  { rows: 16, cols: 24 },
  1536: { rows: 32, cols: 48 },   // defined, not offered
}

export const SUPPORTED_PLATE_SIZES: PlateSize[] = [96, 384]
```

Keeping 1536 in the type but out of `SUPPORTED_PLATE_SIZES` means the geometry table stays complete and turning it on later is a one-line change, while nothing today can select or render it. The molecular dropdown currently offers it (`types/index.ts:6`) and should be narrowed to the same list.

**Auto-escalation** — the behaviour already expected of the product:

```
fitPlateSize(addresses) =
  smallest size whose rows >= max(rowIndex) and cols >= max(column)
  → 96, else 384, else "does not fit"
```

Applied on upload, shown in the existing dropdown as the selected value, and overridable by the user. A file that overflows 384 is refused with the offending numbers, which is exactly what a mis-mapped `Block #` / `Row #` produces.

This is the behaviour already expected of the product — "96 or 384, escalating past 96" — made real on the data path rather than left to the user.

### 3.2 Position forms, all resolving to one address

`normalizeWell` already handles most single-column spellings, and `indexToWell` already does the sequential → row-major conversion. They need to become plate-size aware and gain a couple of siblings:

```ts
type PositionConfig =
  | { kind: 'combined';       column: string }                      // 'P4-A1', 'A1', '17'
  | { kind: 'plate-well';     plateColumn: string; wellColumn: string }
  | { kind: 'row-column';     rowColumn: string; columnColumn: string; plateColumn?: string }
  | { kind: 'sequential';     column: string; plateColumn?: string }
  | { kind: 'acquisition-order' }
```

All five produce the same thing, and four of the five are mostly existing code:

| Form | Uses | New work |
|---|---|---|
| combined | `normalizeWell` | strip a plate prefix (`P4-A1`) — tox already does this |
| plate-well | `normalizeWell` | none |
| row-column | `combineRowCol` | expose as a mapping field |
| sequential | `indexToWell` | un-cap from 96; honour plate size |
| acquisition-order | `indexToWell` over sort order | small |

**There is no separate "rack" concept in this model.** A 22-vial tray is a sequential address laid row-major onto the smallest plate that fits — which is what `indexToWell` already does. The rack renderer built for the Shimadzu file becomes an optional *presentation*, not a second data model. That removes a whole branch.

### 3.3 Drug names in columns — the wide shape

Where the drug name lives is the second axis, and it is the one that is hard-coded today.

**What the file looks like.** In `15SEP2026_LCMS6_DL_001.csv`, row 1 carries the drug names and row 2 the sub-headers, with everything left of column I being per-injection fields:

```
col:        B      C          D      E     F      G                H       I     J            K          L     M            N
row 1:                                                                     D-Methamphetamine Results     L-Methamphetamine Results
row 2:      flag   Name       Data   Type  Level  Acq. Date-Time   Pos.    RT    Final Conc.  Accuracy   RT    Final Conc.  Accuracy
row 3:             L1         ...    Cal   1      9/16 8:17        P1-A1   1.913 25.6088      102.4      2.051 25.5273      102.1
```

Note that the drug name sits **only on the first column of its block** — J and K are blank, because the spreadsheet merges the cell across the three columns. The CSV keeps the merge as two empty cells.

**The un-pivot is the whole trick.** Turning drug-in-columns into drug-in-rows means the mapping UI never has to know about wide versus long — downstream there is only ever a long table, and `Result Value` binds to a column like any other. `toLongTable` already does this; the work is making its parameters configurable instead of assumed.

**Detection: find the repeating period in the sub-header row.** Walk the sub-header row and stop at the first label that occurs twice. Its two positions give the block start and the block width; the sub-headers between them are the per-drug columns; the names come from the row above, taking whichever cell in the block is non-empty.

Verified against all three Agilent exports:

| File | Block start | Width | Drugs | Spare columns | Sub-columns |
|---|---|---|---|---|---|
| `DL_001` | col 8 | 3 | 2 | 0 | `RT`, `Final Conc.`, `Accuracy` |
| `ETH_104` | col 8 | 3 | 2 | 0 | same |
| `MP_301` | col 8 | 3 | **75** | 0 | same |

All names present, all unique, nothing left over. The same routine handles a two-drug chiral confirmation and a seventy-five-drug pain panel with no special cases.

**Three shapes, one config:**

```ts
type ShapeConfig =
  | { kind: 'long'; headerRow: number; dataStartRow: number }

  | { kind: 'wide';                    // drug names in column-group headers
      nameRow: number;                 // row holding the drug names
      headerRow: number;               // row holding the repeating sub-headers
      dataStartRow: number;
      blockStartColumn: number;        // first column of the repeating region
      blockWidth: number;              // columns per drug
      subColumns: string[];            // ['RT', 'Final Conc.', 'Accuracy']
      nameCleanup?: string }           // '\s*Results\s*$'

  | { kind: 'flat-wide';               // one column per drug, no sub-headers
      headerRow: number;
      dataStartRow: number;
      drugColumns: string[] }          // explicit — nothing in the file marks them
```

`flat-wide` is the case where a screening analyser writes `Sample ID, Well, Morphine, Codeine, THC` and each cell is the result. Period detection finds no repeat, so the user names the drug columns instead. None of our four files is flat-wide; it is included because it is the most likely third shape.

**After the un-pivot**, every shape yields the same record set — the fixed per-injection fields, plus `Compound`, plus the sub-columns as ordinary columns. The sub-columns then map like anything else: `Result Value` ← `Final Conc.`, `Recovery %` ← `Accuracy`, and `RT` falls through to the position drawer as an additional field. That is exactly what happens today; the difference is that it would be configuration rather than a code path.

**UI.** A *File Shape* section above the existing field table, using molecular's existing `RowSettingCard` for the row numbers (it already provides Header Row / Results Start Row for molecular uploads):

```
Drug names are in:  ( ) rows — one column names the drug
                    (•) column groups — a header row above names each drug
                    ( ) one column per drug

Name row:  [ 1 ]    Header row:  [ 2 ]    First data row:  [ 3 ]

  Detected: 75 drugs from column I, 3 columns each
  Sub-columns: RT · Final Conc. · Accuracy
  Names: Morphine, Oxymorphone, Hydromorphone … THC-COOH     [ strip " Results" ✓ ]
```

**Validation**, all derived from the detection result:

| Check | Catches |
|---|---|
| Remaining columns divisible by block width | wrong width — "columns 9–157 leave 2 spare" |
| Every block has a non-empty name | a merged cell the CSV lost |
| Names unique | block start off by one, so names land on the wrong block |
| Sub-headers identical in every block | ragged export, or the region starting too early |
| Result sub-column mapped | un-pivot produces records with no value |

**Known variant, not planned:** a fully transposed matrix, drugs down the rows and samples across the columns. It appears on some analysers and needs a different un-pivot (sample names become records rather than columns). Worth naming so it is a decision rather than a surprise.

---

## 4. The safety net: live plate preview

Because a wrong mapping renders a plausible-looking plate, the mapping panel needs the plate itself, updating live:

```
Position form:  ( ) One column            Pos.
                (•) Two columns: plate + well    Tray | Vial
                ( ) Two columns: row + column
                ( ) Sequential index
                ( ) Acquisition order

Plate selection: [ 96-Well Plate ▾ ]   auto-selected — 22 positions fit 96

  ┌─ Preview ──────────────────┐
  │ Tray 4  ▪▪▪▪▪              │
  │ Tray 5  ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │
  └────────────────────────────┘
  ✓ 25 injections → 25 positions across 2 plates
```

Wrong, it refuses rather than renders:

```
  ✗ Addresses need 151 rows × 25 columns — larger than a 384-well plate (16 × 24)
  ✗ 3,775 rows produced 3,775 positions — expected one per injection (25)
  ⚠ Block # has 151 distinct values. Did you mean Vial + Tray?
```

| Check | Catches |
|---|---|
| Fit against the plate ladder | the Block/Row trap |
| Position count vs injection count | result indices mapped as addresses |
| Collisions — two injections, one address | wrong column pair, missing plate |
| Coverage — rows yielding no address | blank or malformed cells |
| Row letter outside range, column outside `1..cols` | **swapped row and column columns** |

The last is the likeliest human error and is trivially detectable.

---

## 5. Map once per device

The endpoint is a saved profile in Instrument Management, beside the QC control config already there:

```ts
interface ToxDeviceProfile {
  instrumentId: string
  label: string
  shape: 'long' | 'wide'
  fields: Record<ToxMappingKey, string>
  position: PositionConfig
  plateSize: PlateSize | 'auto'
  matchers: { filenamePattern?: string; requiredColumns?: string[] }
}
```

On upload the file is matched to a profile and it is applied, with the preview shown for confirmation. Unmatched files fall into the mapping flow and the result can be saved as a new profile. The two current vendors become seeded profiles rather than two code paths.

---

## 6. Phases

| # | Phase | Delivers | Proving case |
|---|---|---|---|
| **1** | **Size-aware well utilities** — `PLATE_GEOMETRY`; un-cap `normalizeWell` / `indexToWell` to A–P and 1–24 | 384 addresses parse | `J17` → row 10, col 17 |
| **2** | **`fitPlateSize` + auto-escalation** — wire into upload, keep the dropdown as override | The behaviour already expected of the product | 96 wells → 96; 200 → 384 |
| **3** | **Size-driven rendering** — `PlateView` and `ToxBatchView` take rows/cols from `PlateSize` | Selecting 384 changes the grid, not just a count | A synthetic 384 fixture |
| **4** | **Position forms** — the five variants behind one resolver; `row-column` gets a mapping field via existing `combineRowCol` | Two-column addresses reachable from the UI | `frank` remapped Vial+Tray → row+column |
| **5** | **Live preview + validation** — the mini-plate and the five checks | The Block/Row trap becomes visible, not silent | Mis-map `frank` deliberately; expect refusal |
| **6** | **Shape config** — period detection surfaced as the *File Shape* panel; `long` / `wide` / `flat-wide` declared, with the five checks | A fourth wide vendor needs no code | `MP_301` (75 x 3) and a flat-wide fixture |
| **7** | **Device profiles** — shape, fields, position and plate size saved per instrument and auto-applied | Map once per device | Re-upload ETH and MP with zero mapping |

Phases 1–3 are shared with molecular and improve it too: molecular's 384 option currently changes a number and nothing else. Phase 5 is the one that pays for the position work; Phase 6 is what makes a new device a configuration rather than a commit.

**The two axes are independent.** Position (Phases 1–5) and shape (Phase 6) touch different code and can be built in either order, or in parallel. If the next device to onboard is another wide exporter, Phase 6 goes first.

---

## 7. What this costs

- `wellPosition.ts` gains a size parameter throughout — it is 70 lines and fully covered by the position tests.
- `PlateView.tsx` and `ToxBatchView.tsx` derive `ROWS`/`COLS` instead of hard-coding them. A 384 plate is 24 columns against today's 12, so the well card shrinks or the grid scrolls horizontally — worth a look at real density before Phase 3 lands.
- The tox `rack` layout branch can be deleted once sequential addresses render on a grid, unless §8.3 says otherwise.
- The mapping panel grows two sections above the existing field table: *File Shape* and *Position*. `RowSettingCard` is reused for the row numbers.
- `toLongTable`'s two vendor branches collapse into one parameterised un-pivot; the Agilent path becomes `{ kind: 'wide', blockStartColumn: 8, blockWidth: 3, subColumns: ['RT','Final Conc.','Accuracy'] }`.
- 113 existing tests should survive Phases 1–4 unchanged; that is the regression signal.

**Not in scope:** merging plates across files, plate layout editing, non-rectangular geometries.

---

## 8. Open questions

1. **Which real devices produce row+column and block+row?** Neither is in the four files we have. Sample exports would let those forms be built against real data rather than assumption — the main risk in this plan.
2. **For block+row, what is a block?** A 384-plate quadrant (4 x 96) and a plate-per-block on a carrier share column names and mean different things.
3. **Does any device export a transposed matrix** — drugs down the rows, samples across the columns? It needs a different un-pivot and is currently out of scope.
4. **Is the drug name always in the block's first column?** Our files merge the name across the block, so any non-empty cell in the block works. A centred label on a different column would too, but a name *outside* the block would not.
5. **Should a vial rack still render as a rack?** §3.2 folds it into a sequential address on a grid, which deletes a branch. A lab that pipettes a 96-plate and loads it as a rack thinks in wells, so this is probably right — but it is a change to something already built and working, so confirm first.
6. **Should molecular's plate dropdown lose 1536 too?** It currently offers a size nothing renders. Narrowing it is a one-line change but touches the molecular flow.
7. **Profile scope** — per instrument, or per instrument + panel? ETH and MP come off different instruments here, but one instrument running two panels with different exports is plausible.
8. **Who may edit a device profile?** It silently changes how every later upload is read, so it likely belongs with the QC config permissions rather than with the uploading technologist.
