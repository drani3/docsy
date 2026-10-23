// "Questions  42 / 100" with a bar; amber near the limit, red at it
export default function UsageMeter({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 1
  const color = ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-indigo-600'

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="font-medium text-gray-900">
          {used.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
