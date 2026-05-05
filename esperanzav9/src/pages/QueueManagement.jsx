// Queue Management with Status Tracking (WAITING/COMPLETED)
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import priorityIcon from '../assets/disabled.png'
import nextIcon from '../assets/next.png'
import listIcon from '../assets/list.png'
import searchIcon from '../assets/search.png'
import backIcon from '../assets/arrow.png'
import Popup from '../components/ErrorPopup'
import Keyboard from '../components/Keyboard'

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
  const [showSearchKeyboard, setShowSearchKeyboard] = useState(false)
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(0)
  const [showNowModal, setShowNowModal] = useState(false)
  const tableRef = useRef(null)
  const [popupMsg, setPopupMsg] = useState('');
  const [showPriorityModal, setShowPriorityModal] = useState(false)
  const [showNormalModal, setShowNormalModal] = useState(false)
  const [currentServing, setCurrentServing] = useState(null)
  const handleNextRef = useRef(null)

  const normalPatients = useMemo(() =>
    queue.filter((r) => r.priority_status === 'NORMAL'),
    [queue]
  )

  const priorityPatients = useMemo(() =>
    queue.filter((r) => r.priority_status === 'CRITICAL' || r.priority_status === 'HIGH' || r.priority_status === 'MEDIUM'),
    [queue]
  )

  const PRIORITY_STYLES = {
    CRITICAL: { bg: '#fef2f2', border: '#fca5a5', badge: '#ef4444' },
    HIGH:     { bg: '#fff7ed', border: '#fdba74', badge: '#f97316' },
    MEDIUM:   { bg: '#fefce8', border: '#fde047', badge: '#eab308' },
  }

  const currentNumber = useMemo(() =>
    currentServing?.queue_number ?? '—',
    [currentServing]
  )

  const fetchQueue = async () => {
    try {
      setLoading(true)

      const qRes = await fetch(`${API_URL}/queue/current_queue/`, { credentials: 'include' })
      if (!qRes.ok) throw new Error('Failed to fetch queue')
      const qData = await qRes.json()

      const actualArray = Array.isArray(qData) ? qData : (qData.results || qData.data || []);
      const transformedQueue = actualArray.map((entry) => {
        const patient = entry.patient
        const vitals = entry.latest_vitals || {}

        return {
          id: entry.id,
          queueId: entry.id,
          queue_number: entry.queue_number || '000',
          priority_status: (entry.priority_status || 'NORMAL').toUpperCase(),
          priority_code: entry.priority_code || null,
          status: entry.status || 'WAITING',
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
      setNow((n) => Math.min(n, Math.max(transformedQueue.length - 1, 0)))

      // SYNC NOW SERVING WITH SEVEN SEGMENT
      try {
        const sRes = await fetch(`${API_URL}/current-display/`, { credentials: 'include' })
        if (sRes.ok) {
          const sData = await sRes.json()
          if (sData.queue_number && sData.queue_number !== '000' && sData.queue_number !== 0) {
            setCurrentServing({
              queue_number: sData.queue_number,
              name: sData.patient_name,
            })
          } else {
            setCurrentServing(null)
          }
        }
      } catch (displayError) {
        console.warn('Display sync failed:', displayError)
      }

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
    const interval = setInterval(fetchQueue, 2000)
    return () => clearInterval(interval)
  }, [])

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

const handleNext = async () => {
  if (loading) return;
  setLoading(true);
  try {
    await fetch(`${API_URL}/queue/trigger-next/`, {
      method: 'POST',
      credentials: 'include',
    });
    setTimeout(async () => {
      await fetchQueue();
      setLoading(false);
      setShowNowModal(true);
      setTimeout(() => setShowNowModal(false), 2000);
    }, 1000);
  } catch (error) {
    setLoading(false);
  }
};

  useEffect(() => {
    handleNextRef.current = handleNext
  })

  // HARDWARE BUTTON SYNC
  useEffect(() => {
      const checkHardwareButton = async () => {
          try {
              const res = await fetch(`${API_URL}/queue/check-next-button/`, { credentials: 'include' });
              const data = await res.json();
              
              if (data.pressed) {
                  // If button was pressed (hardware or another tablet), refresh NOW
                  await fetchQueue();
                  setShowNowModal(true);
                  setTimeout(() => setShowNowModal(false), 3000);
              }
          } catch (error) {
              console.error('Sync error:', error);
          }
      };
      const hardwareInterval = setInterval(checkHardwareButton, 3000); // 1 second
      return () => clearInterval(hardwareInterval);
  }, []);

  const handleEmergency = async () => {
    await fetchQueue()
    setShowPriorityModal(true)
  }

  const handleExit = () => nav('/staff')
  const handleRefresh = async () => { await fetchQueue() }

  const onSearchKeyboardPress = (key) => {
    if (key === 'BACKSPACE') {
      setQuery((value) => value.slice(0, -1))
      return
    }

    if (key === 'SPACE') {
      setQuery((value) => value + ' ')
      return
    }

    if (key === 'ENTER2' || key === 'KEYBOARD') {
      setShowSearchKeyboard(false)
      return
    }

    if (/^[A-Za-z0-9]$/.test(key) || /^[,./?-]$/.test(key)) {
      setQuery((value) => value + key)
    }
  }

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

  const QueueNumberCell = ({ rec }) => (
    <div className="flex items-center justify-center">
      <span className="tabular-nums">{rec.queue_number}</span>
    </div>
  )

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 shadow mb-6">
        <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
        <span className="text-sm font-medium">Back</span>
      </button>

      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#406E65]">
        Queue Management
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="flex justify-center items-center mt-2 flex-1">
            <span className="text-6xl font-black text-[#406E65] tabular-nums">
              {loading ? '...' : currentNumber}
            </span>
          </div>
          <div className="text-sm text-emerald-800/80 mt-4">
            Now Serving
          </div>
        </div>

        <button
          onClick={handleEmergency}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <img src={priorityIcon} alt="Emergency / Priority" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">View</div>
          <div className="mt-2 text-xl font-extrabold text-[#406E65]">Emergency / Priority</div>
          {priorityPatients.length > 0 && (
            <span className="mt-2 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {priorityPatients.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setShowNormalModal(true)}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <img src={listIcon} alt="Queue List" className="mx-auto h-10 w-10 object-contain mb-2" />
          <div className="text-sm text-slate-600">View</div>
          <div className="mt-2 text-xl font-extrabold text-[#406E65]">Queue List</div>
          {normalPatients.length > 0 && (
            <span className="mt-2 rounded-full bg-[#6ec1af] px-2.5 py-0.5 text-xs font-bold text-white">
              {normalPatients.length}
            </span>
          )}
        </button>
      </div>

      <div ref={tableRef} className="mt-6 rounded-2xl border shadow-sm overflow-hidden bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-5 pt-5">
          <div className="text-sm font-extrabold" style={{ color: '#406E65' }}>
            Patient <span className="text-[#406E65]">Queue</span>
          </div>
          <div className="w-full md:w-[26rem]">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowSearchKeyboard(true)}
                onBlur={() => setShowSearchKeyboard(false)}
                placeholder="Search number, name, patient ID, BP…"
                className="w-full rounded-full border border-emerald-200/70 bg-emerald-50/40 px-4 py-2.5 pr-10 text-[#406E65] placeholder-emerald-800/60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-800/70">
                <img src={searchIcon} alt="Search" className="h-5 w-5 object-contain select-none" draggable="false" />
              </span>
            </div>
          </div>
        </div>

        {showSearchKeyboard && (
          <div
            className="fixed bottom-4 left-1/2 z-50 w-[95vw] max-w-[42rem] -translate-x-1/2"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Keyboard onKeyPress={onSearchKeyboardPress} mode="letters" />
          </div>
        )}

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

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setNow(i)}
                      className="border-t cursor-pointer"
                      style={{
                        background: i === now ? '#CFE6E1' : '#DCEBE8',
                        color: '#406E65',
                      }}
                      title={i === now ? 'Selected' : 'Click to select'}
                      aria-selected={i === now}
                    >
                      <td className="px-4 py-3 font-semibold text-center">
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

        {!loading && queue.length > 0 && filtered.length > 0 && (
          <div className="mt-4 text-sm text-slate-600 text-center">
            Showing <span className="font-semibold">{filtered.length}</span>
            {' '}out of{' '}
            <span className="font-semibold">{queue.length}</span>
            {' '}patient{queue.length === 1 ? '' : 's'}.
          </div>
        )}

        <div className="flex justify-end gap-3 p-5">
          <button onClick={handleRefresh} className="rounded-xl border border-[#6ec1af] bg-white px-6 py-2.5 font-semibold text-[#406E65] hover:bg-emerald-50">
            Refresh
          </button>
          <button onClick={handleExit} className="rounded-xl bg-[#6ec1af] px-6 py-2.5 font-semibold text-white hover:bg-emerald-800/70">
            Exit
          </button>
        </div>
      </div>

      {showNowModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-6 text-center">
            <h3 className="text-3xl font-extrabold tracking-wide text-[#406E65]">
              Now serving queue #{currentServing?.queue_number ?? '—'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {currentServing?.name}
            </p>
            <div className="mt-4">
              <div className="mx-auto h-1 w-40 rounded-full bg-emerald-600/70" />
            </div>
            <button onClick={() => setShowNowModal(false)} className="mt-6 rounded-xl border border-slate-300 px-5 py-2.5 text-slate-800 hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>
      )}

      {popupMsg && <Popup message={popupMsg} onClose={() => setPopupMsg('')} />}

      {showPriorityModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#DCEBE8' }}>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-extrabold" style={{ color: '#406E65' }}>
                  Emergency &amp; Priority Patients
                </h3>
                {priorityPatients.length > 0 && (
                  <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
                    {priorityPatients.length}
                  </span>
                )}
              </div>
              <button onClick={() => setShowPriorityModal(false)} className="rounded-lg p-1.5 hover:bg-black/10" style={{ color: '#406E65' }}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-3">
              {priorityPatients.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <div className="text-4xl mb-2">✅</div>
                  <p className="font-medium">No priority patients in queue right now.</p>
                </div>
              ) : (
                priorityPatients.map((p) => {
                  const style = PRIORITY_STYLES[p.priority_status]
                  const vitals = getPatientVitals(p)
                  return (
                    <div key={p.id} className="rounded-xl border p-4 transition-all" style={{ background: style.bg, borderColor: style.border }}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full px-3 py-0.5 text-xs font-bold text-white" style={{ background: style.badge }}>{p.priority_status}</span>
                          <span className="font-extrabold text-slate-800">{p.name}</span>
                        </div>
                        <span className="text-2xl font-black tabular-nums" style={{ color: '#406E65' }}>#{p.queue_number}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600">
                        <div><span className="font-semibold">HR:</span> {vitals.hr}</div>
                        <div><span className="font-semibold">BP:</span> {vitals.bp}</div>
                        <div><span className="font-semibold">Temp:</span> {vitals.temp}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t">
              <button onClick={() => setShowPriorityModal(false)} className="rounded-xl px-5 py-2.5 font-semibold text-white" style={{ background: '#406E65' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showNormalModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#DCEBE8' }}>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-extrabold" style={{ color: '#406E65' }}>Normal Queue Patients</h3>
                {normalPatients.length > 0 && <span className="rounded-full bg-[#6ec1af] px-2.5 py-0.5 text-xs font-bold text-white">{normalPatients.length}</span>}
              </div>
              <button onClick={() => setShowNormalModal(false)} className="rounded-lg p-1.5 hover:bg-black/10" style={{ color: '#406E65' }}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-3">
              {normalPatients.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <div className="text-4xl mb-2">✅</div>
                  <p className="font-medium">No normal patients in queue right now.</p>
                </div>
              ) : (
                normalPatients.map((p) => {
                  const vitals = getPatientVitals(p)
                  return (
                    <div key={p.id} className="rounded-xl border p-4 transition-all" style={{ background: '#DCEBE8', borderColor: '#BEE1DB' }}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-800">{p.name}</span>
                        </div>
                        <span className="text-2xl font-black tabular-nums" style={{ color: '#406E65' }}>#{p.queue_number}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600">
                        <div><span className="font-semibold">HR:</span> {vitals.hr}</div>
                        <div><span className="font-semibold">BP:</span> {vitals.bp}</div>
                        <div><span className="font-semibold">Temp:</span> {vitals.temp}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t">
              <button onClick={() => setShowNormalModal(false)} className="rounded-xl px-5 py-2.5 font-semibold text-white" style={{ background: '#406E65' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}