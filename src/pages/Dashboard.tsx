import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAffidavitDashboard, fetchFIRCityGraph, fetchFIRDashboard, fetchFIRs, fetchMotionDashboard, fetchProceedingsByFIR, fetchWritTypeDistribution } from '../lib/api'
import { useAuthStore, useApiCacheStore } from '../store'
import type { AffidavitDashboardMetrics, FIR, FIRCityBreakdown, FIRDashboardMetrics, MotionDashboardMetrics, WritTypeDistribution } from '../types'

type ProceedingEvent = {
  dateKey: string
  date: Date
  title: string
  type: string
  firNumber?: string
}

function formatDateKey(d: Date) {
  return d.toISOString().split('T')[0]
}

function parseDateSafe(value?: string | Date): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function addDays(d: Date, days: number) {
  const nd = new Date(d)
  nd.setDate(d.getDate() + days)
  return nd
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.currentUser)
  const navigate = useNavigate()
  const [firs, setFirs] = useState<FIR[]>([])
  const [metrics, setMetrics] = useState<FIRDashboardMetrics | null>(null)
  const [motionMetrics, setMotionMetrics] = useState<MotionDashboardMetrics | null>(null)
  const [affidavitMetrics, setAffidavitMetrics] = useState<AffidavitDashboardMetrics | null>(null)
  const [writTypeDistribution, setWritTypeDistribution] = useState<WritTypeDistribution[]>([])
  const [cityGraph, setCityGraph] = useState<FIRCityBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completedFIRs, setCompletedFIRs] = useState<Set<string>>(new Set())
  const [proceedingEvents, setProceedingEvents] = useState<ProceedingEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())

  const handleCreateFIR = () => {
    navigate('/firs?create=true')
  }

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      try {
        const cache = useApiCacheStore.getState()
        // Check cache first for instant loading
        const cachedFirs = cache.getCachedFirs()
        const cachedMetrics = cache.getCachedDashboard()
        const cachedCityGraph = cache.getCachedCityGraph()

        if (cachedFirs) {
          setFirs(cachedFirs)
          setLoading(false) // Show cached data immediately
        }
        if (cachedMetrics) {
          setMetrics(cachedMetrics)
        }
        if (cachedCityGraph) {
          setCityGraph(cachedCityGraph)
        }

        // Fetch fresh data in the background
        setLoading(true)
        const [firData, dashboardData, cityData, motionData, affidavitData, writTypeData] = await Promise.all([
          fetchFIRs(),
          fetchFIRDashboard(),
          fetchFIRCityGraph(),
          fetchMotionDashboard(),
          fetchAffidavitDashboard(),
          fetchWritTypeDistribution(),
        ])
        if (!active) {
          return
        }
        setFirs(firData)
        setMetrics(dashboardData)
        setCityGraph(cityData)
        setMotionMetrics(motionData)
        setAffidavitMetrics(affidavitData)
        setWritTypeDistribution(writTypeData)
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
  }, [user?.email])

  useEffect(() => {
    if (firs.length === 0) return
    let active = true

    async function loadEvents() {
      try {
        setEventsLoading(true)
        const allEvents: ProceedingEvent[] = []
        await Promise.all(
          firs.map(async (fir) => {
            try {
              const proceedings = await fetchProceedingsByFIR(fir._id)
              proceedings?.forEach((p) => {
                const d = parseDateSafe((p as any).hearingDetails?.dateOfHearing)
                if (!d) return
                const dateKey = formatDateKey(d)
                const title = `${(p.type || 'Proceeding').replace(/_/g, ' ')}` + (p.summary ? ` • ${p.summary}` : '')
                allEvents.push({
                  dateKey,
                  date: d,
                  title,
                  type: p.type,
                  firNumber: (p.fir && typeof p.fir === 'object' && 'firNumber' in p.fir) ? (p.fir as any).firNumber : fir.firNumber,
                })
              })
            } catch (err) {
              console.error('Failed to load proceedings for FIR', fir._id, err)
            }
          })
        )
        if (!active) return
        allEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
        setProceedingEvents(allEvents)
      } finally {
        if (active) setEventsLoading(false)
      }
    }

    loadEvents()
    return () => {
      active = false
    }
  }, [firs])

  // Use affidavit metrics from proceedings instead of FIR metrics
  const totalCases = affidavitMetrics?.filed ?? 0
  const pendingCases = affidavitMetrics?.pending ?? 0

  const statusTotals =
    metrics?.statusCounts.reduce((sum, item) => sum + item.count, 0) ?? 0

  const today = new Date()
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ProceedingEvent[]>()
    proceedingEvents.forEach((ev) => {
      if (!map.has(ev.dateKey)) map.set(ev.dateKey, [])
      map.get(ev.dateKey)!.push(ev)
    })
    return map
  }, [proceedingEvents])

  const todayEvents = eventsByDate.get(formatDateKey(today)) || []
  const upcomingEvents = useMemo(() => {
    const end = addDays(today, 28)
    return proceedingEvents.filter((ev) => ev.date >= today && ev.date <= end && !isSameDay(ev.date, today))
  }, [proceedingEvents, today])

  const currentMonthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
  const startWeekday = startOfMonth.getDay() // 0-6
  const calendarCells: Array<{ day: number | null; date?: Date; events?: ProceedingEvent[] }> = []

  for (let i = 0; i < startWeekday; i++) {
    calendarCells.push({ day: null })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d)
    const key = formatDateKey(date)
    calendarCells.push({
      day: d,
      date,
      events: eventsByDate.get(key) || [],
    })
  }

  const pieSegments = useMemo(() => {
    if (!metrics) {
      return []
    }
    return metrics.statusCounts.map((item) => ({
      key: item.status || 'UNKNOWN',
      label: formatStatusLabel(item.status || 'UNKNOWN'),
      count: item.count,
      color: STATUS_COLOR_MAP[item.status || 'UNKNOWN'] ?? '#6366f1',
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
          new Date(b.dateOfFIR || b.dateOfFiling || 0).getTime() -
          new Date(a.dateOfFIR || a.dateOfFiling || 0).getTime()
      )
      .slice(0, 5)
  }, [firs])

  // Check completion status for recent FIRs
  useEffect(() => {
    async function checkCompletionStatus() {
      const completedSet = new Set<string>()
      await Promise.all(
        recentFirs.map(async (fir) => {
          try {
            const proceedings = await fetchProceedingsByFIR(fir._id)
            const hasCompletedProceedings = proceedings && proceedings.length > 0 && 
              proceedings.some(p => !p.draft)
            if (hasCompletedProceedings) {
              completedSet.add(fir._id)
            }
          } catch {
            // Ignore errors when checking completion status
          }
        })
      )
      setCompletedFIRs(completedSet)
    }
    if (recentFirs.length > 0) {
      checkCompletionStatus()
    }
  }, [recentFirs])

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <button className="btn-primary" onClick={handleCreateFIR}>
          + New Writ Application
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Top tile area (3 rows x 2) + Affidavit bar graph */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
        <MetricCard 
          label="Filed Affidavit" 
          value={totalCases} 
          loading={loading}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          borderColor="indigo"
        />
        <MetricCard 
          label="Pending Affidavit" 
          value={pendingCases} 
          loading={loading}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          borderColor="indigo"
        />
        <MetricCard 
          label="Overdue Affidavit" 
          value={affidavitMetrics?.overdue ?? 0} 
          loading={loading}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          borderColor="indigo"
        />
        <MetricCard 
          label="Filed Motion" 
          value={motionMetrics?.filed ?? 0} 
          loading={loading}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          }
          borderColor="teal"
        />
        <MetricCard 
          label="Pending Motion" 
          value={motionMetrics?.pending ?? 0} 
          loading={loading}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          }
          borderColor="teal"
        />
        <MetricCard 
          label="Overdue Motion" 
          value={motionMetrics?.overdue ?? 0} 
          loading={loading}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          }
          borderColor="teal"
        />
        </div>
        <div className="card-soft p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Affidavit Status Graph</h2>
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

      {/* Calendar + Writ Status + Writ Types */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Calendar</h2>
              <p className="text-xs text-gray-500">View this month&apos;s proceedings</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              >
                ←
              </button>
              <div className="text-sm font-semibold text-gray-800">{currentMonthLabel}</div>
              <button
                className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              >
                →
              </button>
              <button
                className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                onClick={() => setCurrentMonth(new Date())}
              >
                Today
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-500">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-2 text-center text-sm">
            {calendarCells.map((cell, idx) => {
              if (cell.day === null) return <div key={idx} />
              const isTodayCell = cell.date ? isSameDay(cell.date, today) : false
              const hasEvents = cell.events && cell.events.length > 0
              return (
                <div
                  key={idx}
                  className={`rounded-lg border px-2 py-2 text-gray-800 transition hover:border-indigo-200 hover:bg-indigo-50 ${
                    isTodayCell ? 'border-indigo-300 bg-indigo-50 font-semibold' : 'border-gray-200 bg-white'
                  }`}
                  title={hasEvents ? cell.events!.map((e) => e.title).join(' • ') : undefined}
                >
                  <div className="flex items-center justify-center">
                    <span>{cell.day}</span>
                  </div>
                  {hasEvents && (
                    <div className="mt-1 flex justify-center gap-1">
                      {cell.events!.slice(0,3).map((_, i) => (
                        <span key={i} className="h-2 w-2 rounded-full bg-indigo-500"></span>
                      ))}
                      {cell.events!.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{cell.events!.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Writ Status</h2>
          <div className="mb-4 text-xs text-gray-500">Distribution of writs by current status</div>
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
                    <div key={seg.key} className="flex items-center gap-2 text-gray-700">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span>{seg.label}</span>
                      <span className="ml-auto text-gray-500">
                        {seg.count} ({percent}%)
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="text-sm text-gray-500">
                  {loading ? 'Loading writ status…' : 'No writs found.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Writ Types Distribution</h2>
          <div className="mb-4 text-xs text-gray-500">Distribution of writs by type</div>
          <div className="max-w-[320px] lg:max-w-none mx-auto">
            <InteractiveWritTypeChart data={writTypeDistribution} loading={loading} />
          </div>
        </div>
      </div>

      {/* Today & Upcoming (below main blocks) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Proceedings</h2>
              <p className="text-xs text-gray-500">Quick glance at what&apos;s scheduled today</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600">
              <span>Reminders on</span>
              <span role="img" aria-label="bell">🔔</span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {eventsLoading && <div className="text-sm text-gray-500">Loading proceedings…</div>}
            {!eventsLoading && todayEvents.length === 0 && (
              <div className="text-sm text-gray-500">No proceedings scheduled for today.</div>
            )}
            {!eventsLoading && todayEvents.map((ev, idx) => (
              <div key={idx} className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center justify-between text-sm text-gray-900">
                  <span className="font-semibold">{ev.title}</span>
                  <span className="text-xs text-gray-500">{ev.firNumber || '—'}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                    {ev.type.replace(/_/g, ' ')}
                  </span>
                  <span>All day</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Proceedings (Next 4 Weeks)</h2>
            <span className="text-xs text-gray-500">{eventsLoading ? 'Loading…' : `${upcomingEvents.length} item(s)`}</span>
          </div>
          <div className="mt-3 space-y-3">
            {eventsLoading && <div className="text-sm text-gray-500">Loading proceedings…</div>}
            {!eventsLoading && upcomingEvents.length === 0 && (
              <div className="text-sm text-gray-500">No upcoming proceedings in the next 4 weeks.</div>
            )}
            {!eventsLoading && upcomingEvents.map((ev, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex h-10 w-14 flex-col items-center justify-center rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100">
                  <span>{ev.date.toLocaleString('en', { month: 'short' })}</span>
                  <span className="text-base">{ev.date.getDate()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm text-gray-900">
                    <span className="font-semibold truncate">{ev.title}</span>
                    <span className="text-xs text-gray-500">{ev.firNumber || '—'}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                      {ev.type.replace(/_/g, ' ')}
                    </span>
                    <span>{ev.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Recent Writ Petitions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm text-gray-700">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Writ Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Petitioner</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Branch</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Filed On</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {recentFirs.map((row) => (
                <tr
                  key={row._id}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                  onClick={() => navigate(`/firs/${row._id}`)}
                >
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">{row.firNumber}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-700">{row.petitionerName}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-700">{row.branchName || row.branch || '—'}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 capitalize">
                      {formatStatusLabel(row.status || 'UNKNOWN')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-700">{formatDate(row.dateOfFIR || row.dateOfFiling)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/firs/${row._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-md border border-indigo-600 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      >
                        View
                      </Link>
                      {completedFIRs.has(row._id) && (
                        <Link
                          to={`/firs?edit=${row._id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md border border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Edit
                        </Link>
                      )}
                    </div>
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

// Premium color palette with sophisticated gradients (icons removed for compact legend)
const WRIT_TYPE_COLORS: Record<string, { start: string; mid: string; end: string; glow: string; label: string }> = {
  BAIL: { 
    start: '#3b82f6', 
    mid: '#2563eb', 
    end: '#1d4ed8', 
    glow: 'rgba(59, 130, 246, 0.4)',
    label: 'Bail',
  },
  QUASHING: { 
    start: '#ef4444', 
    mid: '#dc2626', 
    end: '#b91c1c', 
    glow: 'rgba(239, 68, 68, 0.4)',
    label: 'Quashing',
  },
  DIRECTION: { 
    start: '#a855f7', 
    mid: '#9333ea', 
    end: '#7e22ce', 
    glow: 'rgba(168, 85, 247, 0.4)',
    label: 'Direction',
  },
  SUSPENSION_OF_SENTENCE: { 
    start: '#f97316', 
    mid: '#ea580c', 
    end: '#c2410c', 
    glow: 'rgba(249, 115, 22, 0.4)',
    label: 'Suspension of Sentence',
  },
  PAROLE: { 
    start: '#14b8a6', 
    mid: '#0d9488', 
    end: '#0f766e', 
    glow: 'rgba(20, 184, 166, 0.4)',
    label: 'Parole',
  },
  ANY_OTHER: { 
    start: '#6b7280', 
    mid: '#4b5563', 
    end: '#374151', 
    glow: 'rgba(107, 114, 128, 0.4)',
    label: 'Any Other',
  },
}

function InteractiveWritTypeChart({ data, loading }: { data: WritTypeDistribution[]; loading: boolean }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; count: number; percent: number; color: string } | null>(null)
  const [mounted, setMounted] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const chartData = useMemo(() => {
    const total = data.reduce((sum, item) => sum + item.count, 0)
    if (total === 0) return []

    let currentAngle = -90 // Start from top
    const gapAngle = 2 // Gap between segments in degrees
    const totalGapAngle = gapAngle * data.filter(item => item.count > 0).length
    const availableAngle = 360 - totalGapAngle
    
    return data.map((item, index) => {
      const percentage = (item.count / total) * 100
      const angle = item.count > 0 ? (item.count / total) * availableAngle : 0
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle + gapAngle

      return {
        ...item,
        index,
        percentage: Math.round(percentage),
        startAngle,
        endAngle,
        angle,
        color: WRIT_TYPE_COLORS[item.type] || WRIT_TYPE_COLORS.ANY_OTHER,
      }
    })
  }, [data])

  const total = useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data])

  const handleMouseMove = (e: React.MouseEvent<SVGElement>, segment: typeof chartData[0]) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgPoint = svgRef.current.createSVGPoint()
    svgPoint.x = e.clientX - rect.left
    svgPoint.y = e.clientY - rect.top
    
    // Smart positioning to avoid viewport edges
    let tooltipX = svgPoint.x
    let tooltipY = svgPoint.y
    if (tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      
      if (tooltipX + tooltipRect.width > viewportWidth - 20) {
        tooltipX = svgPoint.x - tooltipRect.width
      }
      if (tooltipY - tooltipRect.height < 20) {
        tooltipY = svgPoint.y + tooltipRect.height + 20
      }
    }
    
    setTooltip({
      x: tooltipX,
      y: tooltipY,
      label: segment.color.label,
      count: segment.count,
      percent: segment.percentage,
      color: segment.color.start,
    })
  }

  const handleMouseLeave = () => {
    setHoveredIndex(null)
    setTooltip(null)
  }

  const getArcPath = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) => {
    const start = (startAngle * Math.PI) / 180
    const end = (endAngle * Math.PI) / 180
    const largeArc = endAngle - startAngle > 180 ? 1 : 0

    const x1 = 100 + outerRadius * Math.cos(start)
    const y1 = 100 + outerRadius * Math.sin(start)
    const x2 = 100 + outerRadius * Math.cos(end)
    const y2 = 100 + outerRadius * Math.sin(end)

    const x3 = 100 + innerRadius * Math.cos(end)
    const y3 = 100 + innerRadius * Math.sin(end)
    const x4 = 100 + innerRadius * Math.cos(start)
    const y4 = 100 + innerRadius * Math.sin(start)

    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`
  }

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100/50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
          <div className="text-sm font-medium text-gray-600">Loading writ types…</div>
        </div>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50">
        <div className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-sm font-medium text-gray-600">No writ types data available</div>
          <div className="text-xs text-gray-400 mt-1">Create writs to see distribution</div>
        </div>
      </div>
    )
  }

  const outerRadius = 90
  const innerRadius = 55

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-center">
      {/* Chart Container */}
      <div className="relative flex items-center justify-center">
        <div className="relative">
          {/* Outer glow effect */}
          <div 
            className="absolute inset-0 rounded-full blur-2xl opacity-30 transition-opacity duration-300"
            style={{
              background: hoveredIndex !== null && chartData[hoveredIndex] 
                ? `radial-gradient(circle, ${chartData[hoveredIndex].color.glow} 0%, transparent 70%)`
                : 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
            }}
          />
          
          <svg
            ref={svgRef}
            viewBox="0 0 200 200"
            className="h-72 w-72 drop-shadow-lg mx-auto"
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              {/* Enhanced gradients with multiple stops */}
              {chartData.map((segment) => (
                <linearGradient key={segment.type} id={`gradient-${segment.type}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={segment.color.start} stopOpacity="1" />
                  <stop offset="50%" stopColor={segment.color.mid} stopOpacity="1" />
                  <stop offset="100%" stopColor={segment.color.end} stopOpacity="1" />
                </linearGradient>
              ))}
              {/* Glow filters for hover effect */}
              {chartData.map((segment) => (
                <filter key={`glow-${segment.type}`} id={`glow-${segment.type}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              ))}
            </defs>
            
            {/* Chart segments with staggered animation */}
            {chartData.map((segment, idx) => {
              if (segment.count === 0) return null
              const isHovered = hoveredIndex === segment.index
              const path = getArcPath(segment.startAngle, segment.endAngle, innerRadius, outerRadius)
              const midAngle = (segment.startAngle + segment.endAngle) / 2
              const labelRadius = (outerRadius + innerRadius) / 2
              const labelX = 100 + labelRadius * Math.cos((midAngle * Math.PI) / 180)
              const labelY = 100 + labelRadius * Math.sin((midAngle * Math.PI) / 180)
              
              return (
                <g key={segment.type}>
                  <path
                    d={path}
                    fill={`url(#gradient-${segment.type})`}
                    stroke="white"
                    strokeWidth="3"
                    className="cursor-pointer"
                    style={{
                      transform: isHovered ? 'scale(1.08) rotate(2deg)' : mounted ? 'scale(1)' : 'scale(0)',
                      transformOrigin: '100px 100px',
                      filter: isHovered ? `url(#glow-${segment.type}) drop-shadow(0 12px 24px ${segment.color.glow})` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                      opacity: isHovered ? 1 : hoveredIndex !== null ? 0.4 : 1,
                      transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 0.05}s`,
                    }}
                    onMouseEnter={(e) => {
                      setHoveredIndex(segment.index)
                      handleMouseMove(e, segment)
                    }}
                    onMouseMove={(e) => handleMouseMove(e, segment)}
                    onMouseLeave={handleMouseLeave}
                  />
                  {/* Percentage labels for segments > 3% */}
                  {segment.percentage >= 3 && (
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none select-none"
                      style={{
                        fill: 'white',
                        fontSize: segment.percentage > 10 ? '11px' : '9px',
                        fontWeight: '700',
                        textShadow: '0 2px 4px rgba(0,0,0,0.4), 0 0 8px rgba(0,0,0,0.2)',
                        opacity: isHovered ? 1 : 0.9,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      {segment.percentage}%
                    </text>
                  )}
                </g>
              )
            })}
            
            {/* Center circle with gradient background */}
            <defs>
              <radialGradient id="centerGradient" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="100%" stopColor="#f9fafb" stopOpacity="1" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r={innerRadius} fill="url(#centerGradient)" stroke="#e5e7eb" strokeWidth="2" />
            
            {/* Center content */}
            <text
              x="100"
              y="92"
              textAnchor="middle"
              dominantBaseline="middle"
              className="select-none"
              style={{
                fill: '#111827',
                fontSize: '36px',
                fontWeight: '800',
                letterSpacing: '-0.02em',
              }}
            >
              {total}
            </text>
            <text
              x="100"
              y="108"
              textAnchor="middle"
              dominantBaseline="middle"
              className="select-none"
              style={{
                fill: '#6b7280',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Total Writs
            </text>
          </svg>
          
          {/* Premium tooltip */}
          {tooltip && (
            <div
              ref={tooltipRef}
              className="absolute z-50 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-2xl pointer-events-none backdrop-blur-sm"
              style={{
                left: `${(tooltip.x / 200) * 100}%`,
                top: `${(tooltip.y / 200) * 100}%`,
                transform: 'translate(-50%, calc(-100% - 16px))',
                opacity: tooltip ? 1 : 0,
                transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div 
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tooltip.color }}
                />
                <div className="font-bold text-base">{tooltip.label}</div>
              </div>
              <div className="text-gray-300 text-xs">
                <span className="font-semibold text-white">{tooltip.count}</span> writ{tooltip.count !== 1 ? 's' : ''} • <span className="font-medium">{tooltip.percent}%</span>
              </div>
              {/* Arrow */}
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent"
                style={{ borderTopColor: '#111827' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Compact Legend */}
      <div className="flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {chartData.map((segment) => {
            const isHovered = hoveredIndex === segment.index
            return (
              <div
                key={segment.type}
                className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition ${
                  isHovered ? 'shadow-md border-indigo-200 bg-indigo-50' : 'hover:shadow-sm'
                }`}
                onMouseEnter={() => setHoveredIndex(segment.index)}
                onMouseLeave={handleMouseLeave}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: segment.color.start }}
                />
                <span className="text-gray-700 truncate">{segment.color.label}</span>
                <span className="ml-auto text-gray-500 text-xs">
                  {segment.count} ({segment.percentage}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  loading,
  icon,
  borderColor = 'indigo',
  bgTint,
}: {
  label: string
  value: number
  loading?: boolean
  icon?: React.ReactNode
  borderColor?: 'indigo' | 'teal' | 'purple'
  bgTint?: string
}) {
  const borderColorMap = {
    indigo: 'border-l-indigo-600',
    teal: 'border-l-teal-600',
    purple: 'border-l-purple-600',
  }

  const textColorMap = {
    indigo: 'text-indigo-600',
    teal: 'text-teal-600',
    purple: 'text-purple-600',
  }

  return (
    <div 
      className={`rounded-xl border-l-4 border bg-white p-4 shadow-sm ${borderColorMap[borderColor]}`}
      style={bgTint ? { backgroundColor: bgTint } : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </div>
        {icon && (
          <div className="text-gray-400">
            {icon}
          </div>
        )}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${textColorMap[borderColor]}`}>
        {loading ? '—' : value}
      </div>
    </div>
  )
}

const STATUS_COLOR_MAP: Record<string, string> = {
  ALLOWED: '#34d399',
  PENDING: '#fbbf24',
  DISMISSED: '#f87171',
  WITHDRAWN: '#f87171',
  DIRECTION: '#60a5fa',
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

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}