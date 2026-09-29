# Template Mapping — Plan

**Document type:** Implementation plan
**Status:** Phase A built on the toxicology flow; B–H proposed
**Scope:** How a lab onboards an instrument whose export we have never seen, without a code change
**Companion:** `generic-plating-plan.md` covers the position and plate-size mechanics this plan configures
**Grounding:** two real exports we hold, a codebase audit, and a survey of Agilent, Shimadzu, SCIEX, Waters and Thermo export formats

---

## 1. The goal

Today each vendor is a code path. Adding a third means writing a parser. The goal is that a **template** — a saved description of one file format — is the only thing a new device needs, created by a lab admin through the mapping UI and reused on every upload afterwards.

```
New device  →  upload one sample file  →  UI proposes a template
            →  admin corrects it against a live preview  →  save
            →  every later upload from that device parses automatically
```

Plate presentation is 96-well or 384-well only, per the product decision.

---

## 2. What already exists

### 2.1 A dormant template contract

`src/api/lims-data-contracts.ts:55` already declares:

```ts
export interface InstrumentFieldMappingTemplate {
  id: string
  instrumentId: string
  templateName: string
  mappings: UserFieldMapping[]
  headerRowIndex: number
  dataStartRowIndex: number
  plateSize: 96 | 384 | 1536
}
```

with `getMappingTemplates` / `saveMappingTemplate` on the LIMS API at `:83`, and `validatePlateRun` already accepting mappings, plate size and row indices at `:90`.

**The file is never imported by anything.** It is a specification, not an implementation, and it is molecular-shaped: no file shape, no position expression, no toxicology field keys, and it keys on `instrumentId` — which §5.1 argues is the wrong key. This plan extends that contract rather than inventing a second one.

### 2.2 Machinery that exists per flow

| Piece | Molecular | Toxicology |
|---|---|---|
| Field definitions | `MAPPING_FIELD_DEFS` `parseMolecularFile.ts:32` — 11 keys | `TOX_MAPPING_FIELD_DEFS` `toxLongTable.ts:191` — 9 keys |
| Auto-detection | `createAutoMappings` `:204` — substring match | `createToxAutoMappings` `:214` — exact match only |
| Mapping UI | `UploadMolecularResultsModal.tsx:480` | `UploadToxResultsModal.tsx:299` |
| Header / data-start row | `FileParseContext` + two `RowSettingCard`s | **none — hard-coded** |
| Un-pivot for wide files | **none** | `agilentLongTable` `toxLongTable.ts:53` |
| Position parsing | `normalizeWell` `wellPosition.ts:17` | `parsePosition` `toxLongTable.ts:267` |
| Unmapped columns kept | **no — dropped** | yes, as `extras` |

### 2.3 Plate size is declared and then ignored

`plateSize` threads from `App.tsx:86` into `plateSummary.totalWells` (`buildValidationData.ts:402`) — and `totalWells` is rendered nowhere. Every grid builder walks 8x12 regardless (`buildValidationData.ts:191`, `PlateView.tsx:10`, `ToxBatchView.tsx:9`). Selecting 384 today changes one number no component displays.

---

## 3. The format landscape

A survey of the five major vendors found **six structural variants**, of which our two files cover only two. Evidence is strongest where a real exported file or a working open-source parser was available.

| # | Variant | Seen in | We handle it |
|---|---|---|---|
| 1 | **Flat long** — one header row, one row per compound x injection | Shimadzu LabSolutions, SCIEX OS / MultiQuant | **yes** |
| 2 | **Two-row wide** — compound in a sparse row-1 group header, parameters in row 2, N columns per compound | Agilent MassHunter Flat Table | **yes** |
| 3 | **Repeating per-compound blocks** — compound name only in an in-band `Compound 1:  <name>` title row; the column header row repeats in every block | Waters TargetLynx summary, Thermo XReport | **no** |
| 4 | **Transposed matrix** — compounds down the rows, samples across the columns | Agilent MassHunter *Compound Table* layout | **no** |
| 5 | **Nested XML** — compounds nested under samples as attributes | Waters TargetLynx XML, Agilent `report.results.xml` | **no** |
| 6 | **Preamble rows above the real header** | Thermo `Bracket Type=4`; Waters report title + timestamp | **no** |

