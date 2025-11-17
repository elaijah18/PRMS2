// Height.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import HeightImg from '../../assets/height2.png';
import { SESSION_KEYS, initModalDelay } from './utils';

export default function Height() {
  const nav = useNavigate();
  const [height, setHeight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showInit, setShowInit] = useState(false);
  const [error, setError] = useState('');

  const API_BASE = 'http://localhost:8000/api';

  const handleStart = async () => {
    setLoading(true);
    setShowInit(true);
    setError('');
    setHeight(null);

    try {
      // Trigger Arduino to measure all vitals including height
      const res = await fetch(`${API_BASE}/start_vitals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      console.log("🔥 Response from Django:", data);

      if (res.ok && data.height !== undefined) {
        const measuredHeight = Number(data.height);
        setHeight(measuredHeight);
        sessionStorage.setItem(SESSION_KEYS.height, String(measuredHeight));
        console.log('📏 Measured height:', measuredHeight);
      } else {
        setError(data.error || 'No height data received from Arduino.');
      }
    } catch (err) {
      console.error('Error fetching height:', err);
      setError('Failed to connect to Arduino.');
    } finally {
      setLoading(false);
      setTimeout(() => setShowInit(false), initModalDelay);
    }
  };

  const ready = height !== null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center">
        Step 2: Height
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Stand straight beneath the height sensor until your height is detected.
      </p>

      {!ready && (
        <div className="mt-6 flex justify-center">
          <img
            src={HeightImg}
            alt="Height procedure"
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
          <ResultCard label="Height" value={height} unit="cm" />
          <button
            onClick={() => nav('/vitals/pulse')}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Continue
          </button>
        </div>
      )}

      <SmallModal open={showInit}>
        <p className="text-xl font-semibold text-slate-800">Initializing height…</p>
        <p className="mt-1 text-slate-600">Please hold still.</p>
      </SmallModal>
    </section>
  );
}
