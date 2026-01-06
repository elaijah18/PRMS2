// Height.jsx — revised with mock data
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import HeightImg from '../../assets/height2.png';
import { SESSION_KEYS, initModalDelay } from './utils';

export default function Height() {
  const nav = useNavigate();
  const [height, setHeight] = useState(null);
  const [showInit, setShowInit] = useState(false);
  const API_BASE = 'http://localhost:8000';

  const start = () => {
    setShowInit(true);
    setTimeout(() => {
      setShowInit(false);
      // Mock reading: random height between 150-190 cm
      const h = Math.round((150 + Math.random() * 40) * 10) / 10;
      setHeight(h);
      sessionStorage.setItem(SESSION_KEYS.height, String(h));
      saveHeight(h);
    }, initModalDelay);
  };

  const saveHeight = async (heightValue) => {
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
          height: heightValue,
          id: currentVitalId || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Height saved:', result);
        if (result.data && result.data.id) {
          sessionStorage.setItem('current_vital_id', result.data.id);
        }
      } else {
        console.error('Failed to save height:', result);
      }
    } catch (err) {
      console.error('Error saving height:', err);
    }
  };

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center">
        Step 2: Height
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Stand straight beneath the height sensor until your height is detected.
      </p>

      {!height && (
        <div className="mt-6 flex justify-center">
          <img
            src={HeightImg}
            alt="Height procedure"
            className="max-h-64 w-auto rounded-xl border border-slate-200 shadow-md"
          />
        </div>
      )}

      {!height ? (
        <div className="mt-8 text-center">
          <button
            onClick={start}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Start
          </button>
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
        <p className="text-xl font-semibold text-[#406E65]">Initializing height…</p>
        <p className="mt-1 text-[#406E65]">Please hold still.</p>
      </SmallModal>
    </section>
  );
}