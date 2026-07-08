# Molecular Device Results Validation — Engineering Specification

This document describes the prototype implementation for **Device Results Validation → Molecular Instrument**, including **Instrument Management / control configuration**, **Plate View**, **Table View**, and **validation logic**. It is intended as a handoff for production engineering.

**Prototype repo:** `lis-molecular-prototype`  
**Live demo:** https://lis-molecular-prototype-crelio-product-team.vercel.app

---

## 1. Overview

### Purpose

Allow a lab to:

1. Configure QC controls for a molecular instrument (Instrument Management).
2. Upload an instrument results file (CSV/XLSX).
3. Map file columns to LIS fields.
4. Preview parsed rows and **select which wells** to validate.
5. Review results in **Table View** or **Plate View**.
6. Release valid samples / plate / selection.

### High-level flow

```
Instrument Management (configure controls)
        ↓
Device Results Validation → Upload file
        ↓
Field mapping + preview (well selection)
        ↓
Continue to Validation
        ↓
buildValidationData() — parse, QC, LIS match, sample validity
        ↓
Table View  |  Plate View  (+ Well Details drawer)
        ↓
Release actions
```

### Key modules

| Area | Primary files |
|------|----------------|
| Control config UI | `src/pages/InstrumentManagementListPage.tsx`, `InstrumentDetailPage.tsx`, `AddControlModal.tsx` |
| Control config storage | `src/utils/instrumentStorage.ts` (localStorage) |
| File parse + mapping | `src/utils/parseMolecularFile.ts` |
| Validation build | `src/data/buildValidationData.ts` |
| File-based QC logic | `src/utils/sampleControlValidation.ts`, `controlEvaluation.ts`, `qcDetection.ts` |
| Interpretation | `src/utils/interpretation.ts` |
| Plate view | `src/components/PlateView.tsx` |
| Table view | `src/components/TableView.tsx` |
| Well details | `src/components/WellDetailsDrawer.tsx` |
| Upload + preview | `src/components/UploadMolecularResultsModal.tsx` |
| Well selection filter | `src/utils/filterUploadBySelection.ts` |

---

## 2. Instrument Management — Control Configuration

Accessible from left nav: **Instrument Management** (nav id: `qc`).

### 2.1 Managed instrument

The molecular device is a `ManagedInstrument` with `isMolecular: true`. Default config is in `src/data/instrumentManagementMockData.ts`. Configurations persist in browser `localStorage` via `instrumentStorage.ts`.

### 2.2 Control configuration model

```typescript
interface InstrumentControlConfig {
  id: string
  controlType: 'Positive Control' | 'Negative Control' | 'NTC' | 'Internal Control' | 'Extraction Control'
  control: string                    // Expected Sample ID label in file, e.g. "PC", "NC"
  scope: 'plate' | 'targeted'
  expectedResultCtCutOff?: string    // Plate-scope CT rule, e.g. "> 35"
  status?: 'Detected' | 'Not Detected' | 'Inconclusive'
  targets?: TargetedControlTarget[]  // Targeted-scope only
  plateFailureBehavior?: 'fail-plate' | 'warning-only'
  targetedFailureBehavior?: 'fail-plate' | 'fail-target' | 'warning-only'
}

interface TargetedControlTarget {
  id: string
  target: string       // Catalog name or placeholder "Organism 1" … "Organism 4"
  ctCutOff: string     // e.g. "≤ 35" — operators: `>` or `<=` only
  status: 'Detected' | 'Not Detected' | 'Inconclusive'
}
```

### 2.3 Default molecular controls (prototype)

| Control | Sample ID | Scope | Expected | Failure behavior |
|---------|-----------|-------|----------|------------------|
| Positive Control | `PC` | **targeted** | Organism 1–4: Detected | `fail-plate` |
| Negative Control | `NC` | **plate** | Not Detected | `fail-plate` |
| NTC | `NTC` | **plate** | Not Detected | `fail-plate` |
| Internal Control | `IC` | **plate** | Detected | `fail-plate` |

