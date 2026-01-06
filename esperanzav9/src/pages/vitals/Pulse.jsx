// Pulse.jsx — revised with mock data
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import PulseImg from '../../assets/pulse.png';
import { SESSION_KEYS, initModalDelay } from './utils';

export default function Pulse() {
  const nav = useNavigate();
  const [hr, setHr] = useState(null);
  const [spo2, setSpo2] = useState(null);
  const [showInit, setShowInit] = useState(false);
  const API_BASE = 'http://localhost:8000';

  const start = () => {
    setShowInit(true);
    setTimeout(() => {
      setShowInit(false);
      // Mock readings
      // Heart rate: 60-100 bpm (normal resting range)
      const heartRate = Math.round(60 + Math.random() * 40);
      // SpO2: 95-100% (normal range)
      const oxygenSaturation = Math.round(95 + Math.random() * 5);
      
      setHr(heartRate);
      setSpo2(oxygenSaturation);
      
      sessionStorage.setItem(SESSION_KEYS.hr, String(heartRate));
      sessionStorage.setItem(SESSION_KEYS.spo2, String(oxygenSaturation));
      
      savePulseData(heartRate, oxygenSaturation);
    }, initModalDelay);
  };

  const savePulseData = async (heartRate, oxygenSaturation) => {
    try {
      const patientId = sessionStorage.getItem('patient_id');
      if (!patientId) {
        console.warn('No patient_id found in session.');
        return;
      }

      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch(`${API_BASE}/receive-vitals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patientId,
          heart_rate: heartRate,
          spo2: oxygenSaturation,
          id: currentVitalId || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Pulse data saved:', result);
        if (result.data && result.data.id) {
          sessionStorage.setItem('current_vital_id', result.data.id);
        }
      } else {
        console.error('Failed to save pulse data:', result);
      }
    } catch (err) {
      console.error('Error saving pulse data:', err);
    }
  };

  const ready = hr !== null && spo2 !== null;

  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <h2 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center">
        Step 3: Heart Rate & Oxygen Saturation
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Place your fingertip gently on the pulse sensor until the reading stabilizes.
      </p>

      {!ready && (
        <div className="mt-6 flex justify-center">
          <img
            src={PulseImg}
            alt="Pulse procedure"
            className="max-h-64 w-auto rounded-xl border border-slate-200 shadow-md"
          />
        </div>
      )}

      {!ready ? (
        <div className="mt-8 text-center">
          <button
            onClick={start}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Start
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <ResultCard label="Heart Rate" value={hr} unit="bpm" />
          <ResultCard label="Oxygen Saturation" value={spo2} unit="%" />
          <div className="md:col-span-2 text-center">
            <button
              onClick={() => nav('/vitals/temperature')}
              className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <SmallModal open={showInit}>
        <p className="text-xl font-semibold text-[#406E65]">Initializing pulse…</p>
        <p className="mt-1 text-[#406E65]">Keep your hand still.</p>
      </SmallModal>
    </section>
  );
}