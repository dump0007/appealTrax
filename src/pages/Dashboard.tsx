import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchFIRCityGraph, fetchFIRDashboard, fetchFIRs } from '../lib/api'
import { useAuthStore } from '../store'
import type { FIR, FIRCityBreakdown, FIRDashboardMetrics } from '../types'

export default function Dashboard() {
  const user = useAuthStore((s) => s.currentUser)
  const navigate = useNavigate()
  const [firs, setFirs] = useState<FIR[]>([])
  const [metrics, setMetrics] = useState<FIRDashboardMetrics | null>(null)
  const [cityGraph, setCityGraph] = useState<FIRCityBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      try {
        setLoading(true)
        const [firData, dashboardData, cityData] = await Promise.all([
          fetchFIRs(),
          fetchFIRDashboard(),
          fetchFIRCityGraph(),
        ])
        if (!active) {
          return
        }
        setFirs(firData)
        setMetrics(dashboardData)
        setCityGraph(cityData)
        setError(null)
      } catch (err) {
        if (!active) {
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      active = false
    }
  }, [])

  const totalCases = metrics?.totalCases ?? 0
  const pendingCases = metrics?.ongoingCases ?? 0
  const closedCases = metrics?.closedCases ?? 0

  const statusTotals =
    metrics?.statusCounts.reduce((sum, item) => sum + item.count, 0) ?? 0

  const pieSegments = useMemo(() => {
    if (!metrics) {
      return []
    }
    return metrics.statusCounts.map((item) => ({
      key: item.status,
      label: formatStatusLabel(item.status),
      count: item.count,
      color: STATUS_COLOR_MAP[item.status] ?? '#6366f1',
    }))
  }, [metrics])

  let currentAngle = 0
  const gradientParts: string[] = []
  pieSegments.forEach((seg) => {
    const slice = statusTotals ? (seg.count / statusTotals) * 360 : 0
    const start = currentAngle
    const end = currentAngle + slice
    gradientParts.push(`${seg.color} ${start}deg ${end}deg`)
    currentAngle = end
  })

  const pieBackground =
    gradientParts.length > 0
      ? `conic-gradient(${gradientParts.join(', ')})`
      : 'conic-gradient(#e5e7eb 0deg 360deg)'

  const recentFirs = useMemo(() => {
    return [...firs]
      .sort(
        (a, b) =>
          new Date(b.dateOfFiling).getTime() - new Date(a.dateOfFiling).getTime()
      )
      .slice(0, 5)
  }, [firs])

  const cityBars = useMemo(() => {
    if (cityGraph.length === 0) {
      return []
    }
    const total = cityGraph.reduce((sum, c) => sum + c.count, 0)
    const max = Math.max(...cityGraph.map((c) => c.count), 1)
    return cityGraph.map((c, index) => ({
      label: c.branch,
      value: max ? Math.round((c.count / max) * 100) : 0,
      count: c.count,
      percent: total ? Math.round((c.count / total) * 100) : 0,
      color: CITY_COLOR_PALETTE[index % CITY_COLOR_PALETTE.length],
    }))
  }, [cityGraph])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">FIR Operations Overview</h1>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Cases" value={totalCases} loading={loading} />
        <MetricCard label="Pending Cases" value={pendingCases} loading={loading} />
        <MetricCard label="Closed Cases" value={closedCases} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold">Decision by Court</h2>
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <div
              className="h-52 w-52 rounded-full border border-gray-200"
              style={{ backgroundImage: pieBackground }}
            />
            <div className="space-y-2 text-sm">
              {pieSegments.length > 0 ? (
                pieSegments.map((seg) => {
                  const percent =
                    statusTotals > 0 ? Math.round((seg.count / statusTotals) * 100) : 0
                  return (
                    <div key={seg.key} className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-gray-700">{seg.label}</span>
                      <span className="ml-auto text-gray-500">
                        {seg.count} ({percent}%)
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="text-sm text-gray-500">
                  {loading ? 'Loading court decisions…' : 'No court decisions yet.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold">FIR Status Graph</h2>
          {cityBars.length > 0 ? (
            <div className="space-y-4">
              {cityBars.map((item) => (
                <div key={item.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {item.count} ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-4 w-full rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${item.value}%`, backgroundColor: item.color }}
                      title={`${item.label}: ${item.count} ${item.count === 1 ? 'case' : 'cases'}`}
                    />
                  </div>
                </div>
              ))}
              <div className="text-xs text-gray-500">Cases by branch</div>
            </div>
          ) : (
            <div className="h-56 rounded-md bg-gray-50 text-center text-sm text-gray-500">
              <div className="flex h-full flex-col items-center justify-center gap-2">
                {loading ? 'Loading FIR graph…' : 'No FIR city data available.'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <h2 className="border-b px-4 py-3 text-lg font-semibold">Recent FIRs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">FIR Number</th>
                <th className="px-4 py-3">Petitioner</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Filed On</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm text-gray-700">
              {recentFirs.map((row) => (
                <tr
                  key={row._id}
                  className="cursor-pointer transition hover:bg-indigo-50/60"
                  onClick={() => navigate(`/firs/${row._id}`)}
                >
                  <td className="px-4 py-3 font-medium">{row.firNumber}</td>
                  <td className="px-4 py-3">{row.petitionerName}</td>
                  <td className="px-4 py-3">{row.branch}</td>
                  <td className="px-4 py-3 capitalize">{formatStatusLabel(row.status)}</td>
                  <td className="px-4 py-3">{formatDate(row.dateOfFiling)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/firs/${row._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md border border-indigo-600 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {recentFirs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                    {loading ? 'Loading FIRs…' : 'No FIRs found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-gray-500">
        Logged in as: {user?.email || 'Guest'}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  loading,
}: {
  label: string
  value: number
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-indigo-600">
        {loading ? '—' : value}
      </div>
    </div>
  )
}

const STATUS_COLOR_MAP: Record<string, string> = {
  REGISTERED: '#60a5fa',
  UNDER_INVESTIGATION: '#f97316',
  ONGOING_HEARING: '#fbbf24',
  CHARGESHEET_FILED: '#34d399',
  CLOSED: '#a855f7',
  WITHDRAWN: '#f87171',
}

const CITY_COLOR_PALETTE = [
  '#4f46e5',
  '#16a34a',
  '#dc2626',
  '#0ea5e9',
  '#f97316',
  '#a855f7',
  '#059669',
  '#eab308',
]

function formatStatusLabel(status: string) {
  if (!status) return 'Unknown'
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleDateString()
}