Variants 3 and 6 are the ones that break the current model outright — neither is a "header row plus data" file at all. Variant 4 is Agilent's own alternative display mode, so a lab already using MassHunter can produce it by toggling a setting.

### 3.1 Five cross-cutting hazards

These are not layout variants; they are properties that vary within any layout, and each one would defeat a naive template.

**a. The result column has no stable name.** Waters TargetLynx names it **after the units** — the column header is literally `ng/mL`, and changes with the method. Agilent has both `Final Conc.` and `Calc. Conc.` (the latter before dilution factors). SCIEX writes `Calculated Concentration` in the results table and `Calculated Conc.` in the report. A template needs alias and pattern matching, plus a "the column whose header is the unit string" mode.

**b. Headers are localised.** Shimadzu headers follow the instrument PC's UI language — a multi-vendor parser in the wild maps them as `样品名`, `浓度`, `面积`, `保留时间`, `精确度%`. **This breaks matching a template on English header text**, and is the main correction to §5.2 below.

**c. Exports contain only the columns the analyst had visible.** Documented for Waters, SCIEX and UNIFI. Two labs running the same instrument and software will produce different column sets. **A template is therefore per-lab-per-method, not per-vendor** — which refines, but does not overturn, the finding in §5.1.

**d. Delimiters and encodings are not what the extension says.** Thermo's sequence CSV uses the **Windows locale list separator**, so it is semicolon-delimited on an EU-locale instrument PC. A real SCIEX export has **CR-only line endings** and writes missing values as the literal `N/A`. Waters' LIMS export is comma-delimited with a `.txt` extension. SCIEX quotes component names containing commas — and that breaks its own re-import.

**e. Sample-type vocabularies all differ**, and the value is what identifies calibrators and QCs:

| Vendor | Vocabulary |
|---|---|
| Shimadzu | `Std.`, `Unk.` |
| Agilent | `Cal`, `QC`, `Blank`, `Sample` |
| SCIEX | `Standard`, `Blank`, `Double Blank`, `Quality Control`, `Unknown`, `Solvent` |
| Thermo Xcalibur | `Blank`, `Std Bracket`, `QC`, `Unknown` |
| Thermo TraceFinder | `Matrix Blank`, `Solvent`, `Unknown`, `Cal Std`, `QC Std` |
| Waters MassLynx | `Study Sample`, `Blank`, `QC`, `Other` |

Our current `injectionTypeFrom` (`parseToxFile.ts:89`) hard-codes a single vocabulary. A template needs a **value map**, not just a column binding. Thermo even documents its own Xcalibur→TraceFinder renaming, so the mapping varies within one vendor.

### 3.2 Position is three incompatible models

| Model | Example | Vendors |
|---|---|---|
| **Combined string, plate embedded** | `P4-A1`, `2:A,12`, `1:A1` | Agilent, Waters, Thermo |
| **Two columns** | `Vial` + `Tray` | Shimadzu, Agilent worklist |
| **Three or four numerics** | rack + plate + vial | SCIEX |

Waters packs plate, row and column into one cell as `2:A,12`. That is not a variant of `P4-A1` — the separators differ and so does the order. **A fixed enum of position forms will not hold.** The template needs a position *parser*: a regex with named capture groups, plus optional second and third columns.

### 3.3 What is not a competing format

ASTM E1394 / CLSI LIS02 and HL7 ORU^R01 are record-oriented, have no header row, and sit **downstream** in middleware. Column mapping solves the vendor-CSV leg; these do not compete with it. No cross-vendor columnar interchange format for tox quant results appears to exist — every vendor ships its own shape.

---

## 4. What a template must describe

Widened by the research from four parts to seven.

