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

export default function Records() {
  const [profile, setProfile] = useState(null)
  const [latest, setLatest] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const { username } = useParams()
  const nav = useNavigate()

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
    //    didn’t include it in history yet, show the local value
    const fallback = sessionStorage.getItem('step_bp') || sessionStorage.getItem('bp')
    const ts = Number(sessionStorage.getItem('step_bp_ts') || 0)
    if (fallback && ts) {
      const when = new Date(ts)
      // row date may be ISO date/time or just YYYY-MM-DD
      const rowDate = row.date ? new Date(row.date) : null
      if (rowDate && !Number.isNaN(rowDate.getTime()) && isSameYMD(when, rowDate)) {
        return fallback
      }
      // if row doesn’t have a date, still use fallback for the top-most (today) row
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
          middle_initial: patientData.middle_initial,
          name: `${patientData.first_name}${patientData.middle_initial ? ' ' + patientData.middle_initial + '.' : ''} ${patientData.last_name}`,
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
              heartRate: vitalsData.latest.heart_rate ?? vitalsData.latest.hr ?? null,
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
              heart_rate: r.heart_rate ?? r.hr ?? null,
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
        alert('Error loading patient data. Please login again.')
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

  // ====== NEW: fields for the print ticket ======
  const printRef = useRef(null)

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

  // printed timestamp
  const now = new Date()
  const printedAt = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  // print handler wired to existing button (do not change button)
  const printLatest = () => {
    window.print()
  }

  // ---------- UI ----------
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
      {/* CSS STYLE FOR PRINTING - CHANGED IF YOU NEED TO CHANGE THE LAYOUT OR FONT OF THE RECEIPTS  */}
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
        onClick={handleLogout}
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

      {/* Latest vitals header */}
      <div className="mt-8 flex items-center justify-between">
        <h3 className="text-2xl font-extrabold text-[#406E65]">Your Latest Vitals</h3>
        <button onClick={printLatest} className="print:hidden inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-[#406E65] hover:bg-slate-50">
          <img src={printIcon} alt="" className="h-4 w-4 object-contain" />
          <span className="font-medium">Print Vitals</span>
        </button>
      </div>

      {/* Latest vitals cards */}
      <div className="mt-4 grid gap-4 md:grid-cols-3 print:gap-2">
        <Card label="Pulse Rate" icon={heartRateIcon} alt="Pulse rate" value={latest?.heartRate} unit="BPM" />
        <Card label="Temperature" icon={temperatureIcon} alt="Temperature" value={latest?.temperature} unit="°C" />
        <Card label="Oxygen Saturation" icon={spo2Icon} alt="Oxygen saturation" value={latest?.spo2} unit="%" />
        <Card label="Blood Pressure" icon={bloodPressureIcon} alt="Blood Pressure" value={latest?.bloodPressure} unit="mmHg" />
        <Card label="Height" icon={heightIcon} alt="Height" value={latest?.height} unit="cm" />
        <Card label="Weight" icon={weightIcon} alt="Weight" value={latest?.weight} unit="kg" />
        <Card label="BMI" icon={bmiIcon} alt="BMI" value={latest?.bmi ?? bmi} unit="kg/m²" />
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
                    <td className="px-4 py-3">{r.heart_rate != null ? `${r.heart_rate} bpm` : '—'}</td>
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

      <p className="mt-4 hidden text-center text-xs text-[#406E65] print:block">
        Printed: {new Date().toLocaleString()}
      </p>

      {/* ===================== PRINT-ONLY TICKET ===================== */}
      <div id="print-root" ref={printRef} className="hidden print:block">
        <div style={{ width: '48mm', margin: '0 auto' }}>
          {/* Header */}
          <div className="center mb6">
            <div className="big">Esperanza Health Center</div>
            <div className="sm">Vital Signs Result</div>
            <div className="xs">{printedAt}</div>
          </div>
          
          <div className="hr">
          {/* Identity */}
          <div className="kv mt6">
            <div className="label">Patient ID</div><div className="val">{patientId}</div>
            <div className="label">Patient Name</div><div className="val">{patientName}</div>
          </div>
          </div>

          <div className="hr"></div>

          {/* Measurements */}
          <div className="label">Measurements</div>
          <div className="meas mt4">
            <div className="label">Weight</div><div className="val">{results.weight} kg</div>
            <div className="label">Height</div><div className="val">{results.height} cm</div>
            <div className="label">BMI</div><div className="val">{bmi} kg/m²</div>
            <div className="label">Pulse Rate</div><div className="val">{results.heartRate} bpm</div>
            <div className="label">SpO₂</div><div className="val">{results.spo2} %</div>
            <div className="label">Temp</div><div className="val">{results.temperature} °C</div>
            <div className="label">BP</div><div className="val">{results.bp} mmHg</div>
          </div>

          <div className="hr"></div>

          {/* Footer */}
          <div className="xs center mt6">
            Here are your most recent vital signs results for your personal reference. This is not an official medical record.
          </div>
        </div>
      </div>
      {/* =================== END PRINT-ONLY TICKET =================== */}
      
    </section>
  )
}
