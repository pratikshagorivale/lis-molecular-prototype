# Toxicology Plating & Validation — Design

**Document type:** Feature design
**Audience:** Product, Engineering, QA, Lab operations
**Status:** Built — prototype implemented and verified against all four exports
**Related prototype:** Device Results Validation → Toxicology → Plate View
**Revision:** Updated after implementation. Changes from the first draft are marked *(revised)*.

---

## 1. What the sample files actually contain

Four exports, two vendor formats, four different panel shapes. Everything below is read off the files, not assumed.

| File | Vendor format | Instrument | Panel | Analytes | Injections | Layout |
|---|---|---|---|---|---|---|
| `15SEP2026_LCMS5_ETH_104.csv` | Agilent MassHunter (wide) | LCMS5 | EtG / EtS alcohol biomarkers | 2 | 102 | Plate `P4`, 96 wells |
| `15SEP2026_LCMS6_MP_301.csv` | Agilent MassHunter (wide) | LCMS6 | Pain-management panel | 75 | 102 | Plate `P1`, 96 wells |
| `15SEP2026_LCMS6_DL_001.csv` | Agilent MassHunter (wide) | LCMS6 | D/L methamphetamine chiral | 2 | 10 | Plate `P1`, 10 positions |
| `frank091526p2_full.csv` | Shimadzu LabSolutions (long) | Orion (S9) | Broad screen | 92 analytes + 59 ISTDs | 25 | Tray 4 + Tray 5, **vial rack** |

### 1.1 Agilent wide format

Two header rows. Row 1 carries compound group names spanning three columns each (`EtS Results`, `EtG Results`, …); row 2 carries the per-compound sub-columns `RT`, `Final Conc.`, `Accuracy`. Columns 1–2 are unlabelled flag columns holding `!` outlier markers. Then `Name`, `Data File`, `Type`, `Level`, `Acq. Date-Time`, `Pos.`

- `Type` ∈ `Cal` | `QC` | `Blank` | `Sample`
- `Pos.` is **plate-qualified**: `P4-A1`, `P1-H12`. The plate ID is already in the file — no filename guessing needed.
- Calibrators are `L1`/`L2`/`L3`, QC is `QC L` / `QC H` / `QC N` (the last typed `Blank`).

### 1.2 The bracket is a re-injection of the same physical wells

`ETH_104` has **102 injections across 96 unique wells**. The six duplicated wells are exactly `P4-A1` … `P4-F1` — the calibrators and QCs, injected once at the head of the run (17:19–17:35) and again at the tail (22:05–22:20).

This is the single biggest structural difference from molecular: **a well is not one result, it is an ordered list of injections.** The same holds in `MP_301`. Any well-keyed data structure that assumes one row per well will silently drop the closing bracket.

### 1.3 Shimadzu long format

One row per compound × injection — 3,775 rows for 25 injections. 131 columns. Position is `Vial` + `Tray`, and it is **not a grid**: calibrators sit on tray 4 at `A3`–`A7`, samples on tray 5 at vials `3`–`22`. A linear rack, not an 8×12 plate.

It also carries the quantitative machinery the Agilent export omits: `ISTD Area`, `Area Ratio`, `Ref 1 Set Ratio` vs `Ref 1 Actual Ratio` (qualifier ion ratio), `S/N`, `Detect. Limit (DL)`, `Quant. Limit (QL)`, `R²`, and a per-row `Flags` / `Flag ID` pair.

*(revised)* **Identifying the internal standards takes two rules, not one.** The `ISTD Name` column names each analyte's standard, but a panel's own deuterated standards are rarely all referenced there — `6-MAM-D6` is a compound in this file while `6-MAM` quantifies against `O-Desmethyl-Tramadol-D6`. Taking only the referenced names leaves 13 standards misclassified as analytes. Adding the naming convention (`-D<n>`, ` D<n>`, `-13C`, ` IS`) gives the real split: 151 compounds = 72 internal standards + **79 analytes**.

`Flag ID` decodes to the reason: `SN` (240 rows), `IR` ion ratio, `RRT%` relative retention time, `AC` accuracy. 274 rows flagged `Outlier`, 245 of them on patient samples.

