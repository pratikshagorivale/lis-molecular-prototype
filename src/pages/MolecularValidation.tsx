import { useState } from 'react'
import { TableView } from '../components/TableView'
import { PlateView } from '../components/PlateView'
import { Badge } from '../components/ui/Badge'
import type { FailedControlWell, ParsedUploadData, WellData } from '../types'

function failedWellsText(failed: FailedControlWell[] | undefined, controlType: string): string {
  const wells = (failed ?? []).filter((f) => f.controlType === controlType)
  if (wells.length === 0) return ''
  return wells.map((f) => `Well ${f.wellId} (${f.label})`).join(', ')
}

interface MolecularValidationProps {
  uploadData: ParsedUploadData
  onBack: () => void
  onWellClick: (well: WellData) => void
  onReleasePlate: () => void
  onReleaseSelected: () => void
}

export function MolecularValidation({ uploadData, onBack, onWellClick, onReleasePlate, onReleaseSelected }: MolecularValidationProps) {
  const [view, setView] = useState<'table' | 'plate'>('table')
  const [search, setSearch] = useState('')

  const { plateSummary, qcBanner, sampleGroups, plateWells } = uploadData
  const plateId = plateSummary.plateId

  const qcBannerClasses = qcBanner.qcPassed || qcBanner.status === 'QC Passed'
    ? 'bg-emerald-50 border-emerald-200'
    : qcBanner.status === 'Failed'
      ? 'bg-red-50 border-red-200'
      : 'bg-amber-50 border-amber-200'

  const qcBannerTitleClasses = qcBanner.qcPassed || qcBanner.status === 'QC Passed'
    ? 'text-emerald-800'
    : qcBanner.status === 'Failed'
      ? 'text-red-800'
      : 'text-amber-800'

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1">
          <button onClick={onBack} className="hover:text-blue-600">Device Result Validation</button>
          <span>/</span>
          <span>Molecular Instrument</span>
          <span>/</span>
          <span className="text-slate-700 font-medium">Plate {plateId}</span>
        </div>
        <h1 className="text-base font-semibold text-slate-800">Molecular Results Validation</h1>
      </header>

      {view === 'plate' && (
      <div className={`sticky top-0 z-10 border-b px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs shrink-0 ${qcBannerClasses}`}>
        <span className={`font-semibold ${qcBannerTitleClasses}`}>Plate {plateId}</span>
        {qcBanner.pcPresent ? (
          <span className={qcBanner.pcPassed ? 'text-emerald-700' : 'text-red-700'}>
            {qcBanner.pcPassed
              ? 'Positive Control Passed'
              : `Positive Control Failed${failedWellsText(qcBanner.failedControlWells, 'PC') ? ` — ${failedWellsText(qcBanner.failedControlWells, 'PC')}` : ''}`}
          </span>
        ) : (
          <span className="text-amber-700">Positive Control Missing</span>
        )}
        {qcBanner.ncPresent ? (
          <span className={qcBanner.ncPassed ? 'text-emerald-700' : 'text-red-700'}>
            {qcBanner.ncPassed
              ? 'Negative Control Passed'
              : `Negative Control Failed${failedWellsText(qcBanner.failedControlWells, 'NC') ? ` — ${failedWellsText(qcBanner.failedControlWells, 'NC')}` : ''}`}
          </span>
        ) : (
          <span className="text-amber-700">Negative Control Missing</span>
        )}
        {qcBanner.ntcPresent && (
          <span className={qcBanner.ntcPassed ? 'text-emerald-700' : 'text-red-700'}>
            {qcBanner.ntcPassed
              ? 'NTC Passed'
              : `NTC Failed${failedWellsText(qcBanner.failedControlWells, 'NTC') ? ` — ${failedWellsText(qcBanner.failedControlWells, 'NTC')}` : ''}`}
          </span>
        )}
        {qcBanner.icPresent && (
          <span className={qcBanner.icPassed ? 'text-emerald-700' : 'text-red-700'}>
            {qcBanner.icPassed
              ? 'Internal Control Passed'
              : `Internal Control Failed${failedWellsText(qcBanner.failedControlWells, 'IC') ? ` — ${failedWellsText(qcBanner.failedControlWells, 'IC')}` : ''}`}
          </span>
        )}
        {(qcBanner.failedControlWells?.length ?? 0) > 0 && (
          <span className="text-red-800 font-medium basis-full">
            Failed control wells: {qcBanner.failedControlWells.map((f) => `${f.wellId} (${f.label})`).join(', ')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          Status:{' '}
          <Badge variant={
            qcBanner.qcPassed || qcBanner.status === 'QC Passed'
              ? 'success'
              : qcBanner.status === 'Failed'
                ? 'error'
                : 'warning'
          }>
            {qcBanner.qcPassed ? 'QC Passed' : qcBanner.status}
          </Badge>
        </span>
      </div>
      )}

      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by Sample ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-2 py-1.5 border border-slate-200 rounded text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white">
          <option>Filter by Plate: {plateId}</option>
        </select>
        <div className="flex-1" />
        <button className="px-2.5 py-1.5 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50">
          Reject Selected
        </button>
        {view === 'table' && (
          <button onClick={onReleaseSelected} className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
            Release Selected
          </button>
        )}
        {view === 'plate' && (
          <button onClick={onReleasePlate} className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
            Release Plate
          </button>
        )}
        <div className="flex items-center border border-slate-200 rounded overflow-hidden ml-auto">
          <button
            onClick={() => setView('table')}
            className={`px-2.5 py-1.5 text-xs ${view === 'table' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Table View
          </button>
          <button
            onClick={() => setView('plate')}
            className={`px-2.5 py-1.5 text-xs ${view === 'plate' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Plate View
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {view === 'table' ? (
          <TableView
            groups={sampleGroups}
            plateWells={plateWells}
            onWellOpen={onWellClick}
            searchQuery={search}
          />
        ) : (
          <PlateView wells={plateWells} onWellClick={onWellClick} />
        )}
      </div>
    </div>
  )
}
