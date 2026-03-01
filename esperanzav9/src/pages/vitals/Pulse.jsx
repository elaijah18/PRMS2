// Pulse.jsx
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInit, setShowInit] = useState(false);

  const API_BASE = 'http://localhost:8000/api';

  // ✅ Save pulse and spo2 to backend individually like Temperature.jsx
  const savePulseToBackend = async (heartRate, oxygenSaturation) => {
    try {
      const patientId = sessionStorage.getItem('patient_id');
      if (!patientId) {
        console.warn('No patient_id found in session.');
        return;
      }

      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch(`http://localhost:8000/receive-vitals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patientId,
          heart_rate: heartRate,             // ✅ matches Arduino JSON key
          oxygen_saturation: oxygenSaturation,
          id: currentVitalId || null,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        console.log('Pulse and SpO2 saved:', result);
        if (result?.data?.id) {
          sessionStorage.setItem('current_vital_id', result.data.id);
        }
      } else {
        console.error('Failed to save pulse:', result);
      }
    } catch (err) {
      console.error('Error saving pulse:', err);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    setError('');
    setShowInit(true);
    setHr(null);
    setSpo2(null);

    try {
      const res = await fetch(`${API_BASE}/start_vitals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      console.log('🔥 Response from Django:', data);

      if (res.ok) {
        // ✅ matches your Arduino JSON key
        const heartRate = data.heart_rate;
        const oxygenSaturation = data.spo2;

        setHr(heartRate);
        setSpo2(oxygenSaturation);

        sessionStorage.setItem(SESSION_KEYS.hr, String(heartRate));
        sessionStorage.setItem(SESSION_KEYS.spo2, String(oxygenSaturation));

        // ✅ Save to MySQL just like Temperature.jsx does
        await savePulseToBackend(heartRate, oxygenSaturation);

      } else {
        setError(data.error || 'Failed to get pulse data.');
      }
    } catch (err) {
      console.error('Error fetching pulse data:', err);
      setError('Error connecting to pulse sensor.');
    } finally {
      setLoading(false);
      setTimeout(() => setShowInit(false), initModalDelay);
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
            onClick={handleStart}
            disabled={loading}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60"
          >
            {loading ? 'Starting…' : 'Start'}
          </button>
          {error && <p className="mt-3 text-red-600 font-medium">{error}</p>}
          {loading && <p className="mt-3 text-slate-600">Initializing pulse sensor…</p>}
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
        <p className="text-xl font-semibold text-slate-800">Initializing pulse…</p>
        <p className="mt-1 text-slate-600">Keep your hand still.</p>
      </SmallModal>
    </section>
  );
}


