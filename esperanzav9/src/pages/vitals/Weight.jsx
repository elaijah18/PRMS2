// Weight.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import { SESSION_KEYS, initModalDelay } from './utils';
import RetryButton from '../../components/RetryButton';
import WeightImg from '../../assets/weight2.png';

const TARE_KEY = 'scale_tared';

const TARE_PHASES  = [{ label: 'Zeroing Scale',    duration: 5 }];
const WEIGHT_PHASES = [{ label: 'Measuring Weight', duration: 4 }];

const TARE_TOTAL   = TARE_PHASES.reduce((s, p)  => s + p.duration, 0);
const WEIGHT_TOTAL = WEIGHT_PHASES.reduce((s, p) => s + p.duration, 0);

export default function Weight() {
  const nav = useNavigate();

  const [tared,     setTared]     = useState(() => sessionStorage.getItem(TARE_KEY) === 'true');
  const [weight,    setWeight]    = useState(null);
  const [taring,    setTaring]    = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [showInit,  setShowInit]  = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [error,     setError]     = useState('');
  const [tareMsg,   setTareMsg]   = useState(
    () => sessionStorage.getItem(TARE_KEY) === 'true'
      ? 'Scale already zeroed ✓  Ready to measure.'
      : ''
  );

  // Timer state
  const [elapsed,      setElapsed]      = useState(0);
  const [phases,       setPhases]       = useState(WEIGHT_PHASES);
  const [totalSeconds, setTotalSeconds] = useState(WEIGHT_TOTAL);
  const [phaseIndex,   setPhaseIndex]   = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const timerRef = useRef(null);

  const API_BASE = 'http://localhost:8000/api';

  // Derive phase from elapsed
  useEffect(() => {
    let acc = 0;
    for (let i = 0; i < phases.length; i++) {
      if (elapsed < acc + phases[i].duration) {
        setPhaseIndex(i);
        setPhaseElapsed(elapsed - acc);
        return;
      }
      acc += phases[i].duration;
    }
    setPhaseIndex(phases.length - 1);
    setPhaseElapsed(phases[phases.length - 1].duration);
  }, [elapsed, phases]);

  const startTimer = (phaseList, total) => {
    setPhases(phaseList);
    setTotalSeconds(total);
    setElapsed(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev >= total - 1) {
          clearInterval(timerRef.current);
          return total;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopTimer = () => clearInterval(timerRef.current);

  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── TARE ─────────────────────────────────────────────────────────────────
  const handleTare = async () => {
    setTaring(true);
    setTareMsg('');
    setError('');
    startTimer(TARE_PHASES, TARE_TOTAL);

    try {
      const res  = await fetch(`${API_BASE}/tare_weight/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok) {
        setTared(true);
        sessionStorage.setItem(TARE_KEY, 'true');
        setTareMsg('Scale zeroed ✓  You may now measure patients.');
      } else {
        setError(data.error || 'Tare failed. Please try again.');
      }
    } catch {
      setError('Failed to connect to Arduino.');
    } finally {
      stopTimer();
      setTaring(false);
    }
  };

  // ── START ─────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setMeasuring(true);
    setShowInit(true);
    setCountdown(3);
    setError('');

    // Countdown 3-2-1
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setShowInit(false);

    startTimer(WEIGHT_PHASES, WEIGHT_TOTAL);

    try {
      const res  = await fetch(`${API_BASE}/measure_weight/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.weight !== undefined && Number(data.weight) > 0) {
        const measuredWeight = Number(data.weight);
        setWeight(measuredWeight);
        sessionStorage.setItem(SESSION_KEYS.weight, String(measuredWeight));
        await saveWeight(measuredWeight);
      } else {
        setError(
          data.error || 'No valid weight received. Make sure you are standing on the scale.'
        );
      }
    } catch {
      setError('Failed to connect to Arduino.');
    } finally {
      stopTimer();
      setMeasuring(false);
      setTimeout(() => setShowInit(false), initModalDelay);
    }
  };

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const saveWeight = async (weightValue) => {
    try {
      const patientId      = sessionStorage.getItem('patient_id');
      if (!patientId) return;
      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch('http://localhost:8000/receive-vitals/', { // ← fixed, no /api/
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patientId,
          weight:     weightValue,
          id:         currentVitalId || null,
        }),
      });
      const result = await response.json();
      if (response.ok && result.data?.id) {
        sessionStorage.setItem('current_vital_id', String(result.data.id));
      }
    } catch (err) {
      console.error('Error saving weight:', err);
    }
  };

  const ready  = weight !== null;
  const isBusy = taring || measuring;

  const handleRetry = () => {
    setWeight(null);
    setError('');
    setShowInit(false);
    stopTimer();
    setElapsed(0);
  };

  // ── Derived display values ────────────────────────────────────────────────
  const phase          = phases[phaseIndex] ?? phases[0];
  const phaseRemaining = Math.max(phase.duration - phaseElapsed, 0);
  const overallPct     = Math.min((elapsed / totalSeconds) * 100, 100);
  const phasePct       = Math.min((phaseElapsed / phase.duration) * 100, 100);
  const isRunning      = taring || measuring;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <section className="min-h-screen mx-auto px-4 py-12 flex flex-col padding-top-[-100px] items-center justify-center overflow-hidden scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="w-full max-w-2xl">
        {/* Header */}
        <h2 className="text-4xl md:text-6xl font-extrabold text-center bg-gradient-to-r from-emerald-700 via-teal-600 to-slate-700 bg-clip-text text-transparent leading-normal pb-2">
          Step 1: Weight
        </h2>
        <p className="mt-3 text-center text-slate-700 text-lg">
          Zero the scale once at the start of the day with <strong>Tare</strong>, then use <strong>Start</strong> for each patient.
        </p>

        {/* Image — small, centered, only when idle */}
        {!ready && !isRunning && (
          <div className="mt-4 flex justify-center">
            <img
              src={WeightImg}
              alt="Weight procedure"
              className="h-48 w-auto rounded-xl border border-slate-200 shadow-md object-contain"
            />
          </div>
        )}

        {/* ── Progress bar (tare OR measuring) ── */}
        {isRunning && (
          <div className="mt-6 mx-auto max-w-md space-y-4">
            {/* Phase stepper */}
            <div className="flex justify-between items-center">
            {phases.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`w-6 h-6 rounded-full transition-all duration-500 ${
                    i < phaseIndex
                      ? 'bg-emerald-500'
                      : i === phaseIndex
                      ? 'bg-emerald-400 ring-2 ring-offset-2 ring-emerald-400 animate-pulse'
                      : 'bg-slate-200'
                  }`}
                />
                <span className={`text-sm text-center leading-tight ${
                  i === phaseIndex ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                }`}>
                  {p.label}
                </span>
              </div>
            ))}
          </div>

          {/* Current phase bar */}
          <div>
            <div className="flex justify-between text-sm text-slate-500 mb-1">
              <span className="font-medium text-emerald-700">{phase.label}</span>
              <span>{phaseRemaining}s left</span>
            </div>
            <div className="h-8 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-1000 ease-linear"
                style={{ width: `${phasePct}%` }}
              />
            </div>
          </div>
        </div>
        )}

        {/* ── Buttons ── */}
        {!ready ? (
          <div className="mt-8 flex flex-col items-center gap-4">

            {/* TARE */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleTare}
                disabled={isBusy}
                className="rounded-xl bg-slate-500 px-10 py-5 text-lg font-semibold text-white hover:bg-slate-700 disabled:opacity-60 w-64 transition-colors"
              >
                {taring ? 'Taring…' : 'Tare / Zero Scale'}
              </button>
              {tareMsg && !taring && (
                <p className="text-2xl text-emerald-600 font-medium">{tareMsg}</p>
              )}
            </div>

            {/* START */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleStart}
                disabled={isBusy}
                className="rounded-xl bg-[#6ec1af] px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 w-64 transition-colors"
              >
                {measuring ? 'Measuring…' : 'Start'}
              </button>

              {!tared && !taring && (
                <p className="text-2xl text-amber-500 font-medium">
                  ⚠ Scale not yet zeroed. Tare first for accurate readings.
                </p>
              )}

              {error && (
                <p className="text-2xl text-red-600 font-medium">{error}</p>
              )}
            </div>

          </div>
        ) : (
          <div className="mt-8 space-y-6 text-center">
            <ResultCard label="Weight" value={weight} unit="kg" />
            <div className="flex justify-center gap-4">
              <RetryButton onClick={handleRetry} />
              <button
                onClick={() => nav('/vitals/height')}
                className="rounded-xl bg-[#6ec1af] px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-800/70 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Countdown Modal ── */}
      <SmallModal open={showInit}>
        <p className="text-2xl font-semibold text-slate-800">
          Please step on the scale
        </p>
        <p className="mt-1 text-lg text-slate-600">
          Stand still. Measuring starts in…
        </p>
        <p className="mt-3 text-7xl font-bold text-emerald-600">
          {countdown}
        </p>
      </SmallModal>
    </section>
  );
}
