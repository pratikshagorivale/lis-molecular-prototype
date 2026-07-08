# Engineering Design: Molecular Device Results Validation

**Document type:** Technical design for LIMS implementation  
**Audience:** Engineering, architecture, QA  
**Companion docs:**  
- [Product scope](./molecular-validation-product-scope.md) — requirements & acceptance criteria  
- [Prototype behaviour reference](./molecular-device-validation.md) — UI/logic as demonstrated in prototype  

**Important:** This design does **not** assume your LIMS API shapes, database schema, or transport layer. It defines **boundaries**, **configuration models**, and **pipelines** so validation behaviour can vary with control setup and parsed file content without rewriting the UI.

---

## 1. Design goals

| Goal | Approach |
|------|----------|
| **Unknown LIMS APIs** | Hexagonal architecture — validation core depends on **ports** (interfaces), LIMS team implements **adapters** |
| **Varying control rules** | Configuration-driven QC engine reads instrument control definitions at runtime |
| **Varying file formats** | Parse pipeline produces a canonical row model; mapping + optional instrument plugins |
| **Consistent UI** | Table View and Plate View consume a **validation snapshot** (immutable result DTO), not raw files |
| **Auditable releases** | Persist config snapshot + parsed rows + outcomes per plate run |
| **Testable** | Golden tests per (control config × file fixture × expected snapshot) |

---

## 2. Architectural overview

```
                    ┌──────────────────────────────────────┐
                    │           LIMS Frontend               │
                    │  Instrument Mgmt │ Upload │ Views    │
                    └───────────────────┬──────────────────┘
                                        │
                          ValidationSnapshot (DTO)
                                        │
┌───────────────────────────────────────▼───────────────────────────────────────┐
│                        Molecular Validation Core (domain)                        │
│                                                                                  │
│  ┌─────────────┐   ┌──────────────────┐   ┌─────────────────────────────────┐ │
│  │ Parse       │──▶│ Interpret        │──▶│ QC / Sample validation          │ │
│  │ Pipeline    │   │ Pipeline         │   │ (configuration-driven)          │ │
│  └─────────────┘   └──────────────────┘   └─────────────────────────────────┘ │
│         │                    │                              │                    │
│         └────────────────────┴──────────────────────────────┘                    │
│                                    │                                             │
│                          buildValidationSnapshot()                               │
└────────────────────────────────────┼─────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│ Port:           │      │ Port:               │      │ Port:               │
│ Instrument      │      │ Target catalog      │      │ LIS lookup          │
│ config          │      │ & panel             │      │ (your APIs)         │
└────────┬────────┘      └──────────┬──────────┘      └──────────┬──────────┘
         │                          │                          │
         ▼                          ▼                          ▼
   LIMS adapter(s)            LIMS adapter(s)            LIMS adapter(s)
   (your implementation)      (your implementation)      (your implementation)
```

**Rule:** The validation core must not import LIMS-specific code. It receives plain configuration objects and calls port interfaces.

---

## 3. Canonical domain models

These types are **transport-agnostic**. Map from your DB/DTOs in adapters.

### 3.1 Parsed row (output of parse pipeline)

One record per **well × target** (flattened instrument export).

```typescript
interface ParsedRow {
  rowId: string              // stable id within this parse
  wellPosition: string | null  // null if unmapped — plate grid may synthesize positions
  sampleId: string
  targetName: string
  resultValue: string | number  // Ct/Cq raw
  interpretation?: Interpretation // only if mapped column supplied
  interpretationSource: 'mapped' | 'inferred' | 'control'
  ampStatus?: string
  viralLoad?: string
  isControl: boolean
  controlType?: 'PC' | 'NC' | 'NTC' | 'IC' | null
  controlLabel?: string        // raw sample id e.g. "PC E"
  targetType?: 'Organism' | 'Gene' | 'Control'
  // Optional context from file (not LIS)
  patientName?: string
  testOrderId?: string
  panelName?: string
  plateId?: string
  // Optional instrument metrics (only if columns mapped)
  thresholdValue?: string
  reporterDye?: string
  cqConfidence?: string
}
```

**Why this matters:** All downstream validation reads `ParsedRow[]`, not CSV cells. Different instruments → same model.

