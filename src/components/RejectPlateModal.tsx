import { useState } from 'react'
import { Modal } from './ui/Modal'

/** Parent mounts this only while a rejection is being confirmed, so the reason resets on each open. */
interface RejectPlateModalProps {
  plateId: string
  sampleCount: number
  /** True when the plate already has a QC failure, so CAPA can be offered after rejection. */
  qcFailed: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function RejectPlateModal({
  plateId,
  sampleCount,
  qcFailed,
  onClose,
  onConfirm,
}: RejectPlateModalProps) {
  const [reason, setReason] = useState('')

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject Plate ${plateId}`}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={reason.trim().length === 0}
            title={reason.trim() ? undefined : 'A rejection reason is required for the audit trail'}
            className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Rejection
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-700">
          This will mark all {sampleCount} sample result{sampleCount === 1 ? '' : 's'} on Plate {plateId} as
          rejected. No results will be pushed to LIS reports.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Rejection Reason</span>
          <span className="text-[11px] text-red-500 ml-1">required</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this plate being rejected?"
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>
        <p className="text-[11px] text-slate-500">
          The reason and your name are recorded in this plate&apos;s audit trail.
          {qcFailed && ' You will be offered a CAPA form after rejecting — filling it is optional.'}
        </p>
      </div>
    </Modal>
  )
}
