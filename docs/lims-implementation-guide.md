# LIMS Implementation Guide — Molecular Device Validation

This guide is a **concrete example** of LIMS APIs and entities for molecular validation. For the **integration-agnostic architecture** (ports, configuration-driven QC, parse variability), start with [molecular-validation-engineering.md](./molecular-validation-engineering.md).

This guide defines how to implement **Molecular Device Results Validation** in production LIMS **without any prototype default or mock data**. The UI flows and validation rules are specified in [molecular-device-validation.md](./molecular-device-validation.md); this document defines **what the LIMS must own** and **one possible API shape** — adapt paths and schemas to your stack.

---

## 1. Core principle

> **Every value shown to the user must come from LIMS configuration, LIS records, or the uploaded instrument file — never from hardcoded prototype fallbacks.**

| Do not ship | Replace with |
|-------------|--------------|
| `instrumentManagementMockData.ts` | LIMS instrument + control config tables |
| `localStorage` instrument controls | Persisted per lab / instrument in DB |
| `lisSampleRegistry.ts` + `/demo/lis-samples.json` | LIS sample / order / patient lookup API |
| `targetMaster.ts` static CT map | Lab target catalog with CT cut-off per target |
| `AVAILABLE_TARGETS` hardcoded list | Targets linked to instrument panel / assay |
| `GENE_ABX` hardcoded map | LIMS resistance gene → antibiotic mapping |
| `mockData.ts` instrument cards | LIMS device registry + sync status |
| `waitingListMockData` / `reportEntryMockData` | LIMS report entry / waiting list APIs |
| `DEFAULT_TARGET_CT_CUTOFF = 35` | Explicit per-target or per-panel config; **block validation if missing** |
| Demo CSV files in `/public/demo` | Real instrument exports only |

---

## 2. System architecture (recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                        LIMS Frontend                             │
│  Instrument Mgmt │ Upload/Mapping │ Table View │ Plate View      │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST / GraphQL
┌────────────────────────────▼────────────────────────────────────┐
│                   Molecular Validation Service                     │
│  • Parse file (server-side)                                        │
│  • buildValidationData (port from prototype)                       │
│  • Persist plate run + validation snapshot                         │
└─────┬──────────────┬──────────────┬──────────────┬──────────────┘
      │              │              │              │
      ▼              ▼              ▼              ▼
 Instrument      Target /         LIS Sample      Report
 Config DB       Panel DB         Order DB        Entry DB