### 3.2 Instrument control configuration

```typescript
interface ControlConfig {
  id: string
  instrumentId: string
  controlType: 'Positive Control' | 'Negative Control' | 'NTC' | 'Internal Control' | 'Extraction Control'
  controlName: string           // matches file sample id (exact or prefix rules)
  scope: 'plate' | 'targeted'
  expectedInterpretation?: 'Detected' | 'Not Detected' | 'Inconclusive'
  ctCutOffRule?: string         // e.g. "<= 35", "> 40" — lab-defined grammar
  failureScope: 'fail-plate' | 'fail-target' | 'warning-only'
  targetedRules?: TargetedControlRule[]
  matchingStrategy?: 'exact' | 'prefix' | 'regex'  // how controlName matches file ids
}

interface TargetedControlRule {
  targetRef: TargetRef       // id or catalog key — resolved via target port
  expectedInterpretation: 'Detected' | 'Not Detected' | 'Inconclusive'
  ctCutOffRule?: string
}
```

**Behaviour varies entirely from this config** — see §6.

### 3.3 Target catalog entry (from LIMS, not file)

```typescript
interface TargetRef {
  id: string
  canonicalName: string
  aliases: string[]
  type: 'Organism' | 'Gene' | 'Control'
  panelIds?: string[]
}

interface TargetInterpretationPolicy {
  targetRef: TargetRef
  ctCutOffRule: string | null   // required when interpretation not mapped in file
  missingCutOffBehaviour: 'block' | 'inconclusive' | 'needs-review'
}
```

### 3.4 Validation snapshot (input to Table View & Plate View)

Immutable output of one validation run. **UI must only render this object.**

```typescript
interface ValidationSnapshot {
  plateRunId: string
  meta: {
    fileName: string
    instrumentId: string
    plateId: string
    plateSize: 96 | 384 | 1536
    runDate?: string
    validatedAt: string
    configSnapshotId: string    // hash/version of controls + policies used
  }
  qcSummary: PlateQcSummary
  sampleGroups: SampleGroupVM[]   // Table View
  plateWells: PlateWellVM[]       // Plate View
  previewRows: PreviewRowVM[]     // optional — selected rows only
  validationSummary: {
    validSampleCount: number
    unknownSampleCount: number
    duplicateWellCount: number
    missingControlCount: number
  }
  activityLog: { at: string; message: string }[]
  capabilities: {
    canShowPlateView: boolean
    mappedMetrics: { thresholdValue: boolean; reporterDye: boolean; cqConfidence: boolean }
  }
}
```

Persist the full snapshot (or reproducible inputs + `configSnapshotId`) for audit.

---

## 4. Ports (interfaces your LIMS must implement)

No HTTP paths prescribed — implement in your stack.

### 4.1 `InstrumentConfigPort`

```typescript
interface InstrumentConfigPort {
  getInstrument(instrumentId: string): Promise<InstrumentMeta>
  listControls(instrumentId: string): Promise<ControlConfig[]>
  getControlConfigSnapshot(instrumentId: string): Promise<{
    snapshotId: string
    controls: ControlConfig[]
    capturedAt: string
  }>
}
```

Used: at validation start — load controls **for that instrument at that time**.

### 4.2 `TargetCatalogPort`

```typescript
interface TargetCatalogPort {
  resolveByName(name: string, context: { panelId?: string; instrumentId: string }): Promise<TargetRef | null>
  getInterpretationPolicy(targetRef: TargetRef): Promise<TargetInterpretationPolicy>
  listTargetsForPanel(panelId: string): Promise<TargetRef[]>
}
```

Used: interpretation inference, targeted control rule expansion, target name normalisation.

### 4.3 `LisLookupPort`

```typescript
interface LisLookupPort {
  lookupSample(sampleId: string, context: LisContext): Promise<LisSampleContext | null>
  batchLookup(sampleIds: string[], context: LisContext): Promise<Map<string, LisSampleContext>>
}

interface LisSampleContext {
  sampleId: string
  patientName?: string
  testOrderId?: string
  panelName?: string
  accessionNumber?: string
  reportId?: string | null
  eligibility?: 'releasable' | 'hold' | 'not-found'
}
```

