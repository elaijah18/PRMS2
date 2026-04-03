// Temperature.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import RetryButton from '../../components/RetryButton';
import TemperaturePic from '../../assets/temperature.png';

const PHASES = [
  { label: 'Measuring Temperature', duration: 3 },
];
const TOTAL_SECONDS = PHASES.reduce((s, p) => s + p.duration, 0);

export default function Temperature() {
  const nav = useNavigate();

  const [temp, setTemp]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);  // ← added
  const [showInit, setShowInit]   = useState(false);
  const [flowState, setFlowState] = useState('idle');
  const [countdown, setCountdown] = useState(3);
  const [error, setError]         = useState('');

  const [elapsed,      setElapsed]      = useState(0);
  const [phaseIndex,   setPhaseIndex]   = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const timerRef = useRef(null);

  const MEASURE_BASE = 'http://localhost:8000/api';  // for arduino endpoints
  const SAVE_BASE    = 'http://localhost:8000';       // for receive-vitals

  useEffect(() => {
    let acc = 0;
    for (let i = 0; i < PHASES.length; i++) {
      if (elapsed < acc + PHASES[i].duration) {
        setPhaseIndex(i);
        setPhaseElapsed(elapsed - acc);
        return;
      }
      acc += PHASES[i].duration;
    }
    setPhaseIndex(PHASES.length - 1);
    setPhaseElapsed(PHASES[PHASES.length - 1].duration);
  }, [elapsed]);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev >= TOTAL_SECONDS - 1) {
          clearInterval(timerRef.current);
          return TOTAL_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopTimer = () => clearInterval(timerRef.current);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const handleStart = async () => {
    setLoading(true);
    setShowInit(true);
    setFlowState('waiting');
    setCountdown(3);
    setError('');
    setTemp(null);

    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }

    setFlowState('idle');
    setShowInit(false);
    startTimer();

    try {
      const res  = await fetch(`${MEASURE_BASE}/measure_temperature/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.temperature !== undefined) {
        const tempValue = Number(data.temperature.toFixed(1));
        stopTimer();
        setTemp(tempValue);
        sessionStorage.setItem('temperature', String(tempValue));
        sessionStorage.setItem('step_temp', String(tempValue));
      } else {
        setError('No temperature data received.');
      }
    } catch {
      setError('Failed to connect to Arduino.');
    } finally {
      stopTimer();
      setLoading(false);
    }
  };

  const saveTemperature = async (temperatureValue) => {
    try {
      const patientId      = sessionStorage.getItem('patient_id');
      if (!patientId) return;
      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch(`${SAVE_BASE}/receive-vitals/`, {  // ← fixed URL
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id:  patientId,
          temperature: temperatureValue,
          id:          currentVitalId || null,
        }),
      });
      const result = await response.json();
      if (response.ok && result.data?.id) {
        sessionStorage.setItem('current_vital_id', String(result.data.id));
      }
    } catch (err) {
      console.error('Error saving temperature:', err);
    }
  };

  const handleRetry = () => {
    stopTimer();
    setTemp(null);
    setError('');
    setFlowState('idle');
    setShowInit(false);
    setElapsed(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);
  };

  const ready  = temp !== null;
  const isBusy = loading || saving;

  const phase          = PHASES[phaseIndex];
  const phaseRemaining = phase.duration - phaseElapsed;
  const phasePct       = Math.min((phaseElapsed / phase.duration) * 100, 100);

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h2 className="text-3xl md:text-5xl font-extrabold text-center bg-gradient-to-r from-emerald-700 via-teal-600 to-slate-700 bg-clip-text text-transparent leading-normal pb-2">
        Step 4: Temperature
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Place your fingertip gently on the temperature sensor until the reading stabilizes.
      </p>

      {!ready && !loading && (
        <div className="mt-4 flex justify-center">
          <img src={TemperaturePic} alt="Temperature procedure"
            className="h-32 w-auto rounded-xl border border-slate-200 shadow-md object-contain" />
        </div>
      )}

      {loading && (
        <div className="mt-6 mx-auto max-w-md space-y-4">
          <div className="flex justify-between items-center">
            {PHASES.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-4 h-4 rounded-full transition-all duration-500 ${
                  i < phaseIndex ? 'bg-emerald-500'
                  : i === phaseIndex ? 'bg-emerald-400 ring-2 ring-offset-2 ring-emerald-400 animate-pulse'
                  : 'bg-slate-200'
                }`} />
                <span className={`text-[10px] text-center leading-tight ${
                  i === phaseIndex ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                }`}>{p.label}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium text-emerald-700">{phase.label}</span>
              <span>{phaseRemaining}s left</span>
            </div>
            <div className="h-5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-1000 ease-linear"
                style={{ width: `${phasePct}%` }} />
            </div>
          </div>
        </div>
      )}

      {!ready ? (
        <div className="mt-8 flex flex-col items-center gap-4">
          <button onClick={handleStart} disabled={isBusy}
            className="rounded-xl bg-[#6ec1af] px-8 py-3.5 text-base font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 w-56 transition-colors">
            {loading ? 'Measuring…' : 'Start'}
          </button>
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>
      ) : (
        <div className="mt-8 space-y-6 text-center">
          <ResultCard label="Temperature" value={temp} unit="°C" />
          <div className="flex justify-center gap-4">
            <RetryButton onClick={handleRetry} />
            <button
              onClick={async () => {
                setSaving(true);
                await saveTemperature(temp);  // ← awaited before nav
                setSaving(false);
                nav('/vitals/bp');
              }}
              disabled={isBusy}
              className="rounded-xl bg-[#6ec1af] px-8 py-3.5 text-base font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      <SmallModal open={showInit && flowState === 'waiting'}>
        <p className="text-xl font-semibold text-slate-800">Place the finger in temperature sensor</p>
        <p className="mt-1 text-slate-600">Hold steady. Measuring starts in…</p>
        <p className="mt-3 text-5xl font-bold text-emerald-600">{countdown}</p>
      </SmallModal>
    </section>
  );
}