*(revised)* Most of those rows are internal-standard peaks, not analytes. Once ISTDs are excluded, **31** analyte results on patient samples carry a flag — the number that matters for review. Separately, 347 analyte results fail the 20% ion-ratio window, which is the check that actually drives verdicts.

---

## 2. Why the molecular view cannot be reused as-is

| Molecular assumption | Toxicology reality | Consequence |
|---|---|---|
| One result row per well | A well has N injections; brackets re-inject wells A1–F1 | Well model becomes `injections[]` |
| Qualitative: Detected / Not Detected | Quantitative: `Final Conc.` vs cut-off, plus over-curve | Result cell needs a number, a unit, and a range verdict |
| 3–20 targets, shown as coloured dots | 2 to 92 analytes per panel | Dots stop working at 75; need a positives count |
| QC = PC / NC / NTC / IC wells | QC = calibration curve + QC L/H/N, **bracketed** | Two bracket outcomes per batch, not one banner |
| Controls pass or fail | Cal points have `Accuracy` %; curve has `R²` | Acceptance is numeric and per-level |
| Plate is 8×12 | Agilent = 96-well grid; Shimadzu = linear vial rack | Layout must be a mode, not a constant |
| Sample is valid or invalid | Sample can be **over the curve** and need a dilution re-run | Third terminal state: Requires Dilution |
| No reflex concept in MVP | Reflex confirmation is routine (D/L meth) | Child batch must link to parent well |
| Result is the answer | Result is presumptive until ion ratio + ISTD pass | Per-compound flags gate release |

---

## 3. Two findings worth designing around

### 3.1 Over-curve samples are a workflow, not an error

`ETH_104` calibrates to ~10,000 ng/mL. Three samples come back at 157,591 · 76,019 · 212,496 — and one EtG at 1,257,390. `DL_001` calibrates to ~1,000 and returns 383,428.

These are not failures. They are samples that must be **diluted and re-run**, and the lab needs that to be one action from the well, not a note in a spreadsheet. Today this is invisible in any plate view.

### 3.2 The reflex batch reuses the parent plate's positions

`DL_001` ran four samples. Their positions are `P1-B11`, `P1-E4`, `P1-D2`, `P1-D8` — non-sequential, which is odd for a four-sample run. Cross-referencing `MP_301`:

| Sample | Position in `MP_301` | Position in `DL_001` |
|---|---|---|
| T262580231 | P1-B11 | P1-B11 |
| T262580267 | P1-E4 | P1-E4 |
| T262580253 | P1-D2 | P1-D2 |
| T262580217 | P1-D8 | P1-D8 |

Exact match on all four. The chiral confirmation run carried the parent batch's coordinates forward, so parent and child are already linked in the data. The UI should surface that link — "confirmed from MP-301 · well D2" — rather than presenting `DL_001` as an unrelated four-sample batch.

*This needs one confirmation from the lab: is position carry-over deliberate worklist practice, or coincidence of these four? The design degrades gracefully to matching on Sample ID if it is the latter.*

---

## 4. The plating flow

```
Upload  →  Recognise  →  Map  →  Form batch  →  Review QC  →  Review samples  →  Act
```

### Step 1 — Upload

Same entry point as molecular: a Toxicology instrument card on Device Results Validation. Accepts CSV/XLS/XLSX.

### Step 2 — Recognise format

The parser sniffs the shape before asking the user anything:

- Row 1 cell A = `Sample` and row 1 has `… Results` groups → **Agilent wide**
- Header contains `Compound` + `Data Filename` + `Sample Type` → **Shimadzu long**
- Otherwise → fall through to manual mapping

Wide format needs a step molecular never did: **un-pivot the compound groups.** Read row 1 for compound names, row 2 for the `RT` / `Final Conc.` / `Accuracy` triplet under each, and emit one record per injection × compound.

### Step 3 — Map *(revised — real column mapping, on a normalised long table)*

Both exports are first normalised to **one long row per injection x compound**. This is what makes mapping possible at all: the Agilent file is pivoted, with the compound name in a row-1 group header and an `RT` / `Final Conc.` / `Accuracy` triplet per compound, so there is no "Drug Name" column to bind to until it is un-pivoted. Afterwards both vendors present ordinary columns and the same mapping UI works on either.