```

**Recommendation:** Run validation on the **server**, not only in the browser. The prototype logic in `buildValidationData.ts`, `sampleControlValidation.ts`, `interpretation.ts`, and `parseMolecularFile.ts` should be ported to a shared module (TypeScript backend or equivalent in your stack).

---

## 3. LIMS data domains

### 3.1 Instrument registry

**Purpose:** Device Results Validation home screen — list instruments available for upload.

**Prototype mock:** `mockData.ts` → `instruments[]`

**LIMS entity:** `instrument` (or `device`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | Display name |
| `instrumentType` | enum | Must identify molecular vs other |
| `isMolecular` | boolean | Enables molecular validation flow |
| `connectionStatus` | enum | Connected / Disconnected |
| `enabled` | boolean | |
| `authKey` | string | Instrument interface key (if applicable) |
| `qcLastSync` | datetime | From instrument sync job |
| `paramsLastSync` | datetime | |
| `lastUploadedPlateId` | string | nullable |
| `pendingValidationCount` | int | Plates awaiting validation |

**API:**

```
GET /api/labs/{labId}/instruments?type=molecular
```

**Empty state:** If no instruments configured, show setup message — do not inject default molecular instrument.

---

### 3.2 Instrument control configuration

**Purpose:** Instrument Management → Controls tab. Drives all QC validation.

**Prototype mock:** `instrumentManagementMockData.ts` + `instrumentStorage.ts` (localStorage)

**LIMS entities:**

- `instrument_control` — one row per control definition
- `instrument_control_target` — child rows for targeted-scope controls

| Field | Type | Required |
|-------|------|----------|
| `id` | UUID | yes |
| `instrumentId` | FK | yes |
| `controlType` | enum | Positive Control, Negative Control, NTC, Internal Control, Extraction Control |
| `control` | string | Sample ID label in file (e.g. `PC`, `NC`) |
| `scope` | enum | `plate` \| `targeted` |
| `status` | enum | Detected / Not Detected / Inconclusive (plate scope) |
| `expectedResultCtCutOff` | string | e.g. `<= 35`, `> 40` |
| `plateFailureBehavior` | enum | `fail-plate` \| `warning-only` |
| `targetedFailureBehavior` | enum | `fail-plate` \| `fail-target` \| `warning-only` |

**Targeted control targets** (`instrument_control_target`):

| Field | Type |
|-------|------|
| `id` | UUID |
| `controlId` | FK |
| `targetId` | FK → lab target catalog (not free text "Organism 1") |
| `ctCutOff` | string |
| `status` | Detected / Not Detected / Inconclusive |

**APIs:**

```
GET    /api/instruments/{instrumentId}/controls
POST   /api/instruments/{instrumentId}/controls
PUT    /api/instruments/{instrumentId}/controls/{controlId}
DELETE /api/instruments/{instrumentId}/controls/{controlId}
```

**Rules:**

- No default PC/NC/NTC/IC seeded on instrument create — lab configures explicitly.
- Targeted PC must reference **real target IDs** from the lab catalog, not placeholder names like "Organism 1" unless your catalog uses those aliases with explicit mapping.
- `Organism N` placeholder resolution (prototype) must become **explicit target FK** in LIMS.

---

### 3.3 Target / panel catalog

**Purpose:** Control target picker, CT cut-off for interpretation, organism vs gene classification.

**Prototype mock:** `AVAILABLE_TARGETS`, `targetMaster.ts`

**LIMS entity:** `molecular_target` (or reuse existing analyte/organism master)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `name` | string | Canonical name as in instrument file |
| `aliases` | string[] | Alternate spellings for matching |
| `type` | enum | Organism \| Gene \| Control |
| `ctCutOff` | decimal | Required for unmapped interpretation |
| `ctCutOffOperator` | enum | `<=` or `>` |
| `panelId` | FK | nullable — scope to assay panel |
| `enabled` | boolean | |

**API:**

```
GET /api/labs/{labId}/molecular-targets?panelId={panelId}
GET /api/molecular-targets/{targetId}
```

**Critical:** When interpretation column is **not** mapped in the upload file, validation **must** use `ctCutOff` from this catalog. If cut-off is missing:

- Do **not** fall back to `35`.
- Mark row as `Needs Review` or block validation with configuration error.

---

### 3.4 Resistance gene → antibiotic mapping

**Purpose:** Table View columns "Resistant Antibiotics" / "Sensitive Antibiotics".

**Prototype mock:** `GENE_ABX` in `buildValidationData.ts`

**LIMS entity:** `resistance_gene_antibiotic` (or clinical decision support table)

| Field | Type |
|-------|------|
| `geneTargetId` | FK |
| `antibioticName` | string |
| `effect` | enum | resistant \| sensitive |

**API:**

```
GET /api/molecular-targets/{geneTargetId}/antibiotic-mapping
```

Return `—` when no mapping exists — do not invent values.

---

### 3.5 LIS sample / order lookup

**Purpose:** Match uploaded Sample ID to patient, test order, panel; drive "Report not found" / "Sample not found" errors.

**Prototype mock:** `lisSampleRegistry.ts`, `/demo/lis-samples.json`

**LIMS:** Query existing LIS tables (accession, order, patient).

**Lookup input:** `sampleId` (+ optional `labId`, `testOrder`)

**Lookup output:**

| Field | Type |
|-------|------|
| `sampleId` | string |
| `patientName` | string |
| `patientId` | string |
| `testOrderId` | string |
| `panelName` | string |
| `accessionNumber` | string |
| `reportId` | string | nullable — molecular report to update |
| `reportStatus` | enum | |

**API:**

```
GET /api/lis/samples/lookup?sampleId={id}&labId={labId}
POST /api/lis/samples/batch-lookup   { sampleIds: string[] }
```

**Rules:**

- No in-memory default registry.
- If sample not found **and** file has no patient/test order columns → `Report not found`.
- `UNKNOWN*` sample IDs → `Sample not found in LIS` (configurable pattern per lab).

**Batch lookup:** Call once per plate after parse for performance (prototype does per-row lookup).

---

### 3.6 Field mapping templates

**Purpose:** Remember column mappings per instrument / file format.

**Prototype:** User maps each upload manually; auto-detect from headers only.

**LIMS entity:** `instrument_field_mapping_template`

| Field | Type |
|-------|------|
| `instrumentId` | FK |
| `templateName` | string |
| `mappings` | JSON | `{ well: "Well Position", sampleId: "Sample Name", ... }` |
| `headerRowIndex` | int |
| `dataStartRowIndex` | int |
| `plateSize` | 96 \| 384 \| 1536 |

**API:**

```
GET  /api/instruments/{instrumentId}/mapping-templates
POST /api/instruments/{instrumentId}/mapping-templates
```

On upload, pre-apply saved template if file headers match.

---

### 3.7 Plate run & validation snapshot

**Purpose:** Persist upload, selection, validation results, release state.

**LIMS entities:**

**`molecular_plate_run`**

| Field | Type |
|-------|------|
| `id` | UUID |
| `plateId` | string |
| `instrumentId` | FK |
| `runDate` | date |
| `fileName` | string |
| `uploadedBy` | user FK |
| `uploadedAt` | datetime |
| `qcStatus` | enum |
| `validationStatus` | enum |
| `releasedAt` | datetime | nullable |
| `sourceFileStorageKey` | string | S3/path to raw file |

**`molecular_plate_well_result`**

| Field | Type |
|-------|------|
| `plateRunId` | FK |
| `wellPosition` | string |
| `sampleId` | string |
| `targetId` | FK |
| `ctValue` | string |
| `interpretation` | enum |
| `ampStatus` | string |
| `controlPassed` | boolean |
| `selected` | boolean |
| `isControl` | boolean |

**APIs:**

```
POST /api/molecular/plate-runs/validate
  Body: { instrumentId, file, mappings, selectedWellIds[], plateId, plateSize }
  Response: ParsedUploadData equivalent (see §5)

