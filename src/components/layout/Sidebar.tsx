import type { AppNav } from '../../types'

interface SidebarProps {
  activeItem?: AppNav
  onNavigate?: (id: AppNav) => void
  collapsed?: boolean
}

const navItems: Array<
  | { section: string }
  | { id: AppNav; label: string; icon: string; badge?: string }
> = [
  { id: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { section: 'Operation' },
  { id: 'device-validation', label: 'Device Results Validation', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z', badge: 'Beta' },
  { id: 'waiting', label: 'Waiting List', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'critical', label: 'Critical Callout Worklist', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { id: 'archives', label: 'Archives', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { id: 'inventory', label: 'Inventory Management', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'tat', label: 'TAT Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', badge: 'New' },
  { id: 'qc', label: 'Instrument Management', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
]

export function Sidebar({ activeItem = 'device-validation', onNavigate }: SidebarProps) {
  return (
    <aside className="w-[220px] bg-[#1e293b] text-slate-300 flex flex-col shrink-0 h-screen sticky top-0">
      <div className="px-3 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-bold">C</div>
          <span className="text-white text-sm font-semibold">CrelioHealth</span>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">PG</div>
          <div className="min-w-0">
            <div className="text-white text-xs font-medium truncate">Pratiksha Gori...</div>
            <div className="text-slate-400 text-[10px] truncate">#6284 - BioScience</div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-700/50 rounded text-[11px] text-slate-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Navigation Search
          <span className="ml-auto text-[9px] bg-slate-600 px-1 rounded">⌘K</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {navItems.map((item, i) => {
          if ('section' in item) {
            return (
              <div key={i} className="px-2 pt-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {item.section}
              </div>
            )
          }
          const isActive = item.id === activeItem
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate?.(item.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs mb-0.5 transition-colors ${
                isActive ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="truncate text-left flex-1">{item.label}</span>
              {item.badge && (
                <span className={`text-[9px] px-1 py-0 rounded font-medium ${item.badge === 'Beta' ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="px-3 py-2 border-t border-slate-700 space-y-1">
        {['Updates', 'Video Tutorial', 'Support'].map((label) => (
          <button key={label} className="w-full text-left text-[11px] text-slate-500 hover:text-slate-300 px-1 py-0.5">
            {label}
          </button>
        ))}
        <button className="w-full text-left text-[11px] text-slate-500 hover:text-slate-300 px-1 py-0.5 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          Collapse
        </button>
      </div>
    </aside>
  )
}
