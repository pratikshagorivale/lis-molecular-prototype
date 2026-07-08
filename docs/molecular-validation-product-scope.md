# Product Scope: Molecular Device Results Validation

**Document type:** Feature scoping & requirements  
**Audience:** Product, Engineering, QA, Lab operations  
**Status:** Draft for LIMS implementation  
**Related prototype:** Device Results Validation → Molecular Instrument

---

## 1. Executive summary

Labs running molecular PCR instruments need to **upload instrument result files**, **validate sample and control quality**, and **release results into the LIS** without manual spreadsheet review.

This feature provides:

1. **Instrument Management** — configure QC controls for each molecular device  
2. **Results upload & preview** — map file columns, select wells, continue to validation  
3. **Table View** — sample-centric review of all targets and control status  
4. **Plate View** — well-plate visual review with QC banner and well details  
5. **Validation logic** — automated interpretation, control checks, and LIS matching  
6. **Release** — release plate, valid samples only, or selected samples  

**Production constraint:** All configuration and patient/sample data must come from **LIMS** (instruments, controls, targets, orders, reports). No hardcoded lab data.

---

## 2. Problem statement

| Pain today | This feature solves |
|------------|---------------------|
| Technologists manually check PC/NC and sample IDs in Excel | Automated QC and LIS matching on upload |
| No single view of plate layout + per-target results | Plate View and Table View from same validated dataset |
| Control rules vary by instrument and panel | Per-instrument control configuration in Instrument Management |
| Invalid samples may be released | Clear valid/invalid state before release |
| Files use different column names | Flexible field mapping per instrument |

---

## 3. Users & personas

| Persona | Goal |
|---------|------|
| **Lab technologist** | Upload plate file, review QC, release valid results |
| **Lab supervisor** | Review failed plates, override or reject |
| **Lab admin** | Configure instruments, controls, and target cut-offs |
| **LIS admin** | Ensure released results update correct reports |

---

## 4. Feature scope

### In scope (MVP)

- Molecular instrument upload (CSV/spreadsheet)
- Field mapping (well, sample ID, target, result, optional interpretation/amp status)
- Preview with per-well selection
- Control configuration (Instrument Management)
- Table View and Plate View
- Plate QC banner (PC, NC status)
- Per-sample and per-target validation
- LIS sample/report matching
- Release plate / release valid only
- Activity log for upload and QC summary

### Out of scope (MVP)

- Non-molecular instrument types (hematology, chemistry, etc.) — separate flows
- Automated instrument polling / HL7 ingest (upload remains manual for MVP)
- Re-run or reflex ordering from validation screen
- Electronic signature / dual approval (unless LIMS already provides)
- Custom report PDF generation
- Multi-plate batch upload in one session

### Future considerations

- Saved mapping templates per instrument
- Control config version history
- Partial plate re-validation after control repeat
- Integration with instrument middleware

---

## 5. User journeys

### Journey A — Configure instrument (Lab admin)

1. Open **Instrument Management** in left navigation  
2. Select molecular instrument  
3. Open **Controls** tab  
4. Add/edit controls (PC, NC, NTC, IC)  
5. Define scope (plate or targeted), expected result, failure behaviour  
6. Save — configuration applies to all future validations for that instrument  

### Journey B — Validate a plate (Technologist)

1. Open **Device Results Validation**  
2. Select molecular instrument → **Upload Results**  
3. Select file; map columns; set plate ID and size if needed  
4. Review preview; select wells to include  
5. **Continue to Validation**  
6. Review **Table View** or **Plate View**  
7. Check plate QC banner and invalid samples  
8. **Release Valid Only** or **Release Plate**  

### Journey C — Investigate failed well (Supervisor)

1. Open Plate View  
2. Click well with red border  
3. Review Well Details: targets, control validation, validation errors  
4. Decide: reject result, map sample manually, or repeat control  

---

## 6. Instrument Management — Control configuration

### 6.1 Purpose

Define how the system evaluates **quality controls** in uploaded files for a specific molecular instrument. Controls are **not** hardcoded — each lab configures them per device and SOP.

### 6.2 Control types

| Type | Typical use |
|------|-------------|
| **Positive Control (PC)** | Confirms amplification works (expected Detected) |
| **Negative Control (NC)** | Confirms no contamination (expected Not Detected) |
| **NTC (No Template Control)** | No template added (expected Not Detected) |
| **Internal Control (IC)** | Sample processing control (expected Detected) |
| **Extraction Control** | Optional; lab-defined |

### 6.3 Control configuration fields