GET  /api/molecular/plate-runs/{id}
POST /api/molecular/plate-runs/{id}/release
  Body: { mode: 'plate' | 'valid-only' | 'selected', sampleIds?, wellKeys? }
```

---

### 3.8 Report entry / waiting list

**Purpose:** "Send Results" flow from upload modal.

**Prototype mock:** `waitingListMockData.ts`, `reportEntryMockData.ts`

**LIMS:** Existing report entry / partial result workflow.

**API:**

```
POST /api/molecular/plate-runs/{id}/send-to-report
  Body: { reportEntryId? | sampleId, previewRows[] }
  Response: { reportEntryId, patientName, status }
```

Resolve report entry by sample/order from LIS — never fabricate patient names.

---

## 4. Validation engine — porting checklist

Port these modules **as-is** (business logic), but inject LIMS data via parameters:

| Module | Inject from LIMS |
|--------|------------------|
| `parseMolecularFile.ts` | Mappings from template API |
| `interpretation.ts` | `getTargetCtCutOff(targetId)` from catalog |
| `sampleControlValidation.ts` | `instrumentControls[]` from DB |
| `controlEvaluation.ts` | `catalogTargets[]` from panel API |
| `buildValidationData.ts` | `lookupSample()`, `GENE_ABX`, all config |

### Refactor signature (recommended)

```typescript
interface MolecularValidationContext {
  instrumentId: string
  instrumentControls: InstrumentControlConfig[]
  catalogTargets: MolecularTarget[]          // id, name, ctCutOff, type
  lookupSample: (sampleId: string) => Promise<LisSampleRecord | null>
  getGeneAntibioticMapping: (targetId: string) => GeneAntibioticMapping | null
  panelId?: string
}

