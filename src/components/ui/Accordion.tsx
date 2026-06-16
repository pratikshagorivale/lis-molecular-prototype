import { useState } from 'react'

interface AccordionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  variant?: 'default' | 'highlight'
}

export function Accordion({ title, children, defaultOpen = false, variant = 'default' }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const isHighlight = variant === 'highlight'

  return (
    <div className={`border rounded ${isHighlight ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-700 ${
          isHighlight ? 'hover:bg-blue-50/50' : 'bg-slate-50 hover:bg-slate-100 font-medium'
        }`}
      >
        {title}
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className={`p-3 ${isHighlight ? 'border-t border-blue-100' : 'border-t border-slate-200'}`}>{children}</div>}
    </div>
  )
}
