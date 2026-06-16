import { useState } from 'react'
import type { ActivityLogEntry } from '../types'

interface ActivityLogProps {
  entries: ActivityLogEntry[]
}

export function ActivityLog({ entries }: ActivityLogProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-slate-200 rounded bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Activity Log
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{entries.length} events</span>
        </span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 py-2 space-y-1.5">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-slate-400 shrink-0 w-16">{entry.time}</span>
              <span className="text-slate-600">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
