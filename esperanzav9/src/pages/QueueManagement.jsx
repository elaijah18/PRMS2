// TO BE REVISEDDDD, PARANG may mali pa sa priority handling....

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import priorityIcon from '../assets/disabled.png'
import nextIcon from '../assets/next.png'
import listIcon from '../assets/list.png'
import searchIcon from '../assets/search.png'
//import backIcon from '../assets/arrow.png'

const API_URL = 'http://localhost:8000'

const calcBmi = (height, weight) => {
  const h = Number(height)
  const w = Number(weight)
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0) return '—'
  const m = h / 100
  return (w / (m * m)).toFixed(1)
}

export default function QueueManagement() {
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)
  const [showNowModal, setShowNowModal] = useState(false)
  const tableRef = useRef(null)

  const currentEntry = queue[now]
  // Use 'queue_number' from database
  const currentNumber = useMemo(() => currentEntry?.queue_number ?? '—', [currentEntry])

  // Fetch queue data with embedded vitals from backend
  const fetchQueue = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/queue/current_queue/`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch queue')

      const data = await response.json()

      // Transform backend data to match component format
      const transformedQueue = (Array.isArray(data) ? data : []).map((entry, index) => {
        const patient = entry.patient
        const vitals = entry.latest_vitals || {} // server-provided vitals snapshot

        return {
          id: entry.id,
          queueId: entry.id,

          // Use the actual queue number from database
          queue_number: entry.queue_number || '000',  // Uses 001-299 or 300-999

          // priority fields (either from BE or left falsy)
          priority: (entry.priority || 'NORMAL').toUpperCase(),  // 'PRIORITY' | 'NORMAL'
          priority_code: entry.priority_code || null,            // e.g. 'E07'

          patientId: patient?.patient_id || '—',
          patientDbId: patient?.id,
          name: patient ? `${patient.first_name} ${patient.last_name}`.toUpperCase() : 'UNKNOWN',
          sex: patient?.sex || '—',
          address: patient?.address || '—',
          contact: patient?.contact_number || '—',
          date: patient?.date_of_birth || '—',
          enteredAt: entry.entered_at,

          vitals: {
            height: vitals.height ?? vitals.height_cm ?? null,
            weight: vitals.weight ?? vitals.weight_kg ?? null,
            hr: vitals.hr ?? vitals.heart_rate ?? null,
            bp: vitals.bp ?? vitals.blood_pressure ?? null,
            temp: vitals.temp ?? vitals.temperature ?? null,
            spo2: vitals.spo2 ?? vitals.oxygen_saturation ?? null,
            bmi: vitals.bmi ?? null,
          },
        }
      })

      setQueue(transformedQueue)
      // Keep "now" within bounds after refresh
      setNow((n) => Math.min(n, Math.max(transformedQueue.length - 1, 0)))
    } catch (error) {
      console.error('Error fetching queue:', error)
      setQueue([])
      setNow(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 10000) // refresh every 10s
    return () => clearInterval(interval)
  }, [])

  // Get vitals for a specific patient (from queue data)
  const getPatientVitals = (queueEntry) => {
    if (!queueEntry || !queueEntry.vitals) {
      return { height: '—', weight: '—', hr: '—', bp: '—', temp: '—', spo2: '—', bmi: '—' }
    }
    const v = queueEntry.vitals
    return {
      height: v.height ?? '—',
      weight: v.weight ?? '—',
      hr: v.hr ?? '—',
      bp: v.bp ?? '—',
      temp: Number.isFinite(Number(v.temp)) ? `${v.temp} °C` : '—',
      spo2: Number.isFinite(Number(v.spo2)) ? `${v.spo2}%` : '—',
      bmi: v.bmi ?? '—',
    }
  }

  // Actions
  const handleNext = async () => {
    if (queue.length === 0) return
    const current = queue[now]
    try {
      await fetch(`${API_URL}/queue/${current.queueId}/mark_complete/`, {
        method: 'POST',
        credentials: 'include',
      })
      await fetchQueue()
      setNow(0)
      setShowNowModal(true)
      setTimeout(() => setShowNowModal(false), 2000)
    } catch (error) {
      console.error('Error marking patient complete:', error)
      setNow((n) => Math.min(n + 1, Math.max(queue.length - 1, 0)))
      setShowNowModal(true)
      setTimeout(() => setShowNowModal(false), 2000)
    }
  }

  const handleEmergency = async () => {
    alert('Emergency patient: add via the main system with PRIORITY (E-code).')
    await fetchQueue()
  }

  const handleGoList = () => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleExit = () => nav('/staff')
  const handleRefresh = async () => { await fetchQueue() }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return queue
    return queue.filter((r) => {
      const vitals = getPatientVitals(r)
      return (
        r.queue_number.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.patientId.toLowerCase().includes(q) ||
        (vitals.bp && String(vitals.bp).toLowerCase().includes(q))
      )
    })
  }, [queue, query])

  // Reusable: Queue number cell with PRIORITY badge + E##
  const QueueNumberCell = ({ rec }) => {
    const isPriority = rec.priority === 'PRIORITY'
    return (
      <div className="flex items-center justify-center gap-2">
        {isPriority && (
          <span className="inline-flex items-center gap-1">
            <span className="rounded-md bg-red-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
              Priority
            </span>
            {rec.priority_code && (
              <span className="font-mono text-xs text-red-700">{rec.priority_code}</span>
            )}
          </span>
        )}
        <span className={`tabular-nums ${isPriority ? 'ml-1' : ''}`}>{rec.queue_number}</span>

      </div>
    )
  }

  // Reusable: Now Serving badge for current entry
  const NowServingBadge = () => {
    if (!currentEntry) return null
    if (currentEntry.priority !== 'PRIORITY') return null
    return (
      <div className="mt-2 inline-flex items-center gap-2">
        <span className="rounded-md bg-red-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
          Priority
        </span>
        {currentEntry.priority_code && (
          <span className="font-mono text-xs text-red-700">{currentEntry.priority_code}</span>
        )}
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      {/* Back button - UNCOMMENT IF NEEDED
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 shadow mb-6"
      >
        <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
        <span className="text-sm font-medium">Back</span>
      </button> */}

      {/* Header */}
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#406E65]">
        Queue Management
      </h1>

      {/* Controls */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Now Serving */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="flex justify-center items-center mt-2 flex-1">
            <span className="text-6xl font-black text-[#406E65] tabular-nums">
              {loading ? '...' : currentNumber}
            </span>
          </div>
          <NowServingBadge />
          <div className="text-sm text-emerald-800/80 mt-4">
            Now Serving
          </div>
        </div>

        {/* Next Patient */}
        <button
          onClick={handleNext}
          disabled={queue.length === 0}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <img src={nextIcon} alt="Next" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">Next</div>
          <div className="mt-2 text-xl font-extrabold text-[#406E65]">Next Patient</div>
        </button>

        {/* Emergency / Priority */}
        <button
          onClick={handleEmergency}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <img src={priorityIcon} alt="Emergency / Priority" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">Add</div>
          <div className="mt-2 text-xl font-extrabold text-[#406E65]">Emergency / Priority</div>
        </button>

        {/* Queue List */}
        <button
          onClick={handleGoList}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <img src={listIcon} alt="Queue List" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">View</div>
          <div className="mt-2 text-xl font-extrabold text-[#406E65]">Queue List</div>
        </button>
      </div>

      {/* Patient Queue table */}
      <div ref={tableRef} className="mt-6 rounded-2xl border shadow-sm overflow-hidden bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-5 pt-5">
          <div className="text-lg font-extrabold" style={{ color: '#406E65' }}>
            Patient <span className="text-[#406E65]">Queue</span>
          </div>
          <div className="w-full md:w-[26rem]">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search number, name, patient ID, BP…"
                className="w-full rounded-full border border-emerald-200/70 bg-emerald-50/40 px-4 py-2.5 pr-10 text-[#406E65] placeholder-emerald-800/60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-800/70">
                <img
                  src={searchIcon}
                  alt="Search"
                  className="h-5 w-5 object-contain select-none"
                  draggable="false"
                />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          {loading ? (
            <div className="px-4 py-12 text-center text-emerald-700">Loading queue...</div>
          ) : (
            <table className="min-w-full text-left text-sm" style={{ color: '#406E65' }}>
              <thead style={{ background: '#DCEBE8', color: '#406E65' }}>
                <tr>
                  <th className="px-4 py-3">Queue #</th>
                  <th className="px-4 py-3">Patient ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Height/Weight</th>
                  <th className="px-4 py-3">BMI</th>
                  <th className="px-4 py-3">Pulse Rate</th>
                  <th className="px-4 py-3">Blood Pressure</th>
                  <th className="px-4 py-3">Temperature</th>
                  <th className="px-4 py-3">Oxygen Saturation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const vitals = getPatientVitals(r)
                  const bmi = r.vitals.bmi || calcBmi(r.vitals.height, r.vitals.weight)
                  const isPriority = r.priority === 'PRIORITY'

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setNow(i)}
                      className="border-t cursor-pointer"
                      style={{
                        background: i === now ? '#CFE6E1' : '#DCEBE8',
                        color: '#406E65',
                        outline: isPriority ? '2px solid rgba(220,38,38,.35)' : 'none',
                        outlineOffset: '-2px',
                      }}
                      title={i === now ? 'Selected' : 'Click to select'}
                      aria-selected={i === now}
                    >
                      <td className="px-4 py-3 font-semibold text-center">
                        {/* PRIORITY badge + E## + queue number */}
                        <QueueNumberCell rec={r} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.patientId}</td>
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3">
                        {vitals.height !== '—' ? `${vitals.height} cm` : '—'} /{' '}
                        {vitals.weight !== '—' ? `${vitals.weight} kg` : '—'}
                      </td>
                      <td className="px-4 py-3">{bmi}</td>
                      <td className="px-4 py-3">
                        {vitals.hr !== '—' ? `${vitals.hr} bpm` : '—'}
                      </td>
                      <td className="px-4 py-3">{vitals.bp}</td>
                      <td className="px-4 py-3">{vitals.temp}</td>
                      <td className="px-4 py-3">{vitals.spo2}</td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center" colSpan={9} style={{ color: '#406E65' }}>
                      {queue.length === 0 ? 'No patients in queue' : 'No results.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      {/* Results Count*/}
      {!loading && queue.length > 0 && filtered.length > 0 && (
        <div className="mt-4 text-sm text-slate-600 text-center">
          Showing <span className="font-semibold">{filtered.length}</span>
          {' '}out of{' '}
          <span className="font-semibold">{queue.length}</span>
          {' '}patient{queue.length === 1 ? '' : 's'}.
        </div>
      )}

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5">
          <button
            onClick={handleRefresh}
            className="rounded-xl border border-[#6ec1af] bg-white px-6 py-2.5 font-semibold text-[#406E65] hover:bg-emerald-50"
          >
            Refresh
          </button>
          <button
            onClick={handleExit}
            className="rounded-xl bg-[#6ec1af] px-6 py-2.5 font-semibold text-white hover:bg-emerald-800/70"
          >
            Exit
          </button>
        </div>
      </div>

      {showNowModal && queue.length > 0 && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-6 text-center">
            <h3 className="text-3xl font-extrabold tracking-wide text-[#406E65]">
              Now serving queue #{currentNumber}
            </h3>
            <p className="mt-2 text-lg text-slate-600">{queue[now]?.name}</p>
            <div className="mt-2">
              <NowServingBadge />
            </div>
            <div className="mt-4">
              <div className="mx-auto h-1 w-40 rounded-full bg-emerald-600/70" />
            </div>
            <button
              onClick={() => setShowNowModal(false)}
              className="mt-6 rounded-xl border border-slate-300 px-5 py-2.5 text-slate-800 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
