import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import backIcon from '../assets/arrow.png'
import Popup from '../components/ErrorPopup'

const BRAND = {
  bg: '#DCEBE8',
  text: '#406E65',
  border: '#BEE1DB',
  button: '#6ec1af',
}

export default function ArchivedPatients() {
  const nav = useNavigate()

  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [popupMsg, setPopupMsg] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [vitalsMap, setVitalsMap] = useState({})
  const [loadingVitals, setLoadingVitals] = useState({})

  // Restore modal state
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [patientToRestore, setPatientToRestore] = useState(null)

  const fetchArchived = async () => {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/archived-patients/', {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch archived patients')
      const data = await res.json()
      setArchived(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setPopupMsg('Failed to load archived patients')
    } finally {
      setLoading(false)
    }
  }

  const fetchVitalsForPatient = async (patientId) => {
    if (vitalsMap[patientId] !== undefined) return // already fetched
    setLoadingVitals((prev) => ({ ...prev, [patientId]: true }))
    try {
      const res = await fetch(
        `http://localhost:8000/patient/vitals/${patientId}/`,
        { credentials: 'include' }
      )
      if (!res.ok) {
        setVitalsMap((prev) => ({ ...prev, [patientId]: null }))
        return
      }
      const data = await res.json()
      setVitalsMap((prev) => ({ ...prev, [patientId]: data }))
    } catch {
      setVitalsMap((prev) => ({ ...prev, [patientId]: null }))
    } finally {
      setLoadingVitals((prev) => ({ ...prev, [patientId]: false }))
    }
  }

  useEffect(() => {
    fetchArchived()
  }, [])

  const handleToggleExpand = (patientId) => {
    if (expandedId === patientId) {
      setExpandedId(null)
    } else {
      setExpandedId(patientId)
      fetchVitalsForPatient(patientId)
    }
  }

  const handleRestoreClick = (patient) => {
    setPatientToRestore(patient)
    setShowRestoreModal(true)
  }

  const cancelRestore = () => {
    setShowRestoreModal(false)
    setPatientToRestore(null)
  }

  const confirmRestore = async () => {
    if (!patientToRestore) return
    try {
      const res = await fetch(
        `http://localhost:8000/restore-patient/${patientToRestore.patient_id}/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to restore patient')
      }
      setPopupMsg(`${patientToRestore.name} has been restored successfully`)
      setShowRestoreModal(false)
      setPatientToRestore(null)
      // Clear cached vitals so they re-fetch if expanded again
      setVitalsMap((prev) => {
        const copy = { ...prev }
        delete copy[patientToRestore.patient_id]
        return copy
      })
      if (expandedId === patientToRestore.patient_id) setExpandedId(null)
      fetchArchived()
    } catch (err) {
      console.error(err)
      setPopupMsg(`Failed to restore: ${err.message}`)
    }
  }

  const filtered = archived.filter((p) => {
    const q = query.toLowerCase().trim()
    if (!q) return true
    return (
      p.name?.toLowerCase().includes(q) ||
      p.patient_id?.toLowerCase().includes(q)
    )
  })

  const formatDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <section className="relative mx-auto max-w-5xl px-2 py-16">
      {/* Back button */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[#406E65] hover:bg-slate-50 shadow"
        >
          <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Title */}
      <h1
        className="text-3xl font-bold text-center"
        style={{ color: BRAND.text }}
      >
        Archived Patients
      </h1>

      {/* Info banner */}
      <div
        className="mt-4 rounded-2xl border px-5 py-3 text-sm flex items-center gap-2"
        style={{
          background: BRAND.bg,
          borderColor: BRAND.border,
          color: BRAND.text,
        }}
      >
        <svg
          className="h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"
          />
        </svg>
        Archived patients are hidden from active records. Their full history is
        preserved and can be restored at any time.
      </div>

      {/* Search */}
      <div className="mt-5 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Name or Patient ID…"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="rounded-xl border border-slate-300 px-4 py-2.5 hover:bg-slate-50 text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {/* List */}
      <div className="mt-6 space-y-4">
        {loading && (
          <div className="rounded-2xl border bg-white p-6 text-slate-500 text-center">
            Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center">
            <div className="text-4xl mb-2">🗂</div>
            <p className="text-slate-500 font-medium">No archived patients found.</p>
            {query && (
              <p className="text-slate-400 text-sm mt-1">
                Try clearing the search filter.
              </p>
            )}
          </div>
        )}

        {filtered.map((p) => {
          const isExpanded = expandedId === p.patient_id
          const vitalsData = vitalsMap[p.patient_id]
          const isLoadingV = loadingVitals[p.patient_id]

          return (
            <div
              key={p.patient_id}
              className="rounded-2xl border bg-white overflow-hidden shadow-sm"
            >
              {/* Patient row */}
              <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Archive icon badge */}
                  <div
                    className="rounded-xl p-2.5 flex-shrink-0"
                    style={{ background: BRAND.bg }}
                  >
                    <svg
                      className="h-5 w-5"
                      style={{ color: BRAND.text }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4"
                      />
                    </svg>
                  </div>

                  <div>
                    <h3
                      className="text-lg font-extrabold leading-tight"
                      style={{ color: BRAND.text }}
                    >
                      {p.name || '—'}
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      <span className="font-semibold text-slate-600">
                        {p.patient_id}
                      </span>
                      {' · '}Archived{' '}
                      <span className="font-medium">{formatDate(p.archived_at)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* View History toggle */}
                  <button
                    onClick={() => handleToggleExpand(p.patient_id)}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold transition-colors"
                    style={{
                      borderColor: BRAND.border,
                      color: BRAND.text,
                      background: isExpanded ? BRAND.bg : 'white',
                    }}
                  >
                    {isExpanded ? 'Hide History' : 'View History'}
                  </button>

                  {/* Restore button */}
                  <button
                    onClick={() => handleRestoreClick(p)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: BRAND.text }}
                  >
                    Restore
                  </button>
                </div>
              </div>

              {/* Expanded vitals history */}
              {isExpanded && (
                <div
                  className="border-t px-5 pb-5"
                  style={{ borderColor: BRAND.border, background: '#f9fdfc' }}
                >
                  <p
                    className="text-sm font-bold mt-4 mb-3"
                    style={{ color: BRAND.text }}
                  >
                    Vital Signs History
                  </p>

                  {isLoadingV && (
                    <p className="text-sm text-slate-400 py-4 text-center">
                      Loading history…
                    </p>
                  )}

                  {!isLoadingV && vitalsData === null && (
                    <p className="text-sm text-slate-400 py-4 text-center">
                      Could not load vitals history.
                    </p>
                  )}

                  {!isLoadingV && vitalsData && (
                    <>
                      {/* Latest vitals cards */}
                      {vitalsData.latest && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Most Recent
                          </p>
                          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                            {[
                              {
                                label: 'Pulse Rate',
                                value: vitalsData.latest.heart_rate,
                                unit: 'BPM',
                              },
                              {
                                label: 'Temperature',
                                value: vitalsData.latest.temperature,
                                unit: '°C',
                              },
                              {
                                label: 'SpO₂',
                                value:
                                  vitalsData.latest.spo2 ??
                                  vitalsData.latest.oxygen_saturation,
                                unit: '%',
                              },
                              {
                                label: 'Blood Pressure',
                                value: vitalsData.latest.blood_pressure,
                                unit: 'mmHg',
                              },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="rounded-xl border p-3"
                                style={{
                                  background: BRAND.bg,
                                  borderColor: BRAND.border,
                                  color: BRAND.text,
                                }}
                              >
                                <div className="text-xs opacity-80">
                                  {item.label}
                                </div>
                                <div className="text-xl font-extrabold tabular-nums mt-1">
                                  {item.value ?? '—'}
                                </div>
                                <div className="text-xs opacity-60 mt-0.5">
                                  {item.unit}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full history table */}
                      {vitalsData.history && vitalsData.history.length > 0 ? (
                        <div
                          className="rounded-2xl overflow-hidden border"
                          style={{ borderColor: BRAND.border }}
                        >
                          <div className="overflow-x-auto">
                            <table
                              className="min-w-full text-sm"
                              style={{
                                background: BRAND.bg,
                                color: BRAND.text,
                              }}
                            >
                              <thead style={{ background: '#cfe5e1' }}>
                                <tr>
                                  {[
                                    'Date',
                                    'Height',
                                    'Weight',
                                    'Pulse Rate',
                                    'SpO₂',
                                    'Temp',
                                    'BMI',
                                    'Blood Pressure',
                                  ].map((h) => (
                                    <th
                                      key={h}
                                      className="px-4 py-2.5 text-left whitespace-nowrap font-semibold"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {vitalsData.history.map((r, i) => (
                                  <tr
                                    key={r.id || i}
                                    className="border-t"
                                    style={{ borderColor: BRAND.border }}
                                  >
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      {r.date}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.height ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.weight ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.heart_rate
                                        ? `${r.heart_rate} bpm`
                                        : '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.spo2 ??
                                        r.oxygen_saturation ??
                                        '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.temperature ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.bmi ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {r.blood_pressure ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 py-3 text-center">
                          No additional history records.
                        </p>
                      )}

                      {/* No vitals at all */}
                      {!vitalsData.latest &&
                        (!vitalsData.history ||
                          vitalsData.history.length === 0) && (
                          <p className="text-sm text-slate-400 py-4 text-center">
                            No vitals history found for this patient.
                          </p>
                        )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <div className="mt-4 text-sm text-slate-500 text-center">
          Showing{' '}
          <span className="font-semibold">{filtered.length}</span> archived
          patient{filtered.length !== 1 ? 's' : ''}
          {query && archived.length !== filtered.length && (
            <> out of <span className="font-semibold">{archived.length}</span> total</>
          )}
          .
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreModal && patientToRestore && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: BRAND.bg }}
            >
              <svg
                className="h-6 w-6"
                style={{ color: BRAND.text }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              Restore this patient?
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              <span className="font-semibold">{patientToRestore.name}</span>{' '}
              will be moved back to active patient records with all their history
              intact.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={cancelRestore}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestore}
                className="px-4 py-2 rounded-xl text-white font-semibold"
                style={{ background: BRAND.text }}
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {popupMsg && (
        <Popup message={popupMsg} onClose={() => setPopupMsg('')} />
      )}
    </section>
  )
}
