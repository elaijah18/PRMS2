import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import priorityIcon from '../assets/disabled.png'
import nextIcon from '../assets/next.png'
import listIcon from '../assets/list.png'
import backIcon from '../assets/back.png'
import searchIcon from '../assets/search.png'

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

  const currentNumber = useMemo(() => queue[now]?.number ?? '—', [queue, now])

  // Fetch queue data with embedded vitals from backend
  const fetchQueue = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/queue/current_queue/`, {
        credentials: 'include'
      })
      
      if (!response.ok) throw new Error('Failed to fetch queue')
      
      const data = await response.json()
      
      console.log('Raw queue data from backend:', data) // Debug log
      
      // Transform backend data to match component format
      const transformedQueue = data.map((entry, index) => {
        const patient = entry.patient
        const vitals = entry.latest_vitals || {} // Get vitals from queue entry
        
        console.log(`Patient ${patient?.patient_id} vitals:`, vitals) // Debug log
        
        return {
          id: entry.id,
          number: String(index + 1).padStart(3, '0'),
          queueId: entry.id,
          patientId: patient?.patient_id || '—',
          patientDbId: patient?.id,
          name: patient 
            ? `${patient.first_name} ${patient.last_name}`.toUpperCase()
            : 'UNKNOWN',
          sex: patient?.sex || '—',
          address: patient?.address || '—',
          contact: patient?.contact_number || '—',
          date: patient?.date_of_birth || '—',
          priority: entry.priority || 'NORMAL',
          enteredAt: entry.entered_at,
          // Store vitals directly in queue entry
          vitals: {
            height: vitals.height || null,
            weight: vitals.weight || null,
            hr: vitals.heart_rate || null,
            bp: vitals.blood_pressure || null,
            temp: vitals.temperature || null,
            spo2: vitals.oxygen_saturation || null,
            bmi: vitals.bmi || null
          }
        }
      })
      
      console.log('Transformed queue with vitals:', transformedQueue) // Debug log
      setQueue(transformedQueue)
    } catch (error) {
      console.error('Error fetching queue:', error)
      setQueue([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fetch queue on mount
    fetchQueue()
    
    // Refresh every 10 seconds (increased frequency for real-time updates)
    const interval = setInterval(fetchQueue, 10000)
    return () => clearInterval(interval)
  }, [])

  // Get vitals for a specific patient (now from queue data itself)
  const getPatientVitals = (queueEntry) => {
    if (!queueEntry || !queueEntry.vitals) {
      return {
        height: '—',
        weight: '—',
        hr: '—',
        bp: '—',
        temp: '—',
        spo2: '—',
        bmi: '—'
      }
    }

    const v = queueEntry.vitals
    return {
      height: v.height || '—',
      weight: v.weight || '—',
      hr: v.hr || '—',
      bp: v.bp || '—',
      temp: v.temp ? `${v.temp} °C` : '—',
      spo2: v.spo2 ? `${v.spo2}%` : '—',
      bmi: v.bmi || '—'
    }
  }

  // Actions
  const handleNext = async () => {
    if (queue.length === 0) return
    
    const currentEntry = queue[now]
    
    // Mark current patient as complete
    try {
      await fetch(`${API_URL}/queue/${currentEntry.queueId}/mark_complete/`, {
        method: 'POST',
        credentials: 'include'
      })
      
      // Refresh queue after marking complete
      await fetchQueue()
      
      // Reset to first patient
      setNow(0)
      setShowNowModal(true)
      setTimeout(() => setShowNowModal(false), 2000)
    } catch (error) {
      console.error('Error marking patient complete:', error)
      // Still show modal and move to next even if API fails
      setNow((n) => Math.min(n + 1, Math.max(queue.length - 1, 0)))
      setShowNowModal(true)
      setTimeout(() => setShowNowModal(false), 2000)
    }
  }

  const handleEmergency = async () => {
    // This would typically open a modal to add an emergency patient
    alert('Emergency patient functionality: Please add patient through the main system with HIGH or CRITICAL priority')
    await fetchQueue()
  }

  const handleGoList = () => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleExit = () => nav('/staff')

  const handleRefresh = async () => {
    await fetchQueue()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return queue
    return queue.filter(
      (r) => {
        const vitals = getPatientVitals(r)
        return (
          r.number.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.patientId.toLowerCase().includes(q) ||
          (vitals.bp && vitals.bp.toString().toLowerCase().includes(q))
        )
      }
    )
  }, [queue, query])

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      {/* Back button */}
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 shadow mb-6"
      >
        <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
        <span className="text-sm font-medium">Back</span>
      </button>

      {/* Header */}
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-800">
        Queue Management
      </h1>

      {/* Controls */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* In Queue */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="flex justify-center items-center mt-2 flex-1">
            <span className="text-6xl font-black text-emerald-900 tabular-nums">
              {loading ? '...' : currentNumber}
            </span>
          </div>
          <div className="text-sm text-emerald-800/80 mt-4">
            Now Serving {queue.length > 0 && `(${queue.length} in queue)`}
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
          <div className="mt-2 text-xl font-extrabold text-emerald-800">Next Patient</div>
        </button>

        {/* Emergency / Priority */}
        <button
          onClick={handleEmergency}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <img src={priorityIcon} alt="Emergency / Priority" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">Add</div>
          <div className="mt-2 text-xl font-extrabold text-emerald-800">Emergency / Priority</div>
        </button>

        {/* Queue List*/}
        <button
          onClick={handleGoList}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <img src={listIcon} alt="Queue List" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">View</div>
          <div className="mt-2 text-xl font-extrabold text-emerald-800">Queue List</div>
        </button>
      </div>

      {/* Patient Queue table */}
      <div
        ref={tableRef}
        className="mt-6 rounded-2xl border shadow-sm overflow-hidden bg-white"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-5 pt-5">
          <div className="text-lg font-extrabold" style={{ color: '#406E65' }}>
            Patient <span className="text-emerald-700">Queue</span>
          </div>
          <div className="w-full md:w-[26rem]">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search number, name, patient ID, BP…"
                className="w-full rounded-full border border-emerald-200/70 bg-emerald-50/40 px-4 py-2.5 pr-10 text-emerald-900 placeholder-emerald-800/60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-800/70">
                <img src={searchIcon} alt="Search" className="h-5 w-5 object-contain select-none" draggable="false" />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          {loading ? (
            <div className="px-4 py-12 text-center text-emerald-700">
              Loading queue...
            </div>
          ) : (
            <table className="min-w-full text-left text-sm" style={{ color: '#406E65' }}>
              <thead style={{ background: '#DCEBE8', color: '#406E65' }}>
                <tr>
                  <th className="px-4 py-3">Queue #</th>
                  <th className="px-4 py-3">Patient ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Height/Weight</th>
                  <th className="px-4 py-3">BMI</th>
                  <th className="px-4 py-3">Heart Rate</th>
                  <th className="px-4 py-3">Blood Pressure</th>
                  <th className="px-4 py-3">Temperature</th>
                  <th className="px-4 py-3">Oxygen Saturation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const vitals = getPatientVitals(r)
                  const bmi = r.vitals.bmi || calcBmi(r.vitals.height, r.vitals.weight)
                  
                  return (
                    <tr
                      key={r.id}
                      className="border-t"
                      style={{
                        background: i === now ? '#CFE6E1' : '#DCEBE8',
                        color: '#406E65',
                      }}
                    >
                      <td className="px-4 py-3 font-semibold tabular-nums text-center">
                        {r.number}
                        {r.priority === 'CRITICAL' && (
                          <span className="ml-1 text-red-600 font-bold"></span>
                        )}
                        {r.priority === 'HIGH' && (
                          <span className="ml-1 text-orange-600 font-bold"></span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.patientId}</td>
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3">
                        {vitals.height !== '—' ? `${vitals.height} cm` : '—'} / {vitals.weight !== '—' ? `${vitals.weight} kg` : '—'}
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

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5">
          <button
            onClick={handleRefresh}
            className="rounded-xl border border-emerald-600 bg-white px-6 py-2.5 font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Refresh
          </button>
          <button
            onClick={handleExit}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-700"
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
            <h3 className="text-3xl font-extrabold tracking-wide text-emerald-800">
              Now serving queue #{currentNumber}
            </h3>
            <p className="mt-2 text-lg text-slate-600">
              {queue[now]?.name}
            </p>
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