`15SEP2026_LCMS5_ETH_104.csv` un-pivots from 14 physical columns to 11 logical ones — `Name, Data File, Type, Level, Acq. Date-Time, Pos., Compound, RT, Final Conc., Accuracy, Flags` — across 204 records (102 injections x 2 compounds).

**System fields.** Four are required — the minimum to place a result on a plate:

| System field | Agilent | Shimadzu |
|---|---|---|
| Sample ID * | `Name` | `Sample Name` |
| Drug Name * | `Compound` (un-pivoted) | `Compound` |
| Result Value * | `Final Conc.` | `Conc.` |
| Well Position * | `Pos.` | `Position` (the vial) |

Five more are optional. **Plate / Tray** is one of them, because a single file routinely holds more than one plate — the Shimadzu run puts its calibrators on tray 4 and its samples on tray 5 — and only one can be drawn at a time. The other four are what the QC engine reads: without an injection type there are no calibrators to find, and without recovery there is no curve to judge.

| System field | Agilent | Shimadzu |
|---|---|---|
| Plate / Tray | `Plate` (split from the `Pos.` prefix) | `Plate` (`Tray 4`, `Tray 5`) |
| Injection Type | `Type` | `Sample Type` |
| Calibrator Level | `Level` | `Level` |
| Recovery % | `Accuracy` | `Accuracy(%)` |
| Acquired Date-Time | `Acq. Date-Time` | `Acquired Date` |

All eight are auto-detected and then editable, exactly as molecular's are. Clearing a required one blocks the preview and disables Continue.

**One alias trap, found by a test.** LabSolutions exports both `Sample Type` (`Std.` / `Unk.`) and `Type` (the peak type, `Target`). Matching `type` first binds the wrong column, which hides every calibrator and silently costs the batch its QC — the batch parses, looks fine, and has no brackets. `Sample Type` is matched first, and a test pins it.

**Everything unmapped rides along.** Each result carries its unbound columns, shown in the position drawer under *Additional fields from the file* — 3 for the Agilent export, around 100 for the Shimadzu one. Nothing in the file is discarded by mapping.

**Plate is a first-class column, not a prefix.** Neither file has a ready-made one: Agilent buries it in `Pos.` (`P4-A1`) and Shimadzu splits position across `Vial` and `Tray`. Both are normalised to a `Plate` column so the two map independently — `P4` + `A1`, `Tray 5` + `17`. Left unmapped, the plate is recovered from a prefix on the position, so a file that writes `P4-A1` and nothing else still works.

Positions are keyed by plate **and** position, so tray 4 vial `A3` and tray 5 vial `3` stay distinct.

**Layout comes from the data, not the vendor.** Positions that all look like `A1`..`H12` make a plate grid; anything else is an autosampler rack.

**Filename vs internal batch still disagree.** `15SEP2026_LCMS5_ETH_104.csv` contains data files named `…ETH_004_*.d`. Both are shown in Batch Summary; the acquisition batch wins and the Batch ID stays editable.

### Step 4 — Form the batch

Group injections by plate/tray. Each position becomes a **position card**; each card holds its injections in acquisition order. Calibrators and QCs occupy real positions and render as such — they are not a separate banner-only concept.

### Step 5 — Review QC

Three things must pass before samples mean anything:

1. **Calibration curve** — every level's `Accuracy` within the panel's window (typically 85–115%, 80–120% at the lowest level), and `R²` above threshold where the vendor supplies it.
2. **Opening bracket** — QC L / QC H within window, QC N (blank) below LLOQ.
3. **Closing bracket** — the same wells re-injected at the end of the run.

The bracket pair is the point. If the opening bracket passes and the closing one fails, the run drifted, and **every sample between them is suspect** — that is the finding the view has to make obvious, and it has no analogue in the molecular flow.

### Step 6 — Review samples

Per sample, four questions in order: did the ISTD recover, is the compound above the cut-off, is it inside the curve, and did the qualifier ion ratio hold.

### Step 7 — Act

Release · Release valid only · Release selected · Flag for dilution · Order confirmation · Reject batch.

