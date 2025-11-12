// Temperature.jsx
// Fetches real temperature data from Arduino via Django API

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import TemperaturePic from '../../assets/temperature.png';

export default function Temperature() {
  const nav = useNavigate();
  const [temp, setTemp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showInit, setShowInit] = useState(false);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(false);

  const API_BASE = 'http://localhost:8000/api';

  // 🔹 Start the Arduino sensor when user clicks Start
const handleStart = async () => {
  setLoading(true);
  setError('');
  setTemp(null);

  try {
    const res = await fetch(`${API_BASE}/start_vitals/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    console.log("🔥 Response from Django:", data);

    if (res.ok && data.temperature !== undefined) {
      const tempValue = Number(data.temperature.toFixed(1));
      setTemp(tempValue);
      sessionStorage.setItem('temperature', String(tempValue));
      console.log('🌡️ Current temperature:', tempValue);
    } else {
      setError('No temperature data received from backend.');
    }
  } catch (err) {
    console.error('Error fetching temperature:', err);
    setError('Failed to connect to backend.');
  } finally {
    setLoading(false);
  }
};

  // 🔹 Fetch latest temperature from Raspberry Pi Django API
  const fetchTemperature = async () => {
    try {
      const res = await fetch('/api/start-sensor/', { method: 'POST' })
      const data = await res.json();

      if (res.ok && data.temperature !== undefined) {
        const tempValue = Number(data.temperature.toFixed(1));
        setTemp(tempValue);
        sessionStorage.setItem('temperature', String(tempValue));
        console.log('🌡️ Current temperature:', tempValue);
      } else {
        console.warn('⚠️ No temperature data received:', data);
        setError('No temperature data received from Arduino.');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Cannot connect to Raspberry Pi API.');
    }
  };

  // 🔹 Auto-fetch temperature every second once started

  // 🔹 Save temperature to backend (optional)
  const saveTemperature = async (temperatureValue) => {
    try {
      const patientId = sessionStorage.getItem('patient_id');
      if (!patientId) {
        console.warn('No patient_id found in session.');
        return;
      }

      const response = await fetch(`${API_BASE}/receive_vital_signs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patientId,
          temperature: temperatureValue,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        console.log('Temperature saved:', result);
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

      {/* 🔹 START BUTTON */}
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
          {loading && <p className="mt-3 text-slate-600">Initializing sensor…</p>}
        </div>
      ) : (
        // 🔹 Once temperature is ready
        <div className="mt-8 space-y-6 text-center">
          <ResultCard label="Temperature" value={temp} unit="°C" />
          <button
            onClick={() => {
              saveTemperature(temp);
              nav('/vitals/bp');
            }}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70"
          >
            Continue
          </button>
        </div>
      )}

      {/* Small loading modal */}
      <SmallModal open={showInit}>
        <p className="text-xl font-semibold text-slate-800">Initializing temperature…</p>
        <p className="mt-1 text-slate-600">Hold steady.</p>
      </SmallModal>
    </section>
  );
}
