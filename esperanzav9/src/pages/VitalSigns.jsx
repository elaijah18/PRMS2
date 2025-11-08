// VitalSigns.jsx
// This page displays the results of a patient's vitals capture session,
// including pulse rate, temperature, oxygen saturation, height, weight, and BMI.
// It receives a queue number from the backend based on priority calculation.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { triageAbnormal } from './utils/triage'
import printIcon from '../assets/printer-green.png'

const API_URL = 'http://localhost:8000'

export default function VitalSigns() {
  const [step] = useState(3)
  const [queue, setQueue] = useState('...')  // ✅ Will be set by backend
  const [showPrinting, setShowPrinting] = useState(false)
  const [showFinished, setShowFinished] = useState(false)
  const [priority, setPriority] = useState('NORMAL')
  const [priorityCode, setPriorityCode] = useState(null)

  const nav = useNavigate()

  const profile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('patientProfile') || 'null')
    } catch {
      return null
    }
  }, [])

  const readBP = () => {
    const possible = ['bp', 'step_bp', 'blood_pressure']
    for (const k of possible) {
      const v = sessionStorage.getItem(k)
      if (v && String(v).trim().length) return String(v)
    }
    return '—'
  }

  const [results] = useState(() => ({
    heartRate: Number(sessionStorage.getItem('step_hr')) || 0,
    temperature: Number(sessionStorage.getItem('temperature')) || 0,
    spo2: Number(sessionStorage.getItem('step_spo2')) || 0,
    height: Number(sessionStorage.getItem('step_height')) || 0,
    weight: Number(sessionStorage.getItem('step_weight')) || 0,
    bp: readBP(),
  }))

  const bmi = useMemo(() => {
    const h = results.height / 100
    if (!Number.isFinite(h) || h <= 0) return '0.0'
    const val = results.weight / (h * h)
    return Number.isFinite(val) ? val.toFixed(1) : '0.0'
  }, [results.height, results.weight])

  // ✅ REMOVED: Local queue number generation
  // The backend will assign the queue number based on priority

  const savedRef = useRef(false)
  useEffect(() => {
    if (step !== 3 || savedRef.current) return

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

    const vitalsForTriage = {
      hr: results.heartRate,
      bp: results.bp,
      spo2: results.spo2,
      temp: results.temperature,
    }
    const triage = triageAbnormal(vitalsForTriage)

    let newPriority = 'NORMAL'
    if (triage.abnormal) {
      newPriority = 'PRIORITY'
    }

    setPriority(newPriority)
    sessionStorage.setItem('last_vitals_priority', newPriority)
    
    if (triage.reasons?.length) {
      sessionStorage.setItem('last_vitals_priority_reasons', JSON.stringify(triage.reasons))
    } else {
      sessionStorage.removeItem('last_vitals_priority_reasons')
    }

    // ✅ SEND TO BACKEND AND GET QUEUE NUMBER
    const send = async () => {
      try {
        const patient_id = sessionStorage.getItem('patient_id') || profile?.patientId || null

        if (!patient_id) {
          console.error('No patient_id found')
          return
        }

        // First, send vitals data
        const vitalsPayload = {
          patient_id,
          heart_rate: Number(results.heartRate) || null,
          temperature: Number(results.temperature) || null,
          oxygen_saturation: Number(results.spo2) || null,
          blood_pressure: results.bp && results.bp !== '—' ? results.bp : null,
          height: Number(results.height) || null,
          weight: Number(results.weight) || null,
        }

        const vitalsRes = await fetch(`${API_URL}/receive-vitals/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(vitalsPayload),
        })

        if (!vitalsRes.ok) {
          console.error('Failed to save vitals:', vitalsRes.status)
          return
        }

        // ✅ Now fetch the queue entry to get the assigned queue number
        const queueRes = await fetch(`${API_URL}/queue/current_queue/`, {
          credentials: 'include',
        })

        if (queueRes.ok) {
          const queueData = await queueRes.json()
          
          // Find this patient's queue entry
          const myEntry = queueData.find(entry => 
            entry.patient?.patient_id === patient_id
          )

          if (myEntry) {
            // ✅ Use the queue number from database
            const queueNum = myEntry.queue_number || '000'
            setQueue(queueNum)
            
            // Store for later use
            sessionStorage.setItem('current_queue_number', queueNum)
            
            // Update priority from backend if available
            if (myEntry.priority) {
              const backendPriority = myEntry.priority.toUpperCase()
              setPriority(backendPriority)
              sessionStorage.setItem('last_vitals_priority', backendPriority)
            }

            // Save to history with correct queue number
            const record = {
              id: `${new Date().toISOString()}-${queueNum}`,
              date: new Date().toISOString().slice(0, 10),
              hr: results.heartRate,
              bp: results.bp,
              temp: `${results.temperature} °C`,
              spo2: `${results.spo2}%`,
              name: profile?.name ?? '—',
              patientId: patient_id,
              queue: queueNum,
            }

            const history = JSON.parse(localStorage.getItem('vitalsHistory') || '[]')
            history.unshift(record)
            localStorage.setItem('vitalsHistory', JSON.stringify(history))
          } else {
            console.warn('Patient not found in queue')
            setQueue('---')
          }
        }
      } catch (e) {
        console.error('Error sending vitals to backend:', e)
        setQueue('ERROR')
      }
    }

    send()
    savedRef.current = true
  }, [step, results, bmi, profile])

  const handlePrint = () => {
    setShowPrinting(true)
    setTimeout(() => {
      window.print()
      setShowPrinting(false)
      setShowFinished(true)
    }, 800)
  }

  const pri = sessionStorage.getItem('last_vitals_priority') || priority || 'NORMAL'
  const priCode = priorityCode
  const priReasons = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('last_vitals_priority_reasons') || '[]')
    } catch {
      return []
    }
  })()
  const displayQueueNumber = queue

  const printRef = useRef(null)
  const patientId = profile?.patientId ?? (sessionStorage.getItem('patient_id') || '—')
  const patientName = profile?.name ?? (sessionStorage.getItem('patient_name') || '—')
  const now = new Date()
  const printedAt = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  const Stat = ({ label, value, unit }) => (
    <div className="rounded-3xl bg-white/90 backdrop-blur border border-[#6ec1af] shadow-[0_8px_24px_rgba(16,185,129,.15)] hover:shadow-[0_12px_28px_rgba(15,23,42,.22)] transition-shadow p-6 flex flex-col items-center text-center">
      <p className="text-[#406E65] text-sm font-medium">{label}</p>
      <p className="mt-2 text-4xl font-extrabold text-[#406E65] tabular-nums">{value}</p>
      {unit && <p className="mt-1 text-[#406E65] font-semibold text-sm">{unit}</p>}
    </div>
  )

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <style>
        {`
          @page { size: 48mm auto; margin: 3mm; }
          @media print {
            body * { visibility: hidden !important; }
            #print-root, #print-root * { visibility: visible !important; }
            #print-root { position: absolute; inset: 0; width: 100%; }
          }
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
          #print-root .qbox {
            border: 2px solid #000;
            border-radius: 4px;
            padding: 6px 0;
            text-align: center;
            margin: 4px 0 2px 0;
          }
          #print-root .kv {
            display: grid;
            grid-template-columns: 26mm 1fr;
            row-gap: 2px;
          }
          #print-root .meas {
            display: grid;
            grid-template-columns: 1fr auto;
            row-gap: 2px;
          }
          #print-root .prio {
            display: inline-block;
            border: 1px solid #000;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }
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
            <div className="rounded-3xl bg-white/90 backdrop-blur border border-[#6ec1af] shadow-[0_8px_24px_rgba(16,185,129,.15)] hover:shadow-[0_12px_28px_rgba(15,23,42,.22)] transition-shadow p-6 flex flex-col items-center text-center">
              <p className="text-center text-[#406E65]">Your Queuing Number</p>
              <div className="mt-2 flex flex-col items-center gap-2">
                {priority === 'PRIORITY' && parseInt(queue) >= 300 && (
                  <div className="inline-flex items-center gap-2">
                    <span className="rounded-md bg-red-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
                      Priority
                    </span>
                  </div>
                )}
                <p className="text-center text-5xl text-[#406E65] md:text-6xl font-extrabold tabular-nums">
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

            <div className="mt-6 text-left">
              <div className="mb-2 text-sm">
                <span className="font-semibold">Queue Number:</span>{' '}
                {parseInt(queue) >= 300 ? (
                  <span className="inline-flex items-center gap-2 align-middle">
                    <span className="rounded-md bg-red-600 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-white">
                      Priority
                    </span>
                    <span className="font-mono text-base text-slate-800">• {displayQueueNumber}</span>
                  </span>
                ) : (
                  <span className="font-mono text-base text-slate-800">{displayQueueNumber}</span>
                )}
              </div>

              {parseInt(queue) >= 300 && priReasons.length > 0 && (
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

      <div id="print-root" ref={printRef} className="hidden print:block">
        <div style={{ width: '48mm', margin: '0 auto' }}>
          <div className="center mb6">
            <div className="big">Esperanza Health Center</div>
            <div className="sm">Vital Signs Result</div>
            <div className="xs">{printedAt}</div>
          </div>

          <div className="hr"></div>

          <div className="center">
            <div className="label">Queue No.</div>
            <div className="qbox big">{queue}</div>
            <div className="mt4">
              <span className="label">Priority:&nbsp;</span>
              {parseInt(queue) >= 300
                ? <span className="prio">Priority</span>
                : <span className="val">Normal</span>}
            </div>
          </div>

          <div className="kv mt6">
            <div className="label">Patient ID</div><div className="val">{patientId}</div>
            <div className="label">Patient Name</div><div className="val">{patientName}</div>
          </div>

          {parseInt(queue) >= 300 && priReasons?.length > 0 && (
            <>
              <div className="hr"></div>
              <div className="label mb4">Priority Reasons</div>
              <ul className="xs" style={{ margin: 0, paddingLeft: 14 }}>
                {priReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}

          <div className="hr"></div>

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

          <div className="xs center mt6">
            For check-up and consultation, please proceed to the clinic area once your queuing number has been called.
          </div>
        </div>
      </div>
    </section>
  )
}