---

## 5. The views

*These are the views as first designed. Section 8 records what was actually built — the scope was cut back to strict feature parity with the molecular screen, so the Compound View and the standalone bracket strip described below were not kept.*

### 5.1 Batch View (the plate)

Reuses the molecular `PlateView` geometry with three changes.

**Layout mode.** `grid` renders 8×12 with A–H / 1–12 rulers. `rack` renders vials in a single flowed row of position chips grouped by tray, for Shimadzu. Same card component, different container.

**Card content.** Molecular shows per-target dots. At 75 analytes that is noise, so the tox card shows:

```
┌──────────────┐
│ D2      ⟳2   │   position · injection count (only when > 1)
│ T262580253   │   sample ID
│ 4 positive   │   analytes above cut-off — the number that matters
│ ▲ over curve │   state line, only when there is something to say
└──────────────┘
```

**Colour.** Border carries the verdict, fill carries the role — the molecular convention, extended:

| | Meaning |
|---|---|
| Blue fill | Calibrator or QC position |
| White fill | Patient sample |
| Green border | Passed |
| Red border | Failed — ISTD, ion ratio, or QC out of window |
| Amber border | Over curve — needs dilution |
| Grey hatch | Between a failed bracket pair — result present but not releasable |
| Dotted | Empty |

The amber and hatched states are new and they are the two that earn the view its keep.

**Bracket strip.** Above the grid, a horizontal timeline of the run in acquisition order with the opening and closing bracket marked, so drift is visible as a shape rather than a table lookup:

```
[ Cal L1-L3 · QC L/H/N ]──── 90 samples ────[ Cal L1-L3 · QC L/H/N ]
        ✓ passed                                    ✗ QC H 132%
```

### 5.2 Compound View (new)

Molecular has Table View (sample-centric) and Plate View (position-centric). Toxicology needs a third axis, because a panel failure is usually **one compound across the whole batch**, not one sample.

Rows are compounds, columns are batch-level statistics: cal accuracy per level, QC L/H recovery, number of samples positive, number flagged. Sorting by flag count puts the broken compound at the top. On `frank`, this immediately isolates the 240 `SN` flags rather than making the user open 20 samples to find the same thing.

### 5.3 Table View

Sample-centric, as in molecular, with a positives-first expansion: the collapsed row shows only compounds above cut-off; negatives are behind a disclosure. A 92-compound panel where 88 are zero should not render 92 rows by default.

### 5.4 Position drawer

Opens on card click.

- **Header** — position, sample ID, patient, accession, batch, injection count
- **Injections** — one tab per injection when there is more than one, so brackets are inspectable
- **Results** — compound, concentration, unit, cut-off, verdict, ion ratio, S/N, flags
- **ISTD** — recovery against the batch mean, the check that validates the injection itself
- **Lineage** — parent batch and well when this is a confirmation run (§3.2)
- **Actions** — flag for dilution, order confirmation, exclude from release

---

## 6. Data model

New types, alongside the existing molecular ones rather than replacing them.

