import { Sidebar } from './Sidebar'
import type { AppNav } from '../../types'

interface AppLayoutProps {
  children: React.ReactNode
  activeNav?: AppNav
  onNavigate?: (id: AppNav) => void
}

export function AppLayout({ children, activeNav, onNavigate }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar activeItem={activeNav} onNavigate={onNavigate} />
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</main>
    </div>
  )
}