| Field | Description | Required |
|-------|-------------|----------|
| Control type | PC, NC, NTC, IC, etc. | Yes |
| Control name | Sample ID label in file (e.g. `PC`, `NC`, `PC E`) | Yes |
| Scope | **Plate** or **Targeted** | Yes |
| Expected result | Detected / Not Detected / Inconclusive | Yes (plate scope) |
| CT cut-off | Optional rule (e.g. ≤ 35) | No |
| Failure behaviour | Fail plate / Fail target only / Warning only | Yes |
| Target list | For targeted scope — which targets and expected result per target | If targeted |

### 6.4 Scope types

**Plate control**  
- One control well applies to the **entire plate**  
- Example: NC well — all targets in that well must be Not Detected  

**Targeted control**  
- Control is evaluated for **specific targets**  
- Example: PC must show Detected for configured organism targets  
- Can also appear in file as **target-style controls** (e.g. `PC E` for *E. coli*, `NC KP` for *K. pneumoniae*)

### 6.5 Failure behaviour

| Setting | When control fails |
|---------|-------------------|
| **Fail plate** | All samples on plate marked invalid for release |
| **Fail target only** | Only samples testing that target marked invalid |
| **Warning only** | Flagged for review; does not auto-invalidate samples |

### 6.6 Acceptance criteria — Control configuration

- [ ] Lab admin can add, edit, and remove controls per molecular instrument  
- [ ] No default controls pre-loaded in production — empty until configured  
- [ ] Plate and targeted scope both supported  
- [ ] Targeted controls reference targets from lab target catalog (not hardcoded list)  
- [ ] Changes to control config apply to **new** uploads (existing plate runs retain snapshot at validation time)  
- [ ] Control name matching supports exact names and prefixes (e.g. config `PC` matches file `PC E`)

---

## 7. Upload & preview

### 7.1 Required file mappings

| Field | Required |
|-------|----------|
| Sample ID | Yes |
| Target name | Yes |
| Result (Ct/Cq) | Yes |
| Well position | No (required for Plate View) |
| Interpretation | No |
| Amp status | No |
| Plate ID | No |
| Threshold value, reporter dye, Cq confidence | No |

### 7.2 Preview behaviour

- Shows only columns that are mapped  
- User selects wells via checkbox on **Well Position** (select all / per well)  
- Rows with blocking errors cannot be selected  
- **Continue to Validation** requires at least one well selected and plate ID  
- Control wells are **always included** in validation even if not selected (for QC)

### 7.3 Acceptance criteria — Upload

- [ ] Supports CSV/spreadsheet with configurable header and data start row  
- [ ] Supports 96 / 384 / 1536 well plates  
- [ ] Auto-suggest column mapping from headers  
- [ ] Preview reflects mapping changes in real time  
- [ ] Well selection filters what appears in Table/Plate view after continue  

---

## 8. Table View

### 8.1 Purpose

Sample-centric review — best for checking many samples, searching by Sample ID, and reviewing per-target control status before release.

### 8.2 Layout

**Grouped by Sample ID** — expandable sections.

**Sample header shows:**
- Sample ID, patient name (from LIS or file)  
- Detected target count  
- **Sample Valid** or **Sample Invalid** badge  
- Error message if applicable (e.g. sample not found in LIS)  

**Expanded rows (one per well × target):**

| Column | Description |
|--------|-------------|
| Well | Clickable — opens well details |
| Plate ID | |
| Target | Organism or gene name |
| Result | Ct/Cq value |
| Interpretation | Detected / Not Detected / Inconclusive |
| Type | Organism / Gene |
| Amp status | From file if mapped |
| Control status | **Passed** or **Failed** (per validation logic §10) |
| Action | Release (per row), overflow menu |

### 8.3 Interactions

- Search/filter by Sample ID  
- Checkbox per sample (all targets) or per row  
- **Overview** button opens well details for first well of sample  
- Expand/collapse sample groups  

### 8.4 Acceptance criteria — Table View

- [ ] All selected wells appear grouped by Sample ID  
- [ ] Sample Valid = all target rows pass control validation  
- [ ] Control status shown per target row  
- [ ] Failed LIS match shows error on sample header  
- [ ] Row selection supports “Release Selected”  

---

## 9. Plate View

### 9.1 Purpose

Spatial review of the physical plate — best for identifying which wells failed QC and inspecting controls in well context.

### 9.2 Availability

Plate View requires **Well Position** mapped in upload. If not mapped, user sees Table View only (with message).

### 9.3 Plate QC banner

Sticky banner above plate grid when in Plate View:

