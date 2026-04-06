// BP.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SmallModal from '../../components/SmallModal'
import ResultCard from '../../components/ResultCard'
import { SESSION_KEYS } from './utils'
import bpImg from '../../assets/bp.png'
import { triageAbnormal, nextPriorityCode } from '../utils/triage'
import NumPad from '../../components/NumPad'

export default function BP() {
  const nav = useNavigate()

  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [activeField, setActiveField] = useState('systolic')
  const [value, setValue] = useState(null)
  const [saving, setSaving] = useState(false)

  const API_BASE = 'http://localhost:8000'

  const handleSubmit = async () => {
    const sys = systolic.trim()
    const dia = diastolic.trim()
    if (!sys || !dia) return

    const bpStr = `${sys}/${dia}`
    setValue(bpStr)

    sessionStorage.setItem(SESSION_KEYS?.bp ?? 'bp', bpStr)
    sessionStorage.setItem('step_bp', bpStr)
    sessionStorage.setItem('step_bp_ts', String(Date.now()))

    await saveBP(bpStr)
  }

  const handleNumPadKey = (key) => {
    const isBackspace = key === 'BACKSPACE' || key === '⌫'
    const isEnter = key === 'ENTER' || key === 'Enter'

    if (isEnter) {
      handleSubmit()
      return
    }

    if (activeField === 'systolic') {
      if (isBackspace) {
        setSystolic((prev) => prev.slice(0, -1))
        return
      }
      if (/^\d$/.test(key) && systolic.length < 3) {
        setSystolic((prev) => prev + key)
      }
      return
    }

    if (isBackspace) {
      setDiastolic((prev) => prev.slice(0, -1))
      return
    }
    if (/^\d$/.test(key) && diastolic.length < 3) {
      setDiastolic((prev) => prev + key)
    }
  }

  const saveBP = async (bpValue) => {
    try {
      const patientId = sessionStorage.getItem('patient_id');
      if (!patientId) {
        console.warn('No patient_id found in session.');
        return;
      }

      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch('http://localhost:8000/receive-vitals/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patientId,
          blood_pressure: bpValue,
          id: currentVitalId || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Blood pressure saved:', result);

        if (result?.data?.id) {
          sessionStorage.setItem('current_vital_id', result.data.id);
        }
      } else {
        console.error('Failed to save blood pressure:', result);
      }

    } catch (err) {
      console.error('Error saving blood pressure:', err);
    }
  };

  const handleComplete = () => {
    // ── BP is the LAST step. Clear current_vital_id so the next patient
    //    starts a completely fresh VitalSigns row. ──────────────────────
    sessionStorage.removeItem('current_vital_id');

    // Gather vitals for triage
    const vitals = {
      hr: Number(sessionStorage.getItem('step_hr')) || 0,
      bp: sessionStorage.getItem('step_bp') || sessionStorage.getItem('bp') || '—',
      spo2: Number(sessionStorage.getItem('step_spo2')) || 0,
      temp: Number(sessionStorage.getItem('step_temp') || sessionStorage.getItem('temperature')) || 0,
    }

    const triage = triageAbnormal(vitals)
    if (triage.abnormal) {
      sessionStorage.setItem('priority', 'PRIORITY')
      sessionStorage.setItem('priority_code', nextPriorityCode())
      sessionStorage.setItem('priority_reasons', JSON.stringify(triage.reasons || []))
    }

    nav('/vitals')
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center">
        Step 5: Blood Pressure
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Please input your blood pressure taken by a healthcare staff.
      </p>

      {!value && (
        <>
          <div className="mt-6 flex justify-center">
            <img
              src={bpImg}
              alt="Blood Pressure Procedure"
              className="max-h-64 w-auto rounded-xl border border-slate-200 shadow-md"
            />
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <input
              type="number"
              placeholder="Systolic (e.g., 120)"
              className="border rounded-xl px-4 py-3 shadow-sm text-center w-40"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              onFocus={() => setActiveField('systolic')}
            />
            <input
              type="number"
              placeholder="Diastolic (e.g., 80)"
              className="border rounded-xl px-4 py-3 shadow-sm text-center w-40"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              onFocus={() => setActiveField('diastolic')}
            />
          </div>

          <div className="mt-6 flex justify-center">
            <NumPad onKey={handleNumPadKey} />
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={handleSubmit}
              className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
            >
              Submit
            </button>
          </div>
        </>
      )}

      {value && (
        <div className="mt-8 space-y-6 text-center">
          <ResultCard label="Blood Pressure" value={value} unit="mmHg" />
          <button
            onClick={handleComplete}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Continue
          </button>
        </div>
      )}

      <SmallModal open={saving}>
        <p className="text-xl font-semibold text-[#406E65]">Saving blood pressure…</p>
      </SmallModal>
    </section>
  )
}