Used: sample/report validation — **orthogonal** to QC (§7).

### 4.4 `GeneAnnotationPort` (optional)

```typescript
interface GeneAnnotationPort {
  getAntibioticMapping(targetRef: TargetRef): Promise<{
    resistant?: string
    sensitive?: string
  } | null>
}
```

### 4.5 `PlateRunRepository` (optional persistence port)

```typescript
interface PlateRunRepository {
  save(snapshot: ValidationSnapshot, source: { rawFileRef: string; parsedRows: ParsedRow[] }): Promise<string>
  load(plateRunId: string): Promise<ValidationSnapshot>
}
```

### 4.6 `ReleasePort` (your LIMS workflow)

```typescript
interface ReleasePort {
  release(params: ReleaseRequest): Promise<ReleaseResult>
}
```

Implementation is entirely LIMS-specific.

---

## 5. Parse pipeline

Parsing is **separate** from validation. Output must depend only on:

- Raw file bytes  
- User mapping (which column → which field)  
- Parse options (header row, data start, plate size, delimiter)  
- Optional **instrument parse profile** (future: vendor-specific pre-processor)

### 5.1 Stages

```
Raw file
  → [1] Sheet/CSV reader
  → [2] Header detection (user override)
  → [3] Column binding (mapping template)
  → [4] Row normalisation (trim, well format A1 vs A01)
  → [5] Control row detection (see §5.2)
  → [6] ParsedRow[]
```

### 5.2 Control detection in parsed data (file-driven)

Controls are identified from **parsed content**, not assumed wells:

| Signal | Example |
|--------|---------|
| Explicit QC flag column | `Is QC = Y` |
| QC type column | `QC Type = PC` |
| Sample ID pattern | `PC`, `NC`, `PC E`, `NC KP` |
| Target name pattern | `Positive Control`, `Negative Control` |

Detection rules should be **configurable per instrument** (e.g. `controlDetectionProfile`) so new vendor formats do not require core code changes.

```typescript
interface ControlDetectionProfile {
  plateStyleIds: string[]           // exact: PC, NC
  targetStylePrefixPattern: string  // regex for PC E, NC KP
  qcFlagColumnValues: string[]
  targetNamePatterns: string[]
}
```

**Parsed `isControl` / `controlType` are inputs to QC engine** — if detection is wrong, QC will be wrong. Unit-test detection separately.

### 5.3 Well position

| Mapping state | Plate View behaviour |
|---------------|---------------------|
| Well column mapped | Use file positions |
| Well not mapped | Either disable plate view **or** assign synthetic positions (document lab policy) |

Prototype assigns synthetic positions when unmapped — production should make this **explicit config**, not implicit.

### 5.4 Mapped vs available fields

Only fields present in mapping (or auto-detected optional columns) populate `ParsedRow`. UI shows `NA` for unmapped metrics (threshold, reporter dye, Cq confidence).

**Validation logic must not assume** optional fields exist — branch on `undefined`.

---

## 6. Interpretation pipeline

Runs on each `ParsedRow` **before** QC and LIS checks.

### 6.1 Decision flow

```
For each ParsedRow:
  if row.interpretationSource == 'mapped':
    use mapped interpretation rules (amp status synonyms, inconclusive, etc.)
  else if row.isControl:
    apply control interpretation rules (Passed / Detected / Not Detected)
  else:
    resolve target via TargetCatalogPort
    if no ctCutOffRule configured:
      apply missingCutOffBehaviour from policy
    else:
      infer Detected | Not Detected | Inconclusive from resultValue + ctCutOffRule
```

### 6.2 CT cut-off grammar

Support a **small explicit grammar** (prototype uses `<=` and `>`):

| Rule | Meaning |
|------|---------|
| `<= N` | Detected if Ct ≤ N |
| `> N` | Detected if Ct > N (typically used for NC-style rules) |

Parser returns pass/fail + optional inconclusive for non-numeric Ct.

**Do not hardcode N=35** — always from `TargetInterpretationPolicy` or control config.

### 6.3 Variability