| Part | Why |
|---|---|
| **Read** — delimiter, encoding, line endings, sheet | §3.1d |
| **Locate** — preamble rows, how to find the header | Variant 6 |
| **Shape** — long / wide / block-delimited / transposed | Variants 1–4 |
| **Fields** — column → system field, by alias or pattern | §3.1a |
| **Values** — sample-type vocabulary map | §3.1e |
| **Position** — a parser, not a form | §3.2 |
| **Plate** — 96 or 384, auto-fitted | `generic-plating-plan.md` |

---

## 5. Two findings from our own files

### 5.1 A template belongs to a **format**, not an instrument or a panel

One Agilent template parses all three of our Agilent files unchanged:

| | `ETH_104` | `MP_301` | `DL_001` |
|---|---|---|---|
| Instrument | LCMS5 | LCMS6 | LCMS6 |
| Panel | alcohol biomarkers | pain management | chiral confirmation |
| Drugs | 2 | **75** | 2 |
| Block start / width | 8 / 3 | 8 / 3 | 8 / 3 |
| Sub-columns | `RT`, `Final Conc.`, `Accuracy` | same | same |
| Fixed fields | `Name, Data File, Type, Level, Acq. Date-Time, Pos.` | same | same |

Two instruments, three panels, 2 to 75 drugs — one template, zero differences. An instrument *points at* a template; it does not own one. Tempered by §3.1c: because exports carry only the analyst's visible columns, the right granularity is **per lab per method**, not per vendor. Our three files share a method configuration, which is why one template covers them.

### 5.2 Auto-matching works on column signature — but cannot be the only mechanism

Taking the header row of each file: the three Agilent files share exactly **9** columns, identical across all three; only **3** columns (`Level`, `RT`, `Type`) overlap between the two vendor families. Discriminating sets are large and clean, so signature matching is reliable *for these files*.

**But §3.1b breaks it as a sole mechanism:** a Shimadzu instrument with a Chinese UI emits `样品名` where ours emits `Sample Name`, and no English signature will match. So matching must be a **fingerprint** with several independent signals, any of which can carry the match:

```
score(template, file) =
    required columns present            (strongest, when headers are English)
  + column count and order similarity   (language-independent)
  + shape markers                       (row 1 ends in " Results"; "Bracket Type=" in A1;
                                         a "Compound N:" title row)  — language-independent
  + delimiter and encoding match
  + filename pattern                    (tie-breaker only)
```

Filenames stay a tie-breaker, never load-bearing — they are the least reliable thing in this data (`ETH_104.csv` contains batch `ETH_004`).

---

## 6. The template

```ts
interface FileTemplate {
  id: string
  label: string                      // 'Agilent MassHunter Quant — wide, ACME lab method'
  vendorHint?: string
  version: number

  read: {
    delimiter: ',' | ';' | '\t' | 'auto'
    encoding: 'utf-8' | 'utf-16' | 'latin-1' | 'auto'
    sheet?: string | number
  }

  locate:
    | { kind: 'row'; headerRow: number; dataStartRow: number }
    | { kind: 'find'; firstCellMatches: string; offsetToHeader: number }   // 'Bracket Type='

  shape:
    | { kind: 'long' }
    | { kind: 'wide'; nameRow: number; blockStartColumn: number;
        blockWidth: number; subColumns: string[]; nameCleanup?: string }
    | { kind: 'blocks'; titlePattern: string; nameGroup: number;
        headerOffset: number }                                            // 'Compound \d+:\s+(.+)'
    | { kind: 'transposed'; compoundColumn: number; sampleHeaderRow: number }

  fields: Record<SystemField, ColumnBinding>      // exact | alias[] | pattern | unit-named
  valueMaps: { sampleType: Record<string, InjectionType> }

  position: {
    pattern?: string        // named groups: (?<plate>..)(?<row>..)(?<col>..)
    columns: string[]       // one, two or three source columns, in order
  }

  plateSize: 96 | 384 | 'auto'
  match: FingerprintConfig
}
```

