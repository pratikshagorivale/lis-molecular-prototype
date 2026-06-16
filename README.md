# LIS Molecular Results Prototype

High-fidelity clickable prototype for Molecular Result Upload and Plate-wise Validation. Supports **real file upload** for demos (CSV, XLS, XLSX).

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Demo with Your Google Sheet

1. Export your sheet: **File → Download → Microsoft Excel (.xlsx)** or **CSV**
2. Click **Upload Results** on the Molecular Instrument card — your OS file picker opens
3. Select the exported file from your device
4. In the upload modal, review **Field Mapping** — adjust dropdowns if columns weren't auto-detected
5. Click **Apply Mappings** → preview table, plate summary, and validation summary populate
6. Click **Continue to Validation** → Table View and Plate View show your file data

### Expected columns (flexible names)

The parser auto-detects headers. Use any of these names:

| Required | Accepted header names |
|----------|----------------------|
| Well | `Well`, `Well Position`, `Position` |
| Sample ID | `Sample ID`, `Sample`, `Accession`, `Specimen ID` |
| Target | `Target`, `Target Name`, `Parameter`, `Organism`, `Gene` |
| Ct (optional) | `Ct`, `Ct Value`, `Result`, `Result_1` |
| Interpretation (optional) | `Interpretation`, `Call`, `Status` |

### Map sample IDs to patients (for demo)

Edit `public/demo/lis-samples.json` to add your sample IDs before the demo:

```json
{
  "134121": { "patient": "Jane Doe", "panel": "UTI Panel" },
  "134122": { "patient": "John Doe", "panel": "UTI Panel" }
}
```

- IDs in this file → **Ready for Release** with patient name
- IDs not in file (but valid format) → **Needs Review**
- IDs containing `UNKNOWN` → **Failed**

### Filename metadata (optional)

Filenames like `QS5_UTI_28OCT2024_MU1.xlsx` auto-fill:

- Device: `QS5`
- Run date: `28 Oct 2024`
- Plate ID: `MU1`

## Built-in Demo File

Click **Load Demo File** in the upload modal to use `public/demo/QS5_UTI_28OCT2024_MU1.csv` without selecting a file.

## Workflow

1. **Device Results Validation** → Upload Results
2. **Upload modal** → Select your exported file or Load Demo File
3. **Continue to Validation** → Table View / Plate View
4. Click wells for details → Release Plate / Release Selected