| Uploaded file has | Interpretation behaviour |
|-------------------|-------------------------|
| Interpretation column mapped | File wins; CT ignored for that row |
| Only Ct column | Inferred per target policy |
| Both mapped | Interpretation column wins (product rule) |
| Amp status inconclusive | UI may show Inconclusive even if Ct inferred Detected |

---

## 7. QC validation engine (configuration-driven)

This is the most variable part. Design as **three phases** with explicit inputs/outputs.

### Phase A — Index controls found **in the file**

Build `FileControlIndex` from `ParsedRow[]` + `ControlConfig[]`:

```
For each well group in parsed rows:
  classify well as: plate-control | target-control | sample
  if control:
    match to ControlConfig (name / type / matchingStrategy)
    evaluate well pass/fail against config (scope, expected, ct rules)
    record per-target entries for target-style controls
```

**Output:**

```typescript
interface FileControlIndex {
  hasPlateControls: boolean
  hasTargetControls: boolean
  plateControlsPassed: boolean
  targetByCanonicalTarget: Map<string, TargetControlResult[]>
  failedWells: FailedControlRecord[]
  presenceByType: { PC: PresenceResult; NC: PresenceResult; ... }
}
```

`PresenceResult = { configured: boolean; found: boolean; passed: boolean }`

Plate banner (PC Missing / Passed / Failed) derives from `presenceByType` + config (which types are required).

### Phase B — Per-sample-target control gate

For each **sample** `ParsedRow` (non-control), compute `controlPassed`:

```typescript
function resolveControlPassed(
  targetName: string,
  index: FileControlIndex,
  policy: ControlResolutionPolicy,
): boolean
```

**Default policy** (from product spec — make swappable):

| `index.hasPlate` | `index.hasTarget` | Rule |
|------------------|-------------------|------|
| yes | no | `plateControlsPassed` |
| no | yes | matching target control exists **and** passed |
| yes | yes | if matching target control → use it; else `plateControlsPassed` |
| no | no | `true` (no QC gate) |

```typescript
interface ControlResolutionPolicy {
  mode: 'product-default' | 'plate-only' | 'target-only' | 'custom'
  customResolver?: (ctx: ControlResolutionContext) => boolean
}
```

Labs with different SOPs can supply `customResolver` without forking Table/Plate UI.

### Phase C — Failure propagation

For each failed control, read `ControlConfig.failureScope`:

| failureScope | Effect |
|--------------|--------|
| `fail-plate` | Set `plateInvalidated = true` → all sample rows `controlPassed = false` |
| `fail-target` | Only rows whose canonical target matches failed target control |
| `warning-only` | Flag in `qcSummary`; do not auto-fail samples |

**Order matters:** evaluate all control wells → build index → apply per-target gates → apply plate-wide invalidation last.

### 6.1 How configuration changes behaviour (examples)

**Example 1 — Plate NC only**  
Config: one NC plate control, fail-plate. File: `NC` well all Not Detected.  
→ `plateControlsPassed = true`; samples use plate gate.

**Example 2 — Target controls only**  
Config: PC targeted (no plate NC). File: `PC E` / *E. coli* Detected, `NC KP` / *K. pneumoniae* Not Detected.  
→ Index has only target controls. *E. coli* samples gated by PC E; *K. pneumoniae* by NC KP; other targets **fail** unless policy extended.

**Example 3 — Both**  
File has plate `NC` + target `PC E`. Sample *E. coli* → use PC E if present, else plate NC. Sample *blaNDM* → plate NC only.

**Example 4 — Targeted PC fail-target**  
PC fails for Organism A only → only Organism A sample rows invalid; plate remains valid for release of other targets (if LIS allows partial release).

Engineering must implement these as **data-driven outcomes**, not one-off `if (labId)` branches.

---

## 8. LIS / sample validation (parallel track)

Runs **after** interpretation; **independent** of `controlPassed` unless product ties release to both.

```typescript
interface SampleValidationResult {
  sampleId: string
  lisFound: boolean
  reportFound: boolean
  sampleStatus: 'ready' | 'needs-review' | 'failed'
  errors: string[]
}
```

| Check | Typical pass condition |
|-------|------------------------|
| Sample found | `LisLookupPort` returns record |
| Report found | `reportId` present **or** (patient + test order in file) |
| Unknown ID pattern | Lab-configured regex → failed |