Seeded with two templates built from the files we hold, so the system ships working rather than empty.

---

## 7. Blockers to clear first

Four things in the current code would stop a template system working.

**7.1 An upload does not know which instrument it came from.** Molecular resolves config by a boolean — `managedInstruments.find(i => i.isMolecular)` (`App.tsx:132`) — so a second molecular device would silently share the first one's config. Tox carries a free-text label (`App.tsx:450`) it never uses. This is the join key a template needs.

**7.2 There is no toxicology instrument record.** `instrumentManagementMockData.ts:22` holds one `ManagedInstrument`, the molecular one. Tox devices exist only as home-page tiles (`mockData.ts:61`), so there is no row under which a tox template could be stored.

**7.3 Eighteen columns are auto-detected and unmappable.** Molecular resolves `patient`, `panel`, `testOrder`, `isQc`, `qcType`, `type` through `AUTO_COLUMN_ALIASES` (`parseMolecularFile.ts:74`) plus two more via `AUTO_METRIC_ALIASES`; none appear in `MAPPING_FIELD_DEFS`. Tox is worse: `KNOWN` (`parseToxFile.ts:425`) reads twelve QC-critical columns by literal name — `ISTD Area`, `Ref 1 Std Ratio %Diff`, `S/N`, `Flag ID`, `Acquisition Batch` and others — entirely outside the mapping system. A template that cannot express these is not a complete description of the format.

**7.4 The two flows would resist a shared template.** Molecular builds `ParsedUploadData` with a materialised 96-cell array; tox builds `ToxBatch` with sparse positions. Molecular has no un-pivot at all. Header row is molecular-only; tox hard-codes it.

**Recommendation: build on the toxicology flow first.** It already normalises shape before mapping, keeps unmapped columns, and has 113 tests over the parse path. Molecular's parser, `wellPosition.ts` and `buildValidationData.ts` have **no test coverage at all** — converting molecular first means rewriting untested code with no regression signal.

---

## 8. Creating a template — the mapping UI

The upload modal becomes the template editor, each section proposing an answer by detection and letting the admin override it:

```
┌ File ───────────────────────────────────────────────────┐
│ Delimiter [ auto → comma ]   Encoding [ auto → UTF-8 ]  │
│ Header: (•) row [2]   ( ) first cell matches [        ] │
└─────────────────────────────────────────────────────────┘
┌ File Shape ─────────────────────────────────────────────┐
│ ( ) long  (•) column groups  ( ) compound blocks  ( ) transposed │
│ → 75 drugs from column I, 3 columns each                │
│   RT · Final Conc. · Accuracy    [strip " Results" ✓]   │
└─────────────────────────────────────────────────────────┘
┌ Field Mapping ──────────────────────────────────────────┐
│ Sample ID * [ Name ▾ ]     Drug Name * [ Compound ▾ ]   │
│ Result *    [ Final Conc. ▾ ]                            │
│ Sample Type [ Type ▾ ]  → Cal=Cal  QC=QC  Blank=Blank …  │
└─────────────────────────────────────────────────────────┘
┌ Position ───────────────────────────────────────────────┐
│ Columns [ Pos. ▾ ] [ + ]   Pattern [ (?<plate>.+)-(?<row>[A-P])(?<col>\d+) ] │
│ Plate size [ Auto → 96 ]                                 │
│ ┌ Preview ──────┐  ✓ 102 injections → 96 positions       │
│ │ P4 ▪▪▪▪▪▪▪▪▪▪ │    on 1 plate                          │
│ └───────────────┘                                        │
└─────────────────────────────────────────────────────────┘
          [ Save as template… ]   [ Continue to Validation ]
```

**The live plate preview is the safety net.** A matched template is always shown for confirmation before anything is committed — auto-match saves typing, it does not bypass review. See `generic-plating-plan.md` §2 for why nothing weaker is sufficient, and §4 for the validation checks.

---

## 9. Phases

