// Temperature.jsx — revised with mock data
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import TemperaturePic from '../../assets/temperature.png';
import { SESSION_KEYS, initModalDelay } from './utils';

export default function Temperature() {
  const nav = useNavigate();
  const [temp, setTemp] = useState(null);
  const [showInit, setShowInit] = useState(false);
  const API_BASE = 'http://localhost:8000';

  const start = () => {
    setShowInit(true);
    setTimeout(() => {
      setShowInit(false);
      // Mock reading: temperature between 36.0-37.5°C (normal body temperature range)
      const temperature = Math.round((36.0 + Math.random() * 1.5) * 10) / 10;
      setTemp(temperature);
      sessionStorage.setItem(SESSION_KEYS.temperature, String(temperature));
      saveTemperature(temperature);
    }, initModalDelay);
  };

  const saveTemperature = async (temperatureValue) => {
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
          temperature: temperatureValue,
          id: currentVitalId || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Temperature saved:', result);
        if (result.data && result.data.id) {
          sessionStorage.setItem('current_vital_id', result.data.id);
        }
      } else {
        console.error('Failed to save temperature:', result);
      }
    } catch (err) {
      console.error('Error saving temperature:', err);
    }
  };

  const ready = temp !== null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center">
        Step 4: Temperature
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Point the infrared thermometer and wait for the reading.
      </p>

      {!ready && (
        <div className="mt-6 flex justify-center">
          <img
            src={TemperaturePic}
            alt="Temperature procedure"
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
        <div className="mt-8 space-y-6 text-center">
          <ResultCard label="Temperature" value={temp} unit="°C" />
          <button
            onClick={() => nav('/vitals/bp')}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Continue
          </button>
        </div>
      )}

      <SmallModal open={showInit}>
        <p className="text-xl font-semibold text-[#406E65]">Initializing temperature…</p>
        <p className="mt-1 text-[#406E65]">Hold steady.</p>
      </SmallModal>
    </section>
  );
}