```ts
export type BatchLayout = 'grid' | 'rack'
export type InjectionType = 'Cal' | 'QC' | 'Blank' | 'Sample'
export type BracketPosition = 'opening' | 'closing' | 'none'

export type CompoundVerdict =
  | 'Negative'          // below cut-off
  | 'Positive'          // above cut-off, inside curve
  | 'Over Curve'        // above ULOQ — dilute and re-run
  | 'Below LLOQ'        // detected but not quantifiable
  | 'Invalid'           // ISTD, ion ratio, or S/N failed

export interface CompoundResult {
  compound: string
  concentration: number | null
  unit: string
  retentionTime: number | null
  accuracy: number | null        // Cal/QC only
  cutOff: number | null
  lloq: number | null
  uloq: number | null
  verdict: CompoundVerdict
  istdArea: number | null
  istdRecovery: number | null    // % of batch mean
  ionRatio: { set: number; actual: number; percentDiff: number } | null
  signalToNoise: number | null
  flags: string[]                // ['SN', 'IR', 'RRT%', 'AC']
}

export interface Injection {
  injectionId: string            // the .d filename or Data Filename
  sequence: number
  type: InjectionType
  level: number | null           // Cal level 1..n
  acquiredAt: string
  bracket: BracketPosition
  results: CompoundResult[]
  istdValid: boolean
}

export interface BatchPosition {
  positionId: string             // 'D2' (grid) or '17' (rack)
  plateId: string                // 'P1', or tray number
  sampleId: string
  accessionNumber: string
  patient: string
  injections: Injection[]        // ordered; length > 1 for bracketed wells
  positivesCount: number
  requiresDilution: boolean
  betweenFailedBrackets: boolean
  parentBatchId?: string         // reflex lineage
  parentPositionId?: string
}

export interface CalibrationCurve {
  compound: string
  levels: { level: number; expected: number; found: number; accuracy: number }[]
  rSquared: number | null
  curveType: string              // 'Quadratic'
  weighting: string              // '1/C'
  passed: boolean
}

export interface BracketOutcome {
  position: BracketPosition
  acquiredAt: string
  controls: { name: string; found: number; accuracy: number | null; passed: boolean }[]
  passed: boolean
}

export interface ToxBatch {
  batchId: string
  fileBatchId?: string           // when the filename disagrees — see §4 step 3
  instrument: string
  panel: string
  runDate: string
  layout: BatchLayout
  plateSize: PlateSize | null    // null for rack
  positions: BatchPosition[]
  curves: CalibrationCurve[]
  brackets: BracketOutcome[]
  compounds: string[]
  status: PlateLifecycleStatus   // reused unchanged
}
```

`PlateLifecycleStatus`, `PlateAuditEvent`, `CapaRecord` and the audit/CAPA machinery carry over unchanged — a tox batch has the same lifecycle as a molecular plate.

---

## 7. Acceptance rules

Configured per panel in Instrument Management, extending the existing control configuration rather than replacing it.

| Check | Default | Fails what |
|---|---|---|
| Cal accuracy, mid/high levels | 85–115% | The curve, and the compound across the batch |
| Cal accuracy, lowest level | 80–120% | Same |
| Curve `R²` | ≥ 0.99 | Same |
| QC L / QC H accuracy | 80–120% | The bracket |
| QC N (blank) | < LLOQ | The bracket |
| ISTD recovery | 50–150% of batch mean | The injection |
| Ion ratio `%Diff` | ≤ 20% | The compound in that sample |
| S/N | ≥ 10 at LLOQ | The compound in that sample |
| Concentration vs ULOQ | ≤ ULOQ | Routes to dilution |

**Failure scope is the design point.** A calibrator failure invalidates one compound across every sample. A bracket failure invalidates every sample between the brackets. An ISTD failure invalidates one injection. An ion ratio failure invalidates one compound in one sample. Four different blast radii — the molecular flow only has two, and the view has to make which one is in play unmistakable.

### 7.1 Scope has to be earned, not assumed *(revised)*

Building this surfaced a modelling error worth recording, because the naive reading of the rules above makes the feature useless.

If a bracket control fails when *any* compound falls outside its window, then on a 75-compound panel the bracket always fails. The first build blocked all 90 samples on MP-001 — technically following the rule, clinically absurd. The same applies to ISTDs: judging an injection on its worst-recovering standard blocked 19 of 20 samples on the Shimadzu screen.

The fix is a **systemic-failure share** (default 50%, configurable per panel):

| Observation | Scope |
|---|---|
| A few compounds outside the recovery window on a control | Those compounds are voided batch-wide. The bracket passes. |
| More than the systemic share outside the window | The bracket itself failed — the run drifted, hold every sample between brackets. |
| Carryover into the blank | Always systemic — it contaminates the run regardless of share. |
| A few internal standards recovering poorly | Those compounds are invalid in that sample. The injection stands. |
| More than the systemic share of ISTDs failing together | The injection is void — this points at the extraction, not at a peak. |

What this buys, on the real files:

| Batch | Compounds voided | Samples held |
|---|---|---|
| ETH-004 | 0 of 2 | 0 of 90 |
| MP-001 | 37 of 75 | 0 of 90 |
| DL-001 | 0 of 2 | 0 of 4 |
| Orion screen | 19 of 79 | 0 of 20 |

