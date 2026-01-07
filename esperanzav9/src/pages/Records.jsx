// Records.jsx
// Page for patients to DISPLAY patient records and vitals

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import heartRateIcon from '../assets/heart-rate.png'
import temperatureIcon from '../assets/thermometer.png'
import bloodPressureIcon from '../assets/blood-pressure.png'
import spo2Icon from '../assets/oxygen-saturation.png'
import heightIcon from '../assets/height.png'
import weightIcon from '../assets/weight.png'
import bmiIcon from '../assets/body-mass-index.png'
import printIcon from '../assets/printer-green.png'
import logoutIcon from '../assets/logout-green.png'
import Popup from '../components/ErrorPopup'

export default function Records() {
  const [profile, setProfile] = useState(null)
  const [latest, setLatest] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [printData, setPrintData] = useState(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const { username } = useParams()
  const nav = useNavigate()
  const printRef = useRef(null)
  const [popupMsg, setPopupMsg] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);


  // ---------- helpers ----------
  const calcAge = (dobStr) => {
    if (!dobStr) return null
    const dob = new Date(dobStr)
    if (Number.isNaN(dob.getTime())) return null
    const t = new Date()
    let age = t.getFullYear() - dob.getFullYear()
    const m = t.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) age--
    return age
  }

  const initialsOf = (name = '') =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'PT'

  const isSameYMD = (a, b) => {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate()
  }

  // BP normalizers
  const normalizeBP = (obj) => {
    if (!obj) return null
    if (typeof obj === 'string') return obj
    // flat names
    if (obj.blood_pressure) return obj.blood_pressure
    if (obj.bp) return obj.bp
    // nested containers
    if (obj.vitals) {
      const fromNested = normalizeBP(obj.vitals)
      if (fromNested) return fromNested
    }
    if (obj.latest_vitals) {
      const fromLatest = normalizeBP(obj.latest_vitals)
      if (fromLatest) return fromLatest
    }
    // split fields
    const sys = obj.systolic ?? obj.sys
    const dia = obj.diastolic ?? obj.dia
    if (sys != null && dia != null) return `${sys}/${dia}`
    return null
  }

  const getRowBP = (row) => {
    // 1) try any shape on the row
    const found = normalizeBP(row)
    if (found) return found

    // 2) fallback: if user just entered BP on this same day and backend
    //    didn't include it in history yet, show the local value
    const fallback = sessionStorage.getItem('step_bp') || sessionStorage.getItem('bp')
    const ts = Number(sessionStorage.getItem('step_bp_ts') || 0)
    if (fallback && ts) {
      const when = new Date(ts)
      // row date may be ISO date/time or just YYYY-MM-DD
      const rowDate = row.date ? new Date(row.date) : null
      if (rowDate && !Number.isNaN(rowDate.getTime()) && isSameYMD(when, rowDate)) {
        return fallback
      }
      // if row doesn't have a date, still use fallback for the top-most (today) row
      if (!row.date && isSameYMD(when, new Date())) return fallback
    }
    return null
  }

  // ---------- data load ----------
  useEffect(() => {
    const loadAuthenticatedData = async () => {
      try {
        // profile
        const profileRes = await fetch('http://localhost:8000/patient/profile/', { credentials: 'include' })
        if (profileRes.status === 401) {
          nav('/login')
          return
        }
        const patientData = await profileRes.json()
        setProfile({
          first_name: patientData.first_name,
          last_name: patientData.last_name,
          middle_name: patientData.middle_name,
          name: `${patientData.first_name}${patientData.middle_name ? ' ' + patientData.middle_name.charAt(0).toUpperCase() + '.' : ''} ${patientData.last_name}`,
          patientId: patientData.patient_id,
          contact: patientData.contact,
          dob: patientData.birthdate,
          age: calcAge(patientData.birthdate),
        })
        if (patientData.username && username !== patientData.username) {
          nav(`/records/${patientData.username}`, { replace: true })
        }

        // vitals
        const vitalsRes = await fetch('http://localhost:8000/patient/vitals/', { credentials: 'include' })
        if (vitalsRes.ok) {
          const vitalsData = await vitalsRes.json()

          // latest (normalize + fallback)
          if (vitalsData.latest) {
            const latestBP = normalizeBP(vitalsData.latest) ||
                             sessionStorage.getItem('step_bp') ||
                             sessionStorage.getItem('bp') ||
                             null
            setLatest({
              heartRate: vitalsData.latest.pulse_rate ?? vitalsData.latest.hr ?? null,
              temperature: vitalsData.latest.temperature ?? null,
              spo2: vitalsData.latest.spo2 ?? vitalsData.latest.oxygen_saturation ?? null,
              bloodPressure: latestBP,
              height: vitalsData.latest.height ?? vitalsData.latest.height_cm ?? null,
              weight: vitalsData.latest.weight ?? vitalsData.latest.weight_kg ?? null,
              bmi: vitalsData.latest.bmi ?? null,
            })
          }

          // history (normalize each)
          if (Array.isArray(vitalsData.history)) {
            const normalized = vitalsData.history.map(r => ({
              ...r,
              pulse_rate: r.pulse_rate ?? r.hr ?? null,
              temperature: r.temperature ?? null,
              spo2: r.spo2 ?? r.oxygen_saturation ?? null,
              height: r.height ?? r.height_cm ?? null,
              weight: r.weight ?? r.weight_kg ?? null,
              bmi: r.bmi ?? null,
              // BP handled on display
            }))
            setRows(normalized)
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Error loading patient data:', err)
        setPopupMsg('Error loading patient data. Please login again.')
        nav('/login')
      }
    }
    loadAuthenticatedData()
  }, [nav, username])

  // ---------- actions ----------
  const handleLogout = async () => {
  try {
    await fetch('http://localhost:8000/logout/', {
      method: 'POST',
      credentials: 'include',
    })
  } catch (err) {
    console.error('Logout error:', err)
  }
  sessionStorage.clear()
  nav('/login')
}


  // ---------- Enhanced Print Functions ----------
  
  // Enhanced print function that fetches formatted data from backend
  const printLatestFromBackend = async () => {
    try {
      setIsPrinting(true)
      
      // Get patient ID
      const patientId = profile?.patientId || sessionStorage.getItem('patient_id')
      
      if (!patientId) {
        setPopupMsg('Patient ID not found. Please refresh and try again.')
        setIsPrinting(false)
        return
      }
      
      // Fetch formatted print data from backend
      const response = await fetch(`http://localhost:8000/print-vitals/${patientId}/`, {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch print data')
      }
      
      const data = await response.json()
      setPrintData(data)
      
      // Wait a bit for React to update the DOM with print data
      setTimeout(() => {
        window.print()
        setIsPrinting(false)
      }, 100)
      
    } catch (error) {
      console.error('Print error:', error)
      setPopupMsg('Failed to prepare print data. Using local data instead.')
      setIsPrinting(false)
      // Fallback to original print method
      window.print()
    }
  }

  // Direct PDF download option
  const downloadPrintablePDF = async () => {
    try {
      const patientId = profile?.patientId || sessionStorage.getItem('patient_id')
      
      if (!patientId) {
        setPopupMsg('Patient ID not found. Please refresh and try again.')
        return
      }
      
      // Fetch PDF from backend
      const response = await fetch(
        `http://localhost:8000/print-vitals/${patientId}/?format=pdf`,
        { credentials: 'include' }
      )
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }
      
      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vitals_${patientId}_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
    } catch (error) {
      console.error('PDF download error:', error)
      setPopupMsg('Failed to download PDF. Please try printing instead.')
    }
  }

  // Enhanced print ticket with backend data
  const printEnhancedTicket = () => {
    // profile-derived identity (fallback to session)
    const patientId = profile?.patientId ?? (sessionStorage.getItem('patient_id') || '—')
    const patientName = profile?.name ?? (sessionStorage.getItem('patient_name') || '—')

    // latest vitals fallback from localStorage if API didn't provide
    const latestLocal = (() => {
      try {
        return JSON.parse(localStorage.getItem('latestVitals') || 'null')
      } catch { return null }
    })()

    // prepare "results" object for printing
    const results = {
      weight: latest?.weight ?? latestLocal?.weight ?? '—',
      height: latest?.height ?? latestLocal?.height ?? '—',
      heartRate: latest?.heartRate ?? latestLocal?.heartRate ?? '—',
      spo2: latest?.spo2 ?? latestLocal?.spo2 ?? '—',
      temperature: latest?.temperature ?? latestLocal?.temperature ?? '—',
      bp: latest?.bloodPressure ?? latestLocal?.bp ?? latestLocal?.blood_pressure ?? '—',
    }

    // compute BMI if missing
    const bmi = (() => {
      if (typeof (latest?.bmi) === 'number') return latest.bmi
      const h = Number(results.height) / 100
      const w = Number(results.weight)
      if (Number.isFinite(h) && h > 0 && Number.isFinite(w)) {
        const v = w / (h * h)
        if (Number.isFinite(v)) return Number(v.toFixed(1))
      }
      return latestLocal?.bmi ?? '—'
    })()

    // triage / priority (saved by the vitals page)
    const pri = sessionStorage.getItem('last_vitals_priority') || 'NORMAL'
    const priCode = sessionStorage.getItem('last_vitals_priority_code') || null
    const priReasons = (() => {
      try { return JSON.parse(sessionStorage.getItem('last_vitals_priority_reasons') || '[]') } catch { return [] }
    })()

    // queue number (fallback to last number used today)
    const queue = (() => {
      const raw = localStorage.getItem('queueNo')
      if (!raw) return '—'
      const n = Number(raw)
      return Number.isFinite(n) ? String(n).padStart(3, '0') : '—'
    })()

    // Use backend data if available, otherwise fall back to local data
    if (printData) {
      return printData
    }

    // Local fallback data structure
    return {
      header: {
        facility_name: "Esperanza Health Center",
        document_type: "Vital Signs Result",
        printed_at: new Date().toLocaleString()
      },
      patient_info: {
        patient_id: patientId,
        name: patientName,
        age: profile?.age
      },
      measurements: {
        weight: `${results.weight} kg`,
        height: `${results.height} cm`,
        bmi: `${bmi} kg/m²`,
        pulse_rate: `${results.heartRate} bpm`,
        temperature: `${results.temperature} °C`,
        oxygen_saturation: `${results.spo2} %`,
        blood_pressure: `${results.bp} mmHg`
      },
      triage: {
        priority: pri,
        priority_code: priCode,
        reasons: priReasons
      },
      queue: {
        number: queue,
        status: "WAITING"
      },
      footer: {
        disclaimer: "This is your most recent vital signs result for personal reference. Not an official medical record.",
        recorded_at: new Date().toLocaleString()
      }
    }
  }

  // ---------- UI Components ----------
  const Card = ({ label, icon, value, unit, alt }) => (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between text-sm text-[#406E65]">
        <span>{label}</span>
        {icon && <img src={icon} alt={alt || `${label} icon`} className="h-5 w-5 object-contain select-none" draggable="false" />}
      </div>
      <div className="mt-3 text-4xl font-extrabold text-[#406E65] tabular-nums">{value ?? '—'}</div>
      {unit && <div className="mt-1 text-xs text-[#406E65]">{unit}</div>}
    </div>
  )

  const EnhancedPrintTicket = () => {
    const data = printEnhancedTicket()
    
    return (
      <div id="print-root" ref={printRef} className="hidden print:block">
        <div style={{ width: '48mm', margin: '0 auto' }}>
          {/* Header */}
          <div className="center mb6">
            <div className="big">{data.header.facility_name}</div>
            <div className="sm">{data.header.document_type}</div>
            <div className="xs">{data.header.printed_at}</div>
          </div>
          
          <div className="hr"></div>
          
          {/* Identity */}
          <div className="kv mt6">
            <div className="label">Patient ID</div>
            <div className="val">{data.patient_info.patient_id}</div>
            
            <div className="label">Patient Name</div>
            <div className="val">{data.patient_info.name}</div>
            
            {data.patient_info.age && (
              <>
                <div className="label">Age</div>
                <div className="val">{data.patient_info.age} years</div>
              </>
            )}
          </div>

          <div className="hr"></div>

          {/* Measurements */}
          <div className="label">Measurements</div>
          <div className="meas mt4">
            <div className="label">Weight</div>
            <div className="val">{data.measurements.weight}</div>
            
            <div className="label">Height</div>
            <div className="val">{data.measurements.height}</div>
            
            <div className="label">BMI</div>
            <div className="val">{data.measurements.bmi}</div>
            
            <div className="label">Pulse Rate</div>
            <div className="val">{data.measurements.pulse_rate}</div>
            
            <div className="label">SpO₂</div>
            <div className="val">{data.measurements.oxygen_saturation}</div>
            
            <div className="label">Temp</div>
            <div className="val">{data.measurements.temperature}</div>
            
            <div className="label">BP</div>
            <div className="val">{data.measurements.blood_pressure}</div>
          </div>

          <div className="hr"></div>

          {/* Triage Information */}
          <div className="label">Triage Priority</div>
          <div className="meas mt4">
            <div className="label">Priority</div>
            <div className="val" style={{
              color: data.triage.priority_code === 'RED' ? '#dc2626' :
                     data.triage.priority_code === 'ORANGE' ? '#ea580c' :
                     data.triage.priority_code === 'YELLOW' ? '#ca8a04' : '#16a34a'
            }}>
              {data.triage.priority}
            </div>
          </div>
          
          {data.triage.reasons && data.triage.reasons.length > 0 && (
            <div className="mt4">
              <div className="label mb4">Reasons:</div>
              {data.triage.reasons.map((reason, idx) => (
                <div key={idx} className="xs" style={{ marginLeft: '2mm', marginBottom: '2px' }}>
                  • {reason}
                </div>
              ))}
            </div>
          )}

          {/* Queue Number if available */}
          {data.queue.number !== '—' && (
            <>
              <div className="hr"></div>
              <div className="center mt6">
                <div className="label">Queue Number</div>
                <div className="big" style={{ fontSize: '28px', marginTop: '4px' }}>
                  {data.queue.number}
                </div>
              </div>
            </>
          )}

          <div className="hr"></div>

          {/* Footer */}
          <div className="xs center mt6">
            {data.footer.disclaimer}
          </div>
          
          {data.footer.recorded_at && (
            <div className="xs center mt4" style={{ fontSize: '8px', color: '#666' }}>
              Recorded: {data.footer.recorded_at}
            </div>
          )}
        </div>
      </div>
    )
  }

  const PrintButtonSection = () => {
  const handlePrintToPOS58 = async () => {
    try {
      const patientId = profile?.patientId || sessionStorage.getItem('patient_id');
      if (!patientId) {
        setPopupMsg("Patient ID not found.");
        return;
      }

      const res = await fetch("http://localhost:8000/print-pos58/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId }),
      });

      const data = await res.json();
      if (res.ok) {
        setPopupMsg("Printed successfully to POS58 printer!");
      } else {
        setPopupMsg("Print failed: " + data.error);
      }
    } catch (err) {
      console.error("POS58 print error:", err);
      setPopupMsg("Failed to send print command to printer.");
    }
  };

  return (
    <div className="mt-8 flex items-center justify-between flex-wrap gap-2">
      <h3 className="text-2xl font-extrabold text-[#406E65]">Your Latest Vitals</h3>

      <div className="print:hidden flex gap-2">

        {/* Print */}
        <button
          onClick={handlePrintToPOS58}
          className="inline-flex items-center gap-2 rounded-xl border border-green-400 bg-white px-4 py-2 text-green-700 hover:bg-green-50"
        >
          <img src={printIcon} alt="" className="h-4 w-4 object-contain" />
          <span className="font-medium">Print</span>
        </button>
      </div>
    </div>
  );
};

  // ---------- Loading State ----------
  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-600"></div>
          <p className="mt-2 text-[#406E65]">Loading...</p>
        </div>
      </div>
    )
  }

  const ageDisplay = profile.age ?? '—'

  return (
    <section className="relative mx-auto max-w-5xl px-4 py-16">
      {/* CSS STYLE FOR PRINTING */}
      <style>
        {`
          @page { size: 48mm auto; margin: 3mm; }

          @media print {
            body * { visibility: hidden !important; }
            #print-root, #print-root * { visibility: visible !important; }
            #print-root { position: absolute; inset: 0; width: 100%; }
          }

          /* Receipt look */
          #print-root {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          #print-root .hr { border-top: 1px dashed #000; margin: 6px 0; }
          #print-root .sm { font-size: 11px; }
          #print-root .xs { font-size: 10px; }
          #print-root .label { font-size: 10px; text-transform: uppercase; letter-spacing: .2px; color: #000; }
          #print-root .val { font-size: 10px; font-weight: 700; }
          #print-root .big { font-size: 22px; font-weight: 900; letter-spacing: 1px; }

          /* Two-column KV grid */
          #print-root .kv {
            display: grid;
            grid-template-columns: 26mm 1fr;
            row-gap: 2px;
          }

          /* Measurements grid: label on left, value on right */
          #print-root .meas {
            display: grid;
            grid-template-columns: 1fr auto;
            row-gap: 2px;
          }

          /* Utilities */
          #print-root .center { text-align: center; }
          #print-root .mt4 { margin-top: 4px; }
          #print-root .mt6 { margin-top: 6px; }
          #print-root .mb4 { margin-bottom: 4px; }
          #print-root .mb6 { margin-bottom: 6px; }
        `}
      </style>

      <button
        onClick={() => setShowLogoutConfirm(true)}
        className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-[#406E65] shadow hover:bg-slate-50"
      >
        <img src={logoutIcon} alt="Logout" className="h-4 w-4 object-contain" />
        <span className="font-medium">Logout</span>
      </button>

      {/* Patient info */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
            {initialsOf(profile.name)}
          </div>
          <div className="min-w-[16rem]">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-[#406E65]">{profile.name}</h2>
            <p className="text-sm text-[#406E65]">
              Patient ID: <span className="font-medium">{profile.patientId}</span> •&nbsp;
              Age: <span className="font-medium">{ageDisplay}</span> •&nbsp;
              Contact: <span className="font-medium">{profile.contact}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Latest vitals header with enhanced buttons */}
      <PrintButtonSection />

      {/* Latest vitals cards */}
      <div className="mt-4 grid gap-4 md:grid-cols-3 print:gap-2">
        <Card label="Pulse Rate" icon={heartRateIcon} alt="Pulse rate" value={latest?.heartRate} unit="BPM" />
        <Card label="Temperature" icon={temperatureIcon} alt="Temperature" value={latest?.temperature} unit="°C" />
        <Card label="Oxygen Saturation" icon={spo2Icon} alt="Oxygen saturation" value={latest?.spo2} unit="%" />
        <Card label="Blood Pressure" icon={bloodPressureIcon} alt="Blood Pressure" value={latest?.bloodPressure} unit="mmHg" />
        <Card label="Height" icon={heightIcon} alt="Height" value={latest?.height} unit="cm" />
        <Card label="Weight" icon={weightIcon} alt="Weight" value={latest?.weight} unit="kg" />
        <Card label="BMI" icon={bmiIcon} alt="BMI" value={latest?.bmi} unit="kg/m²" />
      </div>

      {/* Past vitals table */}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white print:hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[#406E65] font-medium">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Pulse Rate</th>
              <th className="px-4 py-3">Blood Pressure</th>
              <th className="px-4 py-3">Temperature</th>
              <th className="px-4 py-3">SpO₂</th>
              <th className="px-4 py-3">Height</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">BMI</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-[#406E65]" colSpan={8}>
                  No history yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const bpDisplay = getRowBP(r)
                return (
                  <tr key={r.id || i} className="border-t border-slate-100 text-[#406E65]">
                    <td className="px-4 py-3">{r.date ?? '—'}</td>
                    <td className="px-4 py-3">{r.pulse_rate != null ? `${r.pulse_rate} bpm` : '—'}</td>
                    <td className="px-4 py-3">{bpDisplay ?? '—'}</td>
                    <td className="px-4 py-3">
                      {typeof r.temperature === 'number' ? `${r.temperature} °C` : (r.temperature ?? '—')}
                    </td>
                    <td className="px-4 py-3">{typeof r.spo2 === 'number' ? `${r.spo2}%` : (r.spo2 ?? '—')}</td>
                    <td className="px-4 py-3">{typeof r.height === 'number' ? `${r.height} cm` : (r.height ?? '—')}</td>
                    <td className="px-4 py-3">{typeof r.weight === 'number' ? `${r.weight} kg` : (r.weight ?? '—')}</td>
                    <td className="px-4 py-3">{typeof r.bmi === 'number' ? `${r.bmi} kg/m²` : (r.bmi ?? '—')}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Enhanced Print Ticket */}
      <EnhancedPrintTicket />
    {popupMsg && <Popup message={popupMsg} onClose={() => setPopupMsg('')} />}

    {showLogoutConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center shadow-lg">
      <p className="text-lg font-semibold text-slate-700">
        Are you sure you want to logout?
      </p>

      <div className="mt-6 flex justify-center gap-4">
        <button
          onClick={() => setShowLogoutConfirm(false)}
          className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
        >
          Cancel
        </button>

        <button
          onClick={() => {
            setShowLogoutConfirm(false);
            handleLogout();
          }}
          className="px-4 py-2 rounded-lg bg-[#6ec1af] text-white hover:bg-emerald-800/70"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
)}
    </section>
  )
}