`Organism N` placeholders resolve to the Nth entry in `AVAILABLE_TARGETS` (e.g. Organism 1 → *Escherichia coli*).

### 2.4 Control scope semantics

**Plate scope (`scope: 'plate'`)**
- One control well applies to the **entire plate**.
- Pass criteria: every target row in the control well matches `status` (and optional CT cut-off).
- Example: NC well — all targets must be **Not Detected**.

**Targeted scope (`scope: 'targeted'`)**
- Control is evaluated per configured target list.
- For traditional PC wells: all configured targets must be present in the well and pass.
- For **target-style controls** in the file (see §4.2): only targets present in that well are evaluated.

### 2.5 Failure behaviors

| Setting | Effect |
|---------|--------|
| `plateFailureBehavior: fail-plate` | Failed plate control → can invalidate **all samples** on the plate |
| `targetedFailureBehavior: fail-plate` | Failed targeted control → invalidates all samples |
| `targetedFailureBehavior: fail-target` | Failed targeted control → invalidates only samples testing that target |
| `warning-only` | Failure flagged but does not block release (prototype maps to fail-plate in UI form) |

### 2.6 CT cut-off operators

Only two operators are supported: **`>`** (greater than) and **`<=`** (less than or equal to).

- `> N` → expected interpretation: **Not Detected**
- `<= N` → expected interpretation: **Detected**

Target master CT defaults live in `src/data/targetMaster.ts`. Per-target cut-offs can be merged in the Add Control modal.

---

## 3. File Upload & Field Mapping

### 3.1 Supported inputs

- CSV / spreadsheet upload
- User selects header row and data start row
- Plate size: 96 / 384 / 1536 wells

### 3.2 Mappable fields

| LIS field key | Label | Required |
|---------------|-------|----------|
| `well` | Well Position | No |
| `sampleId` | Sample ID | **Yes** |
| `target` | Target Name | **Yes** |
| `result` | Result (Ct/Cq) | **Yes** |
| `interpretation` | Interpretation | No |
| `ampStatus` | Amp Status | No |
| `viralLoad` | Viral Load | No |
| `plateId` | Plate ID | No |
| `thresholdValue` | Threshold Value | No |
| `reporterDye` | Reporter Dye | No |
| `cqConfidence` | Cq Confidence | No |

Auto-detected columns (not in mapping UI but parsed when present): Patient Name, Test Order, Panel, Is QC, QC Type, Target Type, Accession Number, Amp Score.

### 3.3 Preview & well selection

After mapping, the upload modal shows a **preview table**:

- Only **mapped** columns appear in preview.
- Checkbox on **Well Position** header selects/deselects all wells.
- Row checkboxes toggle selection **per well** (all targets in a well together).
- Rows with `validationStatus: Error` cannot be selected.
- **Continue to Validation** is disabled until at least one well is selected.

On continue:

1. Selected records are filtered from `sourceRecords`.
2. **Control wells are always included** for QC even if not selected.
3. `buildValidationData()` is re-run on the filtered set (plate QC, sample validity, views all reflect selection).

---

## 4. Control Detection in Uploaded Files

Controls in the results file are classified before validation runs.

### 4.1 Plate-style controls

Recognized when Sample ID is exactly:

- `PC`, `NC`, `NTC`, `IC`

Or when target name is `Positive Control`, `Negative Control`, `No Template Control`, `Internal Control`.

Also recognized when `Is QC` / `QC Type` columns flag the row as a control.

### 4.2 Target-style controls

Recognized when Sample ID matches a **prefix pattern**:

- `PC E`, `NC KP`, `PC …`, `NC …`, etc. (`/^(PC|NC|NTC|IC)\b/i` but not exact single-token IDs)

These represent **per-target controls** in the file — one organism/gene per well.

**Parsing rule:** If Sample ID implies a control type (`PC E` → PC) and no explicit QC flag exists, the row is auto-marked `isQc: true`.

### 4.3 Matching file controls to instrument config