| Display | Meaning |
|---------|---------|
| **PC Passed** | Positive control(s) in file passed |
| **PC Failed** | Positive control(s) present but failed |
| **PC Missing** | Configured PC not found in file |
| **NC Passed / Failed / Missing** | Same for negative control |
| **Valid** badge | Overall plate QC passed |
| **Needs review** badge | QC missing or failed |

Only control types **configured** for the instrument are shown.

### 9.4 Well grid

Standard 8×12 layout (96-well); scales for 384/1536.

**Well appearance:**

| Element | Meaning |
|---------|---------|
| Empty well | Grey dotted — no data |
| Blue well | Control well |
| White well | Sample well |
| Green border | Valid (control passed for that well’s targets) |
| Red border | Invalid (control failed or sample invalidated) |
| Coloured dots | Per-target result: red = Detected, green = Not Detected, amber = Inconclusive |
| Sample ID label | On well card |
| Target count | Number of targets in well |

### 9.5 Well details panel (on well click)

**Sections:**
1. **Well information** — Sample ID, patient, panel, test order  
2. **Target information** — per target: result, interpretation, optional metrics (Cq confidence, reporter dye, threshold — shown only if mapped in file)  
3. **Control validation** — relevant PC/NC results for context  
4. **Validation errors** — e.g. Report not found  
5. **Actions** — Reject, Map manually, Release (context-dependent)  

**QC badge on panel:** QC Passed / QC Failed / QC Warning

### 9.6 Acceptance criteria — Plate View

- [ ] Grid matches plate size selected at upload  
- [ ] Unselected wells appear empty  
- [ ] Control wells visually distinct from sample wells  
- [ ] Red border consistent with Table View valid/invalid state  
- [ ] Banner reflects controls found in **this upload** (not stale from full file if wells deselected)  
- [ ] Well details match selected well data  

---

## 10. Validation logic

This is the core business logic engineering must implement identically in LIMS.

### 10.1 Result interpretation

Each row gets an interpretation: **Detected**, **Not Detected**, **Inconclusive**, or **Passed** (controls).

**If Interpretation column is mapped in file:**  
Use file value only. Do not infer from Ct.

**If Interpretation column is NOT mapped:**  
Infer from Ct using **target-specific cut-off** from lab catalog:

| Condition | Interpretation |
|-----------|----------------|
| Ct empty, undetermined, or invalid | Inconclusive |
| Ct ≤ cut-off | Detected |
| Ct > cut-off | Not Detected |

> **Product rule:** Cut-off must be configured per target in LIMS. No silent global default in production.

### 10.2 Control types in uploaded file

The system recognises two forms of controls in the instrument file:

| Form | Example | Description |
|------|---------|-------------|
| **Plate control** | Sample ID = `PC`, `NC` | Traditional single-well controls |
| **Target control** | Sample ID = `PC E`, `NC KP` | Per-target control in a sample well |

Target-style IDs are recognised by prefix: `PC …`, `NC …`, etc.

### 10.3 Control validation — decision rules

When validating **each sample target**, the system checks what controls exist **in the uploaded file**:

```
┌─────────────────────────────────────────────────────────────┐
│  What controls are in the file?                              │
├─────────────────┬───────────────────────────────────────────┤
│  Plate only     │  Use plate control pass/fail for all       │
│                 │  sample targets                            │
├─────────────────┼───────────────────────────────────────────┤
│  Target only    │  Sample target valid only if a matching  │
│                 │  target control exists AND passed          │
├─────────────────┼───────────────────────────────────────────┤
│  Both present   │  IF target control exists for this       │
│                 │  target → use target control               │
│                 │  ELSE → use plate control                  │
├─────────────────┼───────────────────────────────────────────┤
│  Neither        │  No QC gate (valid unless other rules fail) │
└─────────────────┴───────────────────────────────────────────┘
```

**Target matching:** Sample target name must match control target name (normalised spelling).

**Target control pass criteria:**

| Control type | Must be |
|--------------|---------|
| PC, IC | Detected |
| NC, NTC | Not Detected |

### 10.4 Plate-wide failure

If a **plate control** fails and its configuration is **Fail plate**:

- **All samples** on the plate are marked invalid  
- All sample wells show red border in Plate View  
- Release Valid Only releases zero samples  

Target control failure with **Fail target only** invalidates only samples testing that target.

### 10.5 LIS / report validation (separate from QC)

| Check | Pass | Fail message |
|-------|------|--------------|
| Sample in LIS | Sample ID found in LIS | Sample not found in LIS |
| Report linkage | LIS match OR patient + test order in file | Report not found |
| Unknown pattern | — | Sample IDs flagged as unknown |