Aggregate:

```typescript
sampleValid = all(rows.controlPassed) && lisEligible
// OR product may separate QC valid vs LIS valid — document in ReleasePort rules
```

Prototype combines QC into `sampleValid`; production may split columns in Table View.

---

## 9. Building view models

### 9.1 `buildValidationSnapshot()` orchestration

```typescript
async function buildValidationSnapshot(input: {
  parsedRows: ParsedRow[]
  selectedRowIds: Set<string>
  instrumentId: string
  plateId: string
  plateSize: number
  ports: {
    instrumentConfig: InstrumentConfigPort
    targets: TargetCatalogPort
    lis: LisLookupPort
    geneAnnotation?: GeneAnnotationPort
  }
  policies?: {
    controlResolution?: ControlResolutionPolicy
    controlDetection?: ControlDetectionProfile
  }
}): Promise<ValidationSnapshot>
```

Steps:

1. Load control config snapshot  
2. Filter rows by selection; **always merge control rows** for QC  
3. Run interpretation on all rows  
4. Batch LIS lookup for unique sample IDs  
5. Build `FileControlIndex`  
6. Compute per-row `controlPassed`  
7. Apply fail-plate propagation  
8. Group into `sampleGroups` (Table View)  
9. Project into `plateWells` grid (Plate View)  
10. Compute `qcSummary` banner  
11. Attach `configSnapshotId`  

### 9.2 Table View projection

- Group `ParsedRow` by `sampleId` (exclude controls from sample groups)  
- Each row: well, target, result, interpretation, `controlPassed`, amp status  
- Sample header: `sampleValid = every(row.controlPassed)` ∧ LIS rules  
- Gene columns via `GeneAnnotationPort` if implemented  

### 9.3 Plate View projection

- Fixed grid `plateSize`  
- Map well position → well card  
- Unselected wells → empty  
- Control wells → `cardType: control`  
- Sample wells → border valid/invalid from per-well target results  
- Target dots from interpreted results  

**Single source of truth:** recomputing Table and Plate from same `ParsedRow[]` + same index prevents drift.

### 9.4 Well details drawer

Derived from selected `PlateWellVM` + global `FileControlIndex` + relevant `ControlConfig[]`:

- Target rows for well  
- Control validation table: filter controls relevant to well (prototype: NC/PC aggregate + targeted fail-target filter)  
- Validation errors from LIS pass  

---

## 10. Well selection (upload → validation)

When user continues from preview:

1. Filter `ParsedRow` to selected wells  
2. Union all control rows from **full parse** (QC must see controls even if user deselected those wells)  
3. Re-run `buildValidationSnapshot` on filtered set  

Persist both:

- `userSelectedWellIds`  
- `rowsUsedForValidation` (including auto-included controls)  

---

## 11. Instrument Management UI (engineering notes)

CRUD on `ControlConfig` via your APIs. Client-side validation before save:

- `controlName` non-empty  
- Targeted scope requires ≥1 `targetedRules`  
- `ctCutOffRule` parses successfully  
- No duplicate `(controlType, controlName)` per instrument  

On save: bump config version / `snapshotId` — do not mutate snapshots referenced by completed plate runs.

---

## 12. Extension points (avoid core forks)

| Extension | Use when |
|-----------|----------|
| `ControlDetectionProfile` | New vendor sample ID conventions |
| `ControlResolutionPolicy` | Lab SOP differs from default plate/target priority |
| `TargetNameNormalizer` | Alias lists insufficient |
| `InterpretationStrategy` | Non-Ct result types (e.g. viral load thresholds) |
| `InstrumentParseProfile` | Pre-process vendor-specific file layout |
| `ReleasePort` | LIS release workflow varies by test type |

Register extensions per `instrumentId` in LIMS config — not hardcoded in validation core.

---

## 13. Configuration snapshot & audit

Every validation run stores:

```json
{
  "plateRunId": "...",
  "configSnapshotId": "sha256(controls + policies + panelId)",
  "controls": [ /* full ControlConfig[] at validation time */ ],
  "mapping": { /* column mapping */ },
  "selection": { "wellIds": [] },
  "fileHash": "..."
}
```