`findControlConfigForWell()`:

1. Match by **control name** (`PC E` matches config name `PC` via prefix rules).
2. Else match by **control type** (Positive Control, Negative Control, etc.).

---

## 5. Interpretation Logic

Each result row gets an `interpretation`: `Detected` | `Not Detected` | `Passed` | `Inconclusive`.

### 5.1 When Interpretation column is mapped

Use **only** the mapped column value (`parseMappedInterpretation`). No CT fallback.

| Mapped value | Interpretation |
|--------------|----------------|
| Detected / Amp / Positive patterns | Detected |
| Not Detected / No Amp / Negative patterns | Not Detected |
| Inconclusive / Undetermined | Inconclusive |
| Empty | Inconclusive |

### 5.2 When Interpretation column is NOT mapped

Use **CT cut-off** per target:

```
if Ct is vague (empty, -, undetermined, ≤ 0) → Inconclusive
else if Ct ≤ cutOff → Detected
else → Not Detected
```

- Default cut-off: **35**
- Per-target cut-off from `targetMaster.ts` when available
- QC rows: inferred as `Passed` when appropriate

### 5.3 Amp Status

- Shown when mapped; used for display and inconclusive detection.
- `displayTargetInterpretation()` — inconclusive amp status overrides Ct-inferred Detected in UI.

---

## 6. Validation Logic

Validation runs in `buildValidationData()` and produces `ParsedUploadData`.

### 6.1 Pipeline

```
records (RawMolecularRow[])
    ↓
buildFileControlIndex()        — classify plate vs target controls in file
    ↓
evaluatePlateQcFromFileControls() — plate banner (PC/NC present & passed)
    ↓
buildSampleGroups()            — per-sample, per-target controlPassed
    ↓
buildPlateWellsFromRecords()   — per-well status, borders, drawer data
    ↓
apply sample invalidity to plate wells
```

### 6.2 Plate QC banner

Shown at top of **Plate View** when `plateViewReadiness.canFormPlate` is true.

For each control type (PC, NC, NTC, IC) configured on the instrument:

| Banner state | Condition |
|--------------|-----------|
| **PC Passed** / **NC Passed** | Control present in file (plate and/or target style) and all instances passed |
| **PC Missing** / **NC Missing** | Configured control type not found in file |
| **PC Failed** / **NC Failed** | Present but at least one instance failed |

Overall plate status:
- `QC Passed` — all present controls passed
- `Needs Review` — required control missing
- `Failed` — control present but failed

### 6.3 Per-target sample control validation (core rule)

Implemented in `isSampleTargetControlPassed(targetName, fileControlIndex)`.

The engine first scans the file and builds a `FileControlIndex`:

```typescript
interface FileControlIndex {
  hasPlateControls: boolean
  hasTargetControls: boolean
  plateControlsPassed: boolean
  targetByTarget: Map<normalizedTargetName, TargetControlEntry[]>
  // + per-type flags: hasPlatePc, platePcPassed, hasTargetPc, targetPcPassed, etc.
}
```

**Decision table for each sample target row:**

| Controls in file | Rule |
|------------------|------|
| **Plate only** | Sample target valid iff **all plate controls passed** |
| **Target only** | Sample target valid iff a **matching target control exists** for that target name **and passed** |
| **Both plate and target** | If matching target control exists → use **target control** result; else **fall back to plate control** |
| **Neither** | Valid (no QC constraint) |

**Target matching:** normalized target name equality (case-insensitive, trimmed).

**Target control pass criteria:**

| Control type | Expected |
|--------------|----------|
| PC, IC | Detected |
| NC, NTC | Not Detected |

Also respects instrument config CT cut-off when configured.

### 6.4 Plate-wide invalidation

When **plate controls fail** and config uses `fail-plate`:

```typescript
shouldInvalidateAllSamplesFromFileControls() → true
```

All sample targets are marked `controlPassed: false` regardless of per-target rules.

Target control failures with `fail-target` only affect samples testing that specific target.

### 6.5 LIS / report matching (separate from QC)