| # | Phase | Delivers |
|---|---|---|
| **0** | **Clear the blockers** — instrument id on uploads, a tox `ManagedInstrument` record, a decision on the 18 auto-only columns | A template has somewhere to live and something to key on |
| **A** | ✅ **Built** — template type, two seeded templates, fingerprint matching, parser reads its config from a template; template shown and switchable in the upload modal | 126 tests pass. No vendor branch left in the parser. |
| **B** | **Read + locate configurable** — delimiter, encoding, CR-only line endings, preamble skip / header discovery | Variant 6; a Thermo or EU-locale file can be read at all |
| **C** | **Position parser + plate size** — `generic-plating-plan.md` Phases 1–5, with a named-capture regex in place of a form enum | 384 renders; Waters `2:A,12` parses; live preview and validation |
| **D** | **Shape configurable** — long / wide, then block-delimited and transposed | Variants 3 and 4; Waters and Agilent Compound Table |
| **E** | **Value maps** — sample-type vocabulary per template | Calibrators found in any vendor's dialect |
| **F** | **Template editor UI** — the four sections above, wired to the live preview | An admin can correct a proposed template |
| **G** | **Save, match, reuse** — persistence beside the per-instrument QC config; instrument → default template | A new device is onboarded without a commit |
| **H** | **Template management** — list, edit, duplicate, version, permissions | Templates are maintainable and a bad edit is recoverable |

Phase A de-risked the rest, and the answer was yes: both formats are expressed purely as template data, with no vendor branch left in the parser. Three tests prove the model generalises past our own files — a Waters-style `4:A,12` address, a TraceFinder/SCIEX sample-type dialect, and a unit-named result column, each handled by a template-only change. All of A–H land on the toxicology flow; molecular converges afterwards, behind characterisation tests.

**Sequencing note.** B and C are worth doing before D. A file that cannot be read or positioned is useless regardless of its shape, and both of our current formats are already shaped correctly.

---

## 10. Risks

- **A template edit silently changes how every later upload is read.** Versioning, plus recording which template version parsed each batch, so a result is always traceable to the rules that produced it. This is why Phase H is not optional.
- **Detection proposing confidently wrong answers.** Mitigated by never auto-committing: the preview and validation checks are the gate.
- **Molecular's parser is untested.** `parseMolecularFile.ts`, `wellPosition.ts`, `buildValidationData.ts` and `filterUploadBySelection.ts` have no tests. Convergence work needs characterisation tests written first or regressions will be silent.
- **Designing variants 3–6 from documentation rather than files.** The two highest-confidence findings in the research both came from real exported files, not vendor docs. Waters' MassLynx LIMS field order, UNIFI's column names, TraceFinder's results layout and Chromeleon's variables could not be verified at all.

---

## 11. Open questions

1. **Which vendors does this lab actually need?** The plan covers six variants; building all six speculatively is waste. Priority should follow the devices on the roadmap.
2. **Can we get one real export per target vendor?** This is the single highest-value input. Documentation was insufficient for four of the five vendors surveyed.
3. **Is Chromeleon in scope?** Its output is entirely user-defined by a Report Designer template, so there is no vendor schema to map against — it needs a real customer file or it cannot be planned.
4. **Should XML exports be supported (variant 5)?** They are the only lossless, layout-stable exports, so they may be a better long-term target than CSV for the vendors that offer them.
5. **The 18 auto-only columns** (§7.3) — promote to optional mapped fields, or leave as vendor code? Leaving them means a new device still needs a commit.
6. **Template granularity** — §5.1 says format-level, §3.1c says per-lab-per-method. The existing contract (`lims-data-contracts.ts:57`) keys on `instrumentId`. Worth settling before that contract is implemented.
7. **Who may create and edit templates?** They change parsing for everyone; likely the QC configuration permissions, not the uploading technologist.
8. **What happens to batches already parsed when their template changes?** Re-parse, leave alone, or flag. Leaving alone is safest and needs the version stamp from §10.
