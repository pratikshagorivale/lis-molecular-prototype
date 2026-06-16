import { useEffect } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-slate-200 shrink-0">{footer}</div>}
      </div>
    </>
  )
}
