// VitalSigns.jsx
// This page displays the results of a patient's vitals capture session,
// including pulse rate, temperature, oxygen saturation, height, weight, and BMI.
// It also generates a unique queuing number for the patient and allows printing of results.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { triageAbnormal, nextPriorityCode } from './utils/triage'
import printIcon from '../assets/printer-green.png'

const API_URL = 'http://localhost:8000'

export default function VitalSigns() {
  // render step (3 = summary/print step)
  const [step] = useState(3)

  // queue number state
  const [queue, setQueue] = useState('001')

  // modals
  const [showPrinting, setShowPrinting] = useState(false)
  const [showFinished, setShowFinished] = useState(false)

  // priority state (from triage)
  const [priority, setPriority] = useState('NORMAL') // 'NORMAL' | 'PRIORITY'
  const [priorityCode, setPriorityCode] = useState(null) // e.g., E01

  const nav = useNavigate()

  // --- profile (optional, if you store it) ---
  const profile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('patientProfile') || 'null')
    } catch {
      return null
    }
  }, [])

  // helper to read BP (string like "120/80") from sessionStorage with fallbacks
  const readBP = () => {
    const possible = ['bp', 'step_bp', 'blood_pressure']
    for (const k of possible) {
      const v = sessionStorage.getItem(k)
      if (v && String(v).trim().length) return String(v)
    }
    return '—'
  }

  // --- Get actual sensor values from sessionStorage ---
  const [results] = useState(() => ({
    heartRate: Number(sessionStorage.getItem('step_hr')) || 0,
    temperature: Number(sessionStorage.getItem('temperature')) || 0, // adjust key if needed
    spo2: Number(sessionStorage.getItem('step_spo2')) || 0,
    height: Number(sessionStorage.getItem('step_height')) || 0,
    weight: Number(sessionStorage.getItem('step_weight')) || 0,
    bp: readBP(), // "120/80" or "—"
  }))

  // BMI
  const bmi = useMemo(() => {
    const h = results.height / 100
    if (!Number.isFinite(h) || h <= 0) return '0.0'
    const val = results.weight / (h * h)
    return Number.isFinite(val) ? val.toFixed(1) : '0.0'
  }, [results.height, results.weight])

  // --- queue number (reset daily) ---
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const savedDate = localStorage.getItem('queueDate')
    let last = 0

    if (savedDate === today) {
      last = parseInt(localStorage.getItem('queueNo') || '0', 10)
    } else {
      localStorage.setItem('queueDate', today)
      localStorage.setItem('queueNo', '0')
    }

    const next = (last % 999) + 1
    localStorage.setItem('queueNo', String(next))
    setQueue(String(next).padStart(3, '0'))
  }, [])

  // save & push to backend ONCE
  const savedRef = useRef(false)
  useEffect(() => {
    if (step !== 3 || savedRef.current) return

    // persist latest vitals locally
    localStorage.setItem(
      'latestVitals',
      JSON.stringify({
        heartRate: results.heartRate,
        temperature: results.temperature,
        spo2: results.spo2,
        height: results.height,
        weight: results.weight,
        bmi: Number(bmi),
        bp: results.bp,
      })
    )

    // build a record for local history (optional)
    const record = {
      id: `${new Date().toISOString()}-${queue}`,
      date: new Date().toISOString().slice(0, 10),
      hr: results.heartRate,
      bp: results.bp,
      temp: `${results.temperature} °C`,
      spo2: `${results.spo2}%`,
      name: profile?.name ?? '—',
      patientId: profile?.patientId ?? (sessionStorage.getItem('patient_id') || '—'),
      queue,
    }

    // RESULTS FOR TRIAGE OR PRIORITY DECISION
    const vitalsForTriage = {
      hr: results.heartRate,
      bp: results.bp,             
      spo2: results.spo2,
      temp: results.temperature,  
    }
    const triage = triageAbnormal(vitalsForTriage)

    let newPriority = 'NORMAL'
    let newPriorityCode = null
    if (triage.abnormal) {
      newPriority = 'PRIORITY'

      // assign a code for priority (customize this logic)
      newPriorityCode = nextPriorityCode()
    }

    // update ui state
    setPriority(newPriority)
    setPriorityCode(newPriorityCode)

    // save to session for printout
    sessionStorage.setItem('last_vitals_priority', newPriority)
    if (newPriorityCode) sessionStorage.setItem('last_vitals_priority_code', newPriorityCode)
    if (triage.reasons?.length) {
      sessionStorage.setItem('last_vitals_priority_reasons', JSON.stringify(triage.reasons))
    } else {
      sessionStorage.removeItem('last_vitals_priority_reasons')
    }

    // -------- SEND TO BACKEND ----------
    const send = async () => {
      try {
        const patient_id = sessionStorage.getItem('patient_id') || profile?.patientId || null

        const payload = {
          patient_id,
          vitals: {
            height_cm: Number(results.height) || null,
            weight_kg: Number(results.weight) || null,
            heart_rate: Number(results.heartRate) || null,
            blood_pressure: results.bp && results.bp !== '—' ? results.bp : null,
            oxygen_saturation: Number(results.spo2) || null,
            temperature: Number(results.temperature) || null,
            bmi: Number.parseFloat(bmi) || null,
          },
          priority: newPriority,                 // 'NORMAL' | 'PRIORITY'
          priority_code: newPriorityCode,        // e.g., 'E07' (optional if server assigns)
          priority_reasons: triage.reasons || [],// optional for auditing
          queue_number: queue,                   // if your server wants to store/display it
        }

        const res = await fetch(`${API_URL}/queue/add_or_update/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        // If server returns the code/priority, prefer it:
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          if (data?.priority) setPriority(String(data.priority).toUpperCase())
          if (data?.priority_code) {
            setPriorityCode(data.priority_code)
            sessionStorage.setItem('last_vitals_priority_code', data.priority_code)
          }
        } else {
          console.warn('Queue add_or_update failed:', res.status)
        }
      } catch (e) {
        console.error('Error sending vitals to backend:', e)
      }
    }

    // Fire and forget
    send()

    // persist to local history
    const history = JSON.parse(localStorage.getItem('vitalsHistory') || '[]')
    history.unshift(record)
    localStorage.setItem('vitalsHistory', JSON.stringify(history))

    savedRef.current = true
  }, [step, results, bmi, queue, profile])

  // print flow
  const handlePrint = () => {
    setShowPrinting(true)
    setTimeout(() => {
      window.print()
      setShowPrinting(false)
      setShowFinished(true)
    }, 800)
  }

  // Derive what you need for the print modal INSIDE render (not inside JSX)
  const pri = sessionStorage.getItem('last_vitals_priority') || priority || 'NORMAL'
  const priCode = sessionStorage.getItem('last_vitals_priority_code') || priorityCode || null
  const priReasons = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('last_vitals_priority_reasons') || '[]')
    } catch {
      return []
    }
  })()
  const displayQueueNumber = queue // keep name you referenced in your snippet

  // REF for print area
  const printRef = useRef(null)
  const patientId = profile?.patientId ?? (sessionStorage.getItem('patient_id') || '—')
  const patientName = profile?.name ?? (sessionStorage.getItem('patient_name') || '—')
  const now = new Date()
  const printedAt = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  // small stat card
  const Stat = ({ label, value, unit }) => (
    <div className="rounded-3xl bg-white/90 backdrop-blur border border-[#6ec1af] shadow-[0_8px_24px_rgba(16,185,129,.15)] hover:shadow-[0_12px_28px_rgba(15,23,42,.22)] transition-shadow p-6 flex flex-col items-center text-center">
      <p className="text-[#406E65] text-sm font-medium">{label}</p>
      <p className="mt-2 text-4xl font-extrabold text-[#406E65] tabular-nums">{value}</p>
      {unit && <p className="mt-1 text-[#406E65] font-semibold text-sm">{unit}</p>}
    </div>
  )

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
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

          /* Queuing box */
          #print-root .qbox {
            border: 2px solid #000;
            border-radius: 4px;
            padding: 6px 0;
            text-align: center;
            margin: 4px 0 2px 0;
          }

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

          /* Subtle priority tag (prints fine on thermal) */
          #print-root .prio {
            display: inline-block;
            border: 1px solid #000;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }

          /* Utilities */
          #print-root .center { text-align: center; }
          #print-root .mt4 { margin-top: 4px; }
          #print-root .mt6 { margin-top: 6px; }
          #print-root .mb4 { margin-bottom: 4px; }
          #print-root .mb6 { margin-bottom: 6px; }
        `}
        </style>


      <h2 className="text-3xl md:text-5xl font-extrabold text-center bg-gradient-to-r from-emerald-700 via-teal-600 to-slate-700 bg-clip-text text-transparent leading-tight">
        Vitals Capture Complete!
      </h2>
      <p className="mt-2 text-center text-slate-700">
        Below are the results of your vitals today.
      </p>

      {step === 3 && (
        <>
          <div className="mt-5 grid gap-5 md:grid-cols-4">
            {/* Queue number + PRIORITY badge */}
            <div className="rounded-3xl bg-white/90 backdrop-blur border border-[#6ec1af] shadow-[0_8px_24px_rgba(16,185,129,.15)] hover:shadow-[0_12px_28px_rgba(15,23,42,.22)] transition-shadow p-6 flex flex-col items-center text-center">
              <p className="text-center text-[#406E65]">Your Queuing Number</p>
              <div className="mt-2 flex flex-col items-center gap-2">
                {priority === 'PRIORITY' && (
                  <div className="inline-flex items-center gap-2">
                    <span className="rounded-md bg-red-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
                      Priority
                    </span>
                    {priorityCode && (
                      <span className="font-mono text-xs text-red-700">{priorityCode}</span>
                    )}
                  </div>
                )}
                <p className="text-center text-5xl text-[#406E65] md:text-6xl font-extrabold text-black-800 tabular-nums">
                  {queue}
                </p>
              </div>
            </div>

            <Stat label="Weight" value={results.weight} unit="kg" />
            <Stat label="Height" value={results.height} unit="cm" />
            <Stat label="Blood Pressure" value={results.bp} unit="mmHg" />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-4">
            <Stat label="Pulse Rate" value={results.heartRate} unit="bpm" />
            <Stat label="Oxygen Saturation" value={results.spo2} unit="%" />
            <Stat label="Temperature" value={results.temperature} unit="°C" />
            <Stat label="BMI" value={bmi} unit="kg/m²" />
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/records"
              className="rounded-xl bg-[#6ec1af] hover:bg-emerald-800/70 text-white font-semibold px-5 py-3"
            >
              Go to Records
            </Link>
            <button
              onClick={handlePrint}
              className="rounded-xl border border-slate-300 hover:bg-slate-50 px-5 py-3 font-semibold text-[#406E65] inline-flex items-center gap-2"
            >
              <img src={printIcon} alt="" className="h-4 w-4 object-contain" />
              <span>Print Results</span>
            </button>

          </div>
        </>
      )}

      {/* PRINTINGGGG */}
      {showPrinting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
            <p className="text-xl font-bold text-emerald-700">Printing...</p>
          </div>
        </div>
      )}

      {showFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 text-center max-w-sm">
            <p className="text-lg font-semibold text-slate-800">
              Please get your printed results and queuing number below.
            </p>
            <button
              onClick={() => nav('/records')}
              className="mt-6 rounded-xl bg-[#6ec1af] hover:bg-emerald-800/70 text-white font-semibold px-5 py-2.5"
            >
              Finish
            </button>

            {/* Printable header snippet showing priority label and code */}
            <div className="mt-6 text-left">
              <div className="mb-2 text-sm">
                <span className="font-semibold">Queue Number:</span>{' '}
                {pri === 'PRIORITY' && priCode ? (
                  <span className="inline-flex items-center gap-2 align-middle">
                    <span className="rounded-md bg-red-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
                      Priority
                    </span>
                    <span className="font-mono text-xs text-red-700">{priCode}</span>
                    <span className="font-mono text-base text-slate-800">• {displayQueueNumber}</span>
                  </span>
                ) : (
                  <span className="font-mono text-base text-slate-800">{displayQueueNumber}</span>
                )}
              </div>

              {pri === 'PRIORITY' && priReasons.length > 0 && (
                <div className="mt-2 text-[11px] text-red-700">
                  <div className="font-semibold uppercase tracking-wide">Triage: Priority</div>
                  <ul className="list-disc pl-5">
                    {priReasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== PRINT-ONLY TICKET ===================== */}
      <div id="print-root" ref={printRef} className="hidden print:block">
        <div style={{ width: '48mm', margin: '0 auto' }}>
          {/* Header */}
          <div className="center mb6">
            <div className="big">Esperanza Health Center</div>
            <div className="sm">Vital Signs Result</div>
            <div className="xs">{printedAt}</div>
          </div>

          <div className="hr"></div>

          {/* Queue + Priority */}
          <div className="center">
            <div className="label">Queue No.</div>
            <div className="qbox big">{queue}</div>
            <div className="mt4">
              <span className="label">Priority:&nbsp;</span>
              {pri === 'PRIORITY'
                ? <span className="prio">Priority{priCode ? ` ${priCode}` : ''}</span>
                : <span className="val">Normal</span>}
            </div>
          </div>

          {/* Identity */}
          <div className="kv mt6">
            <div className="label">Patient ID</div><div className="val">{patientId}</div>
            <div className="label">Patient Name</div><div className="val">{patientName}</div>
          </div>

          {/* Priority reasons (if any) */}
          {pri === 'PRIORITY' && priReasons?.length > 0 && (
            <>
              <div className="hr"></div>
              <div className="label mb4">Priority Reasons</div>
              <ul className="xs" style={{ margin: 0, paddingLeft: 14 }}>
                {priReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}

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
            For check-up and consultation, please proceed to the clinic area once your queuing number has been called.
          </div>
        </div>
      </div>
      {/* =================== END PRINT-ONLY TICKET =================== */}

    </section>
  )
}