MP-001 is the case that proves it: every one of its twelve bracket controls has compounds outside the window, and not one of them reaches the systemic share. Half the panel is correctly voided; not a single sample is wrongly held.

One further correction from the same pass: a calibration level must pass on **every** injection at that level, not on the average of the opening and closing brackets. Averaging hides exactly the drift the bracket exists to catch.

---

## 8. What was built *(revised)*

The plating view is added **inside the existing toxicology validation screen**, and the screen is rebuilt to use the **same chrome as Molecular Results Validation**. Scope is deliberately held to feature parity with molecular — no tox-only additions.

```
Device Result Validation / <instrument> / Batch MP-001      ← breadcrumb
Toxicology Results Validation                               ← title
  Toxicology (90) | Pathology (0) | QC (0)                  ← device tabs with counts
  ┌ QC banner: Batch · Cal Passed · QC L Passed · … ┐       ← sticky, molecular's strip
  search · batch filter ·········· actions · [Table View | Plate View]
  ┌ consistency filters (Table View only) ┐
  │ content                    │ details panel │            ← docked, not floating
```

Everything in that layout is molecular's, element for element: the breadcrumb and title block, the tab row with pending counts, the sticky QC banner that appears when QC has something to say or when Plate View is open, the single toolbar row ending in a **segmented view switch** pinned right, view-dependent actions (`Reject Selected` / `Release Selected` in Table View; `Reject Batch` / `Release Valid Only (n)` / `Release Batch` in Plate View), and a details panel docked beside the content rather than floating over it.

Two things connect the new view to the old one:

- **The QC banner** carries the batch's control outcomes in molecular's one-line format. Because a tox batch is bracketed, each clause names which bracket failed — *"QC H Failed on closing bracket · E1"* — which is the whole point of bracketing, expressed without a second component.
- **The position chip** on each sample header row carries the plate coordinate and the sample's state, and opens that well on the plate. The flat table cannot explain why a result is blocked; that reason lives one level up, in the batch's QC.

| File | What it does |
|---|---|
| `src/types/tox.ts` | Batch model — injections per position, four failure scopes |
| `src/utils/toxLongTable.ts` | Long-table normalisation, system fields, auto-detection, layout detection |
| `src/utils/parseToxFile.ts` | Mapping-driven batch assembly, QC evaluation, reflex lineage |
| `src/utils/toxEvaluation.ts` | Acceptance rules, verdicts, blast radius, QC banner line |
| `src/utils/toxConsistency.ts` | Prescribed-vs-detected consistency |
| `src/data/toxPanels.ts` | Per-panel acceptance windows and cut-offs |
| `src/data/toxOrderContext.ts` | Patient / prescribed / previous value (LIMS-sourced in production) |
| `src/components/tox/UploadToxResultsModal.tsx` | Upload — file select, batch summary, detected fields, preview with per-position selection |
| `src/components/tox/ToxResultsTable.tsx` | The existing drug-row table, plus the position chip |
| `src/components/tox/ToxBatchView.tsx` | Plate grid and vial rack |
| `src/components/tox/ToxPositionPanel.tsx` | Docked position detail, injection tabs, lineage |
| `src/pages/ToxDeviceValidation.tsx` | The screen |
| `src/__tests__/toxParsing.test.ts` | 33 tests against the real exports, covering mapping and plate separation |

Reused unchanged from molecular: `AppLayout`, `Sidebar`, `Badge`, `Toast`, `Modal`, `Accordion`.

### Upload

The same modal shape as molecular: a drag-and-drop file step, then four panels — **Batch Summary**, **Raw File Data**, **Detected Fields**, **Preview Data** — with `Choose different file` / `Cancel` / `Continue to Validation` in the footer. Reached from `Upload Results` on the instrument card and `Upload New File` inside the screen, exactly as molecular is.

One panel differs in kind. Molecular's **Field Mapping** asks the user to bind each system field to a source column, because PCR exports share no header convention. Both toxicology formats identify themselves, so the parser resolves the binding and the panel *reports* it — same table, same `System Field → Source Column` columns, read-only. A third vendor would need molecular's editable version back.