Per sample row (non-control):

| Check | Pass condition |
|-------|----------------|
| Sample Found | Sample ID in LIS registry **or** patient/test order in file |
| Report Found | LIS match **or** (patient + test order in file) |
| Unknown sample | Sample ID matching `/UNKNOWN/i` → **Failed** |

Validation errors on well:
- `Sample not found in LIS`
- `Report not found`

These do **not** affect control pass/fail but affect sample status (`Failed`, `Needs Review`) and release eligibility.

### 6.6 Sample validity aggregation

**Table View — sample level:**

```typescript
sampleValid = every(resultRow.controlPassed)
controlsPassed = every(resultRow.controlPassed)
```

**Plate View — well level:**

```typescript
wellInvalid = every target in well fails isSampleTargetControlPassed()
// OR plate-wide invalidation
```

Displayed as:
- Green border → valid sample well
- Red border → invalid sample well (`affectedByTargetedControlFailure`)
- Blue fill → control well
- Red border on control → `controlFailed`

### 6.7 Duplicate wells

If the same well position maps to multiple Sample IDs → `validationStatus: Warning` in preview; flagged in `validationSummary.duplicateWells`.

---

## 7. Plate View

**Component:** `PlateView.tsx`  
**Layout:** 8 × 12 grid (rows A–H, columns 1–12) for 96-well plates.

### 7.1 Well card types

| Type | Detection | Appearance |
|------|-----------|------------|
| **Empty** | No data for well | Dotted border, grey |
| **Control** | `status === 'control'`, `isQc`, `panel === 'Control'`, or control Sample ID | Blue background |
| **Sample** | All other non-empty wells | White background |

### 7.2 Borders & QC indicators

| Indicator | Meaning |
|-----------|---------|
| Green border | Sample valid / control passed |
| Red border | Sample invalid or control failed |
| Target dots (red/green/amber) | Per-target Detected / Not Detected / Inconclusive |

### 7.3 Well card content

- Sample ID (or control label)
- Target count
- Colored dots for target results

### 7.4 Interactions

- Click well → opens **Well Details** drawer (right panel).
- Sticky **plate QC banner** above grid when well column is mapped.

### 7.5 Plate view availability

`plateViewReadiness.canFormPlate` requires:

- Well Position column mapped, **or**
- Plate can be formed from row order (prototype fallback)

If unavailable, only Table View is useful.

### 7.6 Well Details drawer

Shows for selected well:

- Well information (Sample ID, patient, panel, etc.)
- **Target Information** table (result, interpretation, mapped metrics)
- **Control Validation** table (relevant PC/NC/NTC/IC for context)
- **Validation Errors** (LIS/report issues)
- QC badge: `QC Passed` | `QC Failed` | `QC Warning`

**Mapped metrics in Target Information** (shown as `NA` when column not mapped):

- Cq Confidence
- Reporter Dye
- Threshold Value
- Amp Status (when present in row data)

---

## 8. Table View

**Component:** `TableView.tsx`  
**Layout:** Expandable rows grouped by **Sample ID**.

### 8.1 Sample group header

| Field | Source |
|-------|--------|
| Sample ID | `SampleGroup.sampleId` |
| Patient | LIS lookup or file |
| Detected Targets count | Organisms detected |
| Sample Valid / Invalid badge | `SampleGroup.sampleValid` |
| Error message | e.g. `Sample not found in LIS` |

### 8.2 Expanded target rows

| Column | Description |
|--------|-------------|
| Well | Clickable → opens well in drawer |
| Plate ID | Plate identifier |
| Target | Target name |
| Result | Ct / Cq value |
| Interpretation | Detected / Not Detected / Inconclusive |
| Type | Organism / Gene |
| Amp Status | From file if mapped |
| Control Status | **Passed / Failed** per §6.3 |
| Action | Release (prototype placeholder) |

### 8.3 Selection

- Checkbox per sample group selects all target rows for that sample.
- Checkbox per row for individual well/target selection.
- Used by **Release Selected** action.

