import { Modal } from './ui/Modal'

interface ReleaseConfirmationModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  mode: 'plate' | 'selected'
  plateId: string
}

export function ReleaseConfirmationModal({ open, onClose, onConfirm, mode, plateId }: ReleaseConfirmationModalProps) {
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
          <button onClick={onConfirm} className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
            Confirm Release
          </button>
        </div>
      }
    >
      <div className="p-4">
        <p className="text-sm text-slate-700">
          {mode === 'plate'
            ? `This will push all validated results from Plate ${plateId} to matching LIS reports.`
            : `This will push the selected validated results from Plate ${plateId} to matching LIS reports.`}
        </p>
        <p className="text-xs text-slate-500 mt-2">
          This action cannot be undone. Please verify all results before releasing.
        </p>
      </div>
    </Modal>
  )
}
