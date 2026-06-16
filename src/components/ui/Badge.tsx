interface BadgeProps {
  children: React.ReactNode
  variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'control'
  size?: 'sm' | 'md'
}

const variants = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  control: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

export function Badge({ children, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center font-medium border rounded ${variants[variant]} ${sizeClass}`}>
      {children}
    </span>
  )
}
