// Temperature.jsx
// Fetches temperature from Arduino via Django API and saves to DB (dummy mode)

import React, { useState } from 'react';
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

  // Change this to your backend IP if not localhost
  const API_BASE = 'http://localhost:8000';

  // Fetch temperature (dummy version)
  const fetchTemperature = async () => {
    setLoading(true);
    setShowInit(true);
    setError('');

    try {
      // Simulate delay as if calling the real API
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // ✅ Dummy temperature data
      const dummyData = [
        { temperature: 37.23456 },
      ];

      // Round temperature value
      const roundedData = dummyData.map((item) => ({
        temperature: Number(item.temperature.toFixed(1)),
      }));

      // ✅ Use dummy data instead of res/data from API
      if (roundedData[0].temperature !== undefined) {
        const tempValue = roundedData[0].temperature;
        setTemp(tempValue);
        sessionStorage.setItem('temperature', String(tempValue));
        sessionStorage.setItem('step_temp', String(tempValue));
        sessionStorage.setItem('step_temp_ts', String(Date.now()));

        // Save to backend (without complete flag)
        await saveTemperature(tempValue);
      } else {
        setError('No temperature data received from device.');
        setTemp(null);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to fetch temperature data.');
      setTemp(null);
    } finally {
      setLoading(false);
      setShowInit(false);
    }
  };

  // Save temperature to backend
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

      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        console.log('Temperature saved:', result);
        // Store the vital_id for next steps
        if (result?.data?.id) {
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
            onClick={fetchTemperature}
            disabled={loading}
            className="rounded-xl bg-[#6ec1af] px-6 py-3 font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-50"
          >
            {loading ? 'Reading...' : 'Start'}
          </button>
          {error && <p className="mt-3 text-red-600 font-medium">{error}</p>}
          {loading && <p className="mt-3 text-slate-600">Fetching temperature...</p>}
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
        <p className="text-xl font-semibold text-slate-800">Initializing temperature…</p>
        <p className="mt-1 text-slate-600">Hold steady.</p>
      </SmallModal>
    </section>
  );
}