LIS failures affect sample **status** (Failed / Needs Review) but are separate from control pass/fail.

### 10.6 Aggregated validity

| Level | Valid when |
|-------|------------|
| **Target row** | Control validation passed (§10.3) |
| **Sample** | All target rows valid |
| **Well (plate)** | All targets in that well valid |
| **Plate** | Plate QC banner passed (controls present and passed per config) |

### 10.7 Duplicate wells

Same well position assigned to multiple Sample IDs → warning in preview; flagged in validation summary.

### 10.8 Acceptance criteria — Validation logic

- [ ] Interpretation follows mapped vs unmapped rules  
- [ ] Plate and target controls detected from file automatically  
- [ ] Target control preferred over plate control when both exist  
- [ ] Plate fail invalidates all samples when configured  
- [ ] Target fail invalidates only affected targets when configured  
- [ ] Table and Plate views show consistent valid/invalid state  
- [ ] LIS errors shown without masking QC status  

---

## 11. Release actions

| Action | Behaviour |
|--------|-----------|
| **Release Plate** | Release all samples on validated plate (including invalid — confirm dialog) |
| **Release Valid Only** | Release only samples where all targets passed control + LIS checks |
| **Release Selected** | Release checked rows from Table View |
| **Reject Plate** | Mark plate rejected; no LIS update (MVP: UI placeholder acceptable) |

Release writes results to LIS molecular report / result entry (exact integration per LIMS design).

### Acceptance criteria — Release

- [ ] Release Valid Only count shown in confirmation modal  
- [ ] Invalid samples excluded from valid-only release  
- [ ] Release auditable (who, when, which samples)  

---

## 12. Non-functional requirements

| Area | Requirement |
|------|-------------|
| **Data** | No hardcoded patients, samples, targets, or controls in production |
| **Performance** | Validate 96-well plate < 10 seconds server-side |
| **Audit** | Log upload, validation outcome, release |
| **Security** | Role-based access; PHI from LIS only |
| **Accessibility** | Keyboard navigation for table; well grid clickable targets |

---

## 13. Empty & error states

| State | User message / behaviour |
|-------|--------------------------|
| No instruments configured | Direct to Instrument Management |
| No controls configured | Warn before validation; QC banner shows Missing |
| No wells selected | Disable Continue |
| Well not mapped | Plate View unavailable; Table View works |
| All samples invalid | Release Valid Only disabled or shows 0 |
| File parse error | Show specific column/row error |

---

## 14. Success metrics

| Metric | Target |
|--------|--------|
| Time from upload to release (valid plate) | Reduce vs manual Excel review |
| % plates released without supervisor escalation | Increase |
| QC failure caught before release | 100% of configured fail-plate controls |
| User-reported mismatched Table vs Plate | Zero |

---

## 15. Dependencies

| Dependency | Owner |
|------------|-------|
| Molecular target catalog with CT cut-offs | LIMS / Lab admin |
| Instrument registry | LIMS admin |
| LIS sample & order lookup API | LIS team |
| Molecular report entry for release | LIS team |
| Instrument export file format documentation | Lab / vendor |

---

## 16. Open questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Are all configured control types required in every file, or only those enabled for the panel? | QC Missing rules |
| 2 | What happens when CT cut-off is not configured for a target? | Block vs Needs Review |
| 3 | Should partial well selection be allowed for regulated release, or require full plate? | Upload UX |
| 4 | Does release update an existing report or create a new result segment? | LIS integration |
| 5 | Is manual override of invalid samples in scope for MVP? | Supervisor journey |

---

## 17. Milestones (suggested)

| Phase | Deliverable |
|-------|-------------|
| **M1** | Instrument Management + control configuration |
| **M2** | Upload, mapping, preview, well selection |
| **M3** | Validation engine + Table View |
| **M4** | Plate View + well details |
| **M5** | Release + LIS integration + audit |

---

## 18. Glossary

| Term | Definition |
|------|------------|
| **Ct / Cq** | Cycle threshold — PCR amplification measure |
| **Plate control** | QC well applying to entire plate (e.g. NC) |
| **Target control** | QC well for a specific target (e.g. PC E) |
| **Target** | Organism or resistance gene assayed |
| **Panel** | Set of targets run together (e.g. UTI Panel) |
| **Well** | Single position on plate (e.g. A1) |

---

*For engineering API and data model detail, see [molecular-validation-engineering.md](./molecular-validation-engineering.md) (architecture & ports) and [lims-implementation-guide.md](./lims-implementation-guide.md) (example API checklist). For prototype behaviour reference, see [molecular-device-validation.md](./molecular-device-validation.md).*