Selection works per position rather than per well: ticking rows in Preview Data narrows the batch, and control positions are always kept, because QC belongs to the run and dropping it would make the remaining samples unreadable. Deselecting three samples from the ETH export yields a 93-position plate with three empty wells and a `Toxicology (87)` tab count.

### Cut for parity

Three things were built and then removed, because molecular has no equivalent:

| Removed | Where its information went |
|---|---|
| **Compound View** — a third view of per-compound batch statistics | Nowhere. §5.2 still argues for it; it needs a decision, not a default. |
| **Bracket strip** — opening/closing brackets drawn as a timeline | Folded into the QC banner, which now names the failing bracket. |
| **Flag for dilution / Order confirmation** actions on the details panel | Removed. The `Dilute & re-run` state is still shown, but nothing acts on it. |

The first is the one worth revisiting. A toxicology panel failure is usually one compound across the whole batch, and neither the sample-centric nor the position-centric view will surface that — on the Shimadzu screen it is the difference between seeing "GHB is broken" at a glance and opening twenty samples to infer it.

### Demo scenarios

| Batch | Proves |
|---|---|
| MP-001 · pain management | 75 analytes, 96 wells, 102 injections, per-compound voiding |
| ETH-004 · alcohol biomarkers | Bracketed wells, over-curve dilution routing, configured cut-offs |
| DL-001 · chiral confirmation | Reflex lineage back to MP-001 well by well |
| Orion screen · Shimadzu | Vial rack, no closing bracket, ion-ratio verdicts, unit warning |
| ETH-004 drifted | A failed closing bracket holding all 90 samples |

The last is a **constructed file** — the closing QC values were edited to exercise the failure path, since all four real exports pass systemically. It is labelled as synthetic in the batch list and the parser raises a warning banner on any file whose name starts with `DEMO_`, so it can never be mistaken for instrument output.

### Not built

- Field-mapping UI. Both formats are self-describing, so upload sniffs the vendor and parses directly. A mapping step is still needed for a third vendor.
- Audit trail and CAPA. The molecular machinery (`PlateAuditEvent`, `CapaRecord`) applies unchanged and was not wired up; molecular's `Raise CAPA` button therefore has no tox counterpart yet.
- All Plates. Molecular has a fourth tab listing every plate; tox has no batch registry behind it.
- Release and reject record intent and toast; they do not move results into reports.
- Pathology and QC tabs are placeholders, as in molecular.

## 9. Open questions *(revised)*

Two of the original six are answered by the production screen.

**Answered**

- **Cut-offs** live in **Drug Master / Panel Master**, which the current screen already reads for its Cut-off column. The prototype keeps them in `toxPanels.ts` and falls back to the LLOQ where a panel has none configured.
- **Reflex lineage** is real, and the S / C badge on the existing screen is the same relationship. The prototype matches child to parent on sample id and reports the position, so it degrades safely if the coordinate carry-over turns out to be worklist habit rather than policy.

**Still open**

1. **Systemic-failure share.** The prototype defaults to 50% — above that a control failure fails the bracket, below it the failure is scoped to the compounds. This number decides how often the lab is asked to re-run a batch and should be set by the lab, per panel, not by a default.
2. **Units.** The Shimadzu export reports every compound as `mg/dL`, including analytes calibrated at ng/mL. The prototype warns rather than converting. Is this a method template artefact?
3. **`Status: Pending`** on 1,975 Shimadzu rows — an analyst review state the LIS should import, or internal to LabSolutions?
4. **Bracket policy.** When the closing bracket fails, does the lab re-run the batch or re-inject and re-bracket? Determines whether "between failed brackets" is terminal or recoverable.
5. **Flag severity.** 31 analyte results on patient samples carry vendor flags, and 347 fail the ion-ratio window. The prototype treats ion ratio as blocking for that compound in that sample and vendor flags as advisory. Confirm that split.
6. **Where plating sits.** Built as a view inside the Toxicology tab rather than a fourth tab beside Pathology and QC. Easy to move if the lab thinks of the plate as a separate place to work.
7. **Compound View.** Cut to hold feature parity with molecular. A panel failure is usually one compound batch-wide, which neither built view surfaces — worth a decision rather than a default.