function buildValidationData(
  input: BuildInput,
  ctx: MolecularValidationContext,
): ParsedUploadData
```

Remove all imports from `data/*Mock*` and `lisSampleRegistry` defaults.

---

## 5. API response shape (validate endpoint)

Match prototype `ParsedUploadData` so the frontend can be reused:

```typescript
{
  plateRunId: string
  fileName: string
  plateSummary: { plateId, device, runDate, totalWells, mappedSamples, controls, errors }
  validationSummary: { validSamples, unknownSampleIds, duplicateWells, missingControls }
  qcBanner: {
    pcPassed, ncPassed, pcPresent, ncPresent, qcPassed, status,
    failedControlWells: [{ wellId, controlType, sampleId, label }]
  }
  sampleGroups: SampleGroup[]
  plateWells: WellData[]
  previewRows: PreviewRow[]
  activityLog: ActivityLogEntry[]
  plateViewReadiness: { canFormPlate, wellColumnMapped, plateIdAvailable, message? }
  mappedTargetMetrics: { thresholdValue, reporterDye, cqConfidence }
}
```

Store `sourceRecords` server-side; return `plateRunId` for subsequent release/send actions.

---

## 6. UI behaviour with no default data

| Screen | Empty / missing config behaviour |
|--------|----------------------------------|
| Device Results Validation home | No instruments → "Configure instruments in Instrument Management" |
| Instrument Management | No controls → "Add controls before validating plates" |
| Upload → mapping | Required fields (Sample ID, Target, Result) must be mapped |
| Upload → preview | No rows → error from parser |
| Validation → plate banner | PC/NC Missing when controls configured but absent in file |
| Target cut-off missing | Row interpretation = Inconclusive or validation blocked |
| LIS lookup miss | `Report not found` / `Needs Review` — not auto-pass |

---

## 7. Configuration migration from prototype

Do **not** copy `managedInstruments` defaults into production seed data. Instead:

1. Lab admin creates molecular instrument in LIMS.
2. Lab admin defines controls (PC, NC, etc.) per SOP.
3. Lab admin links panel targets with CT cut-offs.
4. Lab admin saves field mapping template per instrument export format.
5. Validation runs only when steps 1–3 are complete for that instrument.

Optional: one-time import tool reading prototype JSON **per lab** — not global defaults.

---

## 8. Security & audit

| Requirement | Implementation |
|-------------|----------------|
| File storage | Encrypted object store; retention policy |
| Audit trail | Who uploaded, validated, released each plate |
| Control config changes | Version history; re-validation flag on change |
| Release | Requires permission role; log sample IDs released |
| PHI | Patient names from LIS only; no client-side registry cache across sessions |

---

## 9. Testing without mock data

Use **fixture factories** in tests only (not production):

1. Create instrument + controls via API in test setup.
2. Create targets with explicit CT cut-offs.
3. Insert LIS sample/order records in test DB.
4. Upload real anonymized instrument CSV fixture.
5. Assert validation output JSON.

Separate `tests/fixtures/` from `src/data/` — never import test fixtures in app code.

---

## 10. Implementation phases

### Phase 1 — Foundation
- Instrument registry API
- Control configuration CRUD (persisted)
- Target catalog with CT cut-offs
- LIS sample batch lookup

### Phase 2 — Validation
- Server-side file parse + `buildValidationData`
- Plate run persistence
- Table View + Plate View from API response

### Phase 3 — Workflow
- Well selection on upload
- Release plate / valid only / selected
- Send to report entry
- Audit logging

### Phase 4 — Hardening
- Mapping templates
- Control config versioning
- Instrument sync status
- Performance (batch LIS lookup, large 384/1536 plates)

---

## 11. Prototype files — production disposition

| File | Action |
|------|--------|
| `data/instrumentManagementMockData.ts` | **Delete** — replace with API client |
| `data/mockData.ts` | **Delete** — replace with instrument list API |
| `data/lisSampleRegistry.ts` | **Replace** with `api/lisSampleService.ts` |
| `data/targetMaster.ts` | **Replace** with target catalog API |
| `data/waitingListMockData.ts` | **Replace** with waiting list API |
| `data/reportEntryMockData.ts` | **Replace** with report entry API |
| `utils/instrumentStorage.ts` | **Delete** — use DB |
| `public/demo/*` | **Remove** from production build |
| `buildValidationData.ts` | **Port** to server; inject context |
| `sampleControlValidation.ts` | **Port** unchanged |
| `molecular-device-validation.md` | **Keep** as functional spec |

---

## 12. Open decisions for product / LIMS team

1. **Global vs per-panel CT cut-off** when target appears on multiple panels?
2. **Required controls** — must every configured control type exist in every file, or only those enabled for the panel?
3. **Partial plate upload** — confirm well selection + auto-include controls is acceptable for regulated workflow.
4. **Release to LIS** — update existing report vs create new molecular result segment?
5. **Target-style controls** (`PC E`, `NC KP`) — support as convention or require explicit control mapping table?

Document decisions in LIMS config; validation engine reads flags from DB, not code constants.

---

*Companion spec: [molecular-device-validation.md](./molecular-device-validation.md)*