### 8.4 Search

Filters sample groups by Sample ID substring.

---

## 9. Release Actions

| Action | Behavior (prototype) |
|--------|----------------------|
| **Release Plate** | Confirmation modal; releases all samples |
| **Release Valid Only** | Releases samples where `sampleValid === true` |
| **Release Selected** | Releases checked rows in Table View |
| **Reject Plate** | UI placeholder |

`countReleaseableSamples()` and `countValidWells()` drive modal counts.

---

## 10. Data Model Summary

### ParsedUploadData (post-validation)

```typescript
interface ParsedUploadData {
  fileName: string
  previewRows: PreviewRow[]       // Selected rows only after continue
  sampleGroups: SampleGroup[]     // Table View data
  plateWells: WellData[]          // Plate View data (96 wells)
  qcBanner: QcBanner              // Plate QC summary
  plateSummary: PlateSummary
  validationSummary: ValidationSummary
  activityLog: ActivityLogEntry[]
  sourceRecords: RawMolecularRow[] // Full parsed file (for re-filter)
  plateSize: PlateSize
  mappedTargetMetrics: MappedTargetMetrics
  plateViewReadiness: PlateViewReadiness
}
```

### RawMolecularRow (one row per well × target)

Key fields: `well`, `sampleId`, `target`, `ct`, `interpretation`, `ampStatus`, `isQc`, `qcType`, `patient`, `testOrder`, `panel`, `type` (Organism/Gene/Control).

---

## 11. Production Implementation Notes

### 11.1 Replace prototype mocks

| Prototype | Production |
|-----------|------------|
| `localStorage` instrument controls | API + DB per lab/instrument |
| `lisSampleRegistry.ts` mock JSON | LIS patient/report API |
| `targetMaster.ts` static cut-offs | Lab target catalog service |
| Client-side file parse | Optional server-side parse + audit trail |

### 11.2 API suggestions

```
GET  /instruments/{id}/controls
PUT  /instruments/{id}/controls
POST /molecular/validate          — upload + map + validate
GET  /molecular/plates/{plateId}  — validation result
POST /molecular/plates/{plateId}/release
```

### 11.3 Validation must be deterministic

Engineering should implement `buildFileControlIndex` + `isSampleTargetControlPassed` exactly as specified in §6.3 — this is the business rule labs expect when files contain plate controls, target controls, or both.

### 11.4 Edge cases to test

| Scenario | Expected |
|----------|----------|
| File with only `PC`/`NC` plate wells | Plate QC drives all sample validity |
| File with only `PC E`, `NC KP` target controls | Per-target validity; no plate fallback for unmapped targets |
| File with both | Target match preferred; plate fallback for targets without target control |
| Plate NC fails (`fail-plate`) | All samples invalid |
| Target NC KP fails (`fail-target`) | Only *K. pneumoniae* samples invalid |
| Interpretation mapped | CT cut-off ignored for that column |
| Interpretation unmapped | CT cut-off per target |
| Partial well selection in preview | Only selected wells in views; controls always included for QC |
| Sample ID not in LIS, no patient in file | `Report not found` |

---

## 12. Reference: Default target catalog

From `AVAILABLE_TARGETS`:

1. *Escherichia coli*
2. *Klebsiella pneumoniae*
3. *Enterococcus faecalis*
4. *Proteus mirabilis*
5. *Staphylococcus aureus*
6. blaTEM
7. blaCTX-M
8. blaNDM-1
9. vanA
10. mecA

---

## 13. UI Navigation Map

| Nav item | Screen |
|----------|--------|
| Device Results Validation | Home → instrument cards → Upload |
| Instrument Management | Instrument list → detail → Controls tab |
| Molecular Validation | Table / Plate view after upload |

---

*Document version: aligned with prototype commit `3d4653e` (main).*

---

## Related documentation

- **[LIMS Implementation Guide](./lims-implementation-guide.md)** — Production implementation without mock/default data: APIs, database entities, migration checklist, and phasing.
