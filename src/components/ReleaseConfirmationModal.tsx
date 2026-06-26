import { Modal } from './ui/Modal'

interface ReleaseConfirmationModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  mode: 'plate' | 'selected' | 'valid-only'
  plateId: string
  validCount?: number
  totalCount?: number
}

export function ReleaseConfirmationModal({
  open,
  onClose,
  onConfirm,
  mode,
  plateId,
  validCount = 0,
  totalCount = 0,
}: ReleaseConfirmationModalProps) {
  const message = mode === 'plate'
    ? `This will push all ${totalCount} sample result${totalCount === 1 ? '' : 's'} from Plate ${plateId} to matching LIS reports, including samples that need review or have errors.`
    : mode === 'valid-only'
      ? validCount > 0
        ? `This will push ${validCount} valid sample result${validCount === 1 ? '' : 's'} from Plate ${plateId} to matching LIS reports. Samples requiring review, with errors, or that failed validation will be excluded.`
        : `No valid sample results are available to release on Plate ${plateId}. Valid results are samples marked Ready for Release.`
      : `This will push the selected validated results from Plate ${plateId} to matching LIS reports.`
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Release Molecular Results"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={mode === 'valid-only' && validCount === 0}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Release
          </button>
        </div>
      }
    >
      <div className="p-4">
        <p className="text-sm text-slate-700">{message}</p>
        {mode === 'valid-only' && totalCount > 0 && (
          <p className="text-xs text-slate-600 mt-2">
            {validCount} of {totalCount} sample{totalCount === 1 ? '' : 's'} on this plate {validCount === 1 ? 'is' : 'are'} ready for release.
          </p>
        )}
        <p className="text-xs text-slate-500 mt-2">
          This action cannot be undone. Please verify all results before releasing.
        </p>
      </div>
    </Modal>
  )
}