Re-running validation with same inputs + snapshot must produce **identical** `ValidationSnapshot` (deterministic engine).

---

## 14. Error handling

| Failure | Handling |
|---------|----------|
| Parse error | Fail fast; no partial snapshot |
| Target not in catalog | Row: `needs-review`; interpretation may be inconclusive |
| Missing CT policy | Configurable: block plate vs inconclusive |
| LIS timeout | Retry + degrade to `needs-review` (policy) |
| No controls configured | `qcSummary` reports missing; product defines if validation allowed |
| Empty selection | Reject before `buildValidationSnapshot` |

---

## 15. Testing strategy

### 15.1 Unit tests (no LIMS)

- CT cut-off parser  
- Control name matching (`PC` vs `PC E`)  
- `FileControlIndex` builder  
- `resolveControlPassed` for each policy mode  
- Interpretation: mapped vs inferred  

### 15.2 Configuration matrix tests

Define cases as data:

```yaml
name: target-control-only E coli passes
controls: [...]
rows: [...]
expect:
  sampleGroups[0].sampleValid: true
  qcSummary.nc.present: false
```

### 15.3 Adapter contract tests

Mock `InstrumentConfigPort`, `TargetCatalogPort`, `LisLookupPort` — verify snapshot shape.

### 15.4 Golden snapshots

Full `ValidationSnapshot` JSON compared to fixture — catches Table/Plate projection regressions.

---

## 16. Prototype → production mapping

Reference implementation lives in this repo (TypeScript). Suggested module mapping:

| Prototype module | Production module |
|------------------|-------------------|
| `parseMolecularFile.ts` | `parse/` pipeline |
| `interpretation.ts` | `interpretation/` strategies |
| `sampleControlValidation.ts` | `qc/FileControlIndex` + resolver |
| `controlEvaluation.ts` | `qc/ControlEvaluator` |
| `buildValidationData.ts` | `buildValidationSnapshot.ts` |
| `filterUploadBySelection.ts` | `selection/applyWellSelection.ts` |
| `PlateView.tsx` / `TableView.tsx` | Render `ValidationSnapshot` only |

**Refactor for production:**

- Replace static imports (`targetMaster`, `AVAILABLE_TARGETS`) with ports  
- Inject `ControlResolutionPolicy`  
- Split LIS checks from QC in view model if product requires separate columns  

---

## 17. Open engineering decisions

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Server-only vs client validation | Server authoritative; client preview optional |
| 2 | Synthetic well assignment when unmapped | Off by default in production |
| 3 | Partial release per target | Depends on LIS `ReleasePort`; QC already supports per-target invalid |
| 4 | Config versioning | Immutable snapshots per plate run |
| 5 | Plugin host language | Same as LIMS backend; expose extension registry in DB |

---

## 18. Minimal API surface (illustrative only)

Your LIMS defines real endpoints. The core only needs **capabilities**:

```
loadInstrumentControls(instrumentId)
resolveTargets(names[], panelId)
lookupSamples(sampleIds[])
validate(plateRunRequest) → ValidationSnapshot
release(plateRunId, mode)
```

Request/response shapes should match §3.4 `ValidationSnapshot` — internal DTOs stable even when REST paths differ.

---

## 19. Sequence diagram — validate plate

```
Technologist    Frontend       Validation Core      Ports (LIMS)
    |              |                  |                  |
    |-- upload ---->|                  |                  |
    |              |-- parse file --->|                  |
    |              |<-- ParsedRow[] --|                  |
    |-- continue -->|                  |                  |
    |              |-- validate ----->|                  |
    |              |                  |-- get controls -->|
    |              |                  |<-- ControlConfig[]|
    |              |                  |-- batch LIS ---->|
    |              |                  |<-- sample map ----|
    |              |                  |-- interpret ----> (internal)
    |              |                  |-- QC index -----> (internal)
    |              |<-- Snapshot -----|                  |
    |<-- Table/Plate|                  |                  |
```

---

*This document intentionally avoids binding to Crelio LIMS APIs. Implement ports in your service layer; keep validation rules configuration-driven so control setup and parsed file content determine outcomes.*
