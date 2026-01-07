// Weight.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import { SESSION_KEYS, initModalDelay } from './utils';
import WeightImg from '../../assets/weight2.png';

export default function Weight() {
  const nav = useNavigate();
  const [weight, setWeight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showInit, setShowInit] = useState(false);
  const [error, setError] = useState('');

  const API_BASE = 'http://localhost:8000/api';

  const handleStart = async () => {
    setLoading(true);
    setShowInit(true);
    setError('');
    setWeight(null);

    try {
      // Trigger Arduino to measure all vitals including weight
      const res = await fetch(`${API_BASE}/start_vitals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      console.log("🔥 Response from Django:", data);

      if (res.ok && data.weight !== undefined) {
        const measuredWeight = Number(data.weight);
        setWeight(measuredWeight);
        sessionStorage.setItem(SESSION_KEYS.weight, String(measuredWeight));
        console.log('⚖️ Measured weight:', measuredWeight);
        
        // Save weight to backend
        await saveWeight(measuredWeight);
      } else {
        setError(data.error || 'No weight data received from Arduino.');
      }
    } catch (err) {
      console.error('Error fetching weight:', err);
      setError('Failed to connect to Arduino.');
    } finally {
      setLoading(false);
      setTimeout(() => setShowInit(false), initModalDelay);
    }
  };

  const saveWeight = async (weightValue) => {
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
          weight: weightValue,
          id: currentVitalId || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Weight saved:', result);
        // Save the record ID so the next vital (height, etc.) updates the same record
        if (result.data && result.data.id) {
          sessionStorage.setItem('current_vital_id', result.data.id);
        }
      } else {
        console.error('Failed to save weight:', result);
      }
    } catch (err) {
      console.error('Error saving weight:', err);
    }
  };

  const ready = weight !== null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center">
        Step 1: Weight
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Step carefully onto the platform. Stand still and wait for your weight to display.
      </p>

      {!ready && (
        <div className="mt-6 flex justify-center">
          <img
            src={WeightImg}
            alt="Weight procedure"
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
            {loading ? 'Measuring…' : 'Start'}
          </button>
          {error && <p className="mt-3 text-red-600 font-medium">{error}</p>}
          {loading && <p className="mt-3 text-slate-600">Initializing sensor…</p>}
        </div>
      ) : (
        <div className="mt-8 space-y-6 text-center">
          <ResultCard label="Weight" value={weight} unit="kg" />
          <button
            onClick={() => nav('/vitals/height')}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Continue
          </button>
        </div>
      )}

      <SmallModal open={showInit}>
        <p className="text-xl font-semibold text-slate-800">Initializing weight…</p>
        <p className="mt-1 text-slate-600">Please stand still.</p>
      </SmallModal>
    </section>
  );
}