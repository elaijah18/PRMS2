// Pulse.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import PulseImg from '../../assets/pulse.png';
import RetryButton from '../../components/RetryButton';
import { SESSION_KEYS } from './utils';

const PHASES = [
  { label: 'Stabilizing Heart Rate', duration: 15 },
  { label: 'Measuring Heart Rate',   duration: 15 },
  { label: 'Stabilizing Oxygen',     duration: 15 },
  { label: 'Measuring Oxygen',       duration: 15 },
];
const TOTAL_SECONDS = PHASES.reduce((s, p) => s + p.duration, 0); // 60
const initModalDelay = 500; // delay before modal disappears

export default function Pulse() {
  const [saving, setSaving] = useState(false); // ← add this
  const nav = useNavigate();
  const [hr,      setHr]      = useState(null);
  const [spo2,    setSpo2]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Timer state
  const [elapsed,      setElapsed]      = useState(0);
  const [phaseIndex,   setPhaseIndex]   = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const timerRef = useRef(null);

  // Countdown modal state
  const [showInit, setShowInit] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [flowState, setFlowState] = useState('idle'); // 'idle' | 'waiting' | 'measuring'

  const API_BASE = 'http://localhost:8000/api';

  // Derive current phase from total elapsed
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

  const stopTimer = () => {
    clearInterval(timerRef.current);
  };

  // Cleanup interval on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

// Fix 1 — save URL (same issue as Weight)
  const savePulseToBackend = async (heartRate, oxygenSaturation) => {
    try {
      const patientId      = sessionStorage.getItem('patient_id');
      if (!patientId) return;
      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch('http://localhost:8000/receive-vitals/', { // ← fixed, no /api/
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id:        patientId,
          heart_rate:        heartRate,
          oxygen_saturation: oxygenSaturation,
          id:                currentVitalId || null,
        }),
      });
      const result = await response.json();
      if (response.ok && result?.data?.id) {
        sessionStorage.setItem('current_vital_id', String(result.data.id));
      }
    } catch (err) {
      console.error('Error saving pulse:', err);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    setError('');
    setHr(null);
    setSpo2(null);
    setElapsed(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);

    // ✅ Countdown modal
    setShowInit(true);
    setFlowState('waiting');
    setCountdown(3);

    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }

    // ✅ Close modal after countdown ends, then show progress bars
    setShowInit(false);
    setFlowState('measuring');

    startTimer();

    try {
      const res = await fetch(`${API_BASE}/measure_pulse/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok) {
        const heartRate = data.heart_rate;
        const oxygenSaturation = data.spo2;
        setHr(heartRate);
        setSpo2(oxygenSaturation);
        sessionStorage.setItem(SESSION_KEYS.hr, String(heartRate));
        sessionStorage.setItem(SESSION_KEYS.spo2, String(oxygenSaturation));
        await savePulseToBackend(heartRate, oxygenSaturation);
      } else {
        setError(data.error || 'Failed to get pulse data.');
      }
    } catch (err) {
      setError('Error connecting to pulse sensor.');
    } finally {
      stopTimer();
      setLoading(false);
      setFlowState('idle');
    }
  };

  const handleRetry = async () => {
    try {
      await fetch(`${API_BASE}/cancel_vitals/`, { method: 'POST' });
      await new Promise(res => setTimeout(res, 500));
    } catch {
      // Ignore errors
    }
    setHr(null);
    setSpo2(null);
    setError('');
    setElapsed(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);
  };

  const ready = hr !== null && spo2 !== null;

  // ── Derived display values ─────────────────────────────────
  const phase          = PHASES[phaseIndex];
  const phaseRemaining = phase.duration - phaseElapsed;
  const totalRemaining = TOTAL_SECONDS - elapsed;
  const overallPct     = Math.min((elapsed / TOTAL_SECONDS) * 100, 100);
  const phasePct       = Math.min((phaseElapsed / phase.duration) * 100, 100);

  const phaseColors = ['bg-yellow-400','bg-emerald-400','bg-yellow-400','bg-emerald-400'];

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      {/* Header */}
      <h2 className="text-3xl md:text-5xl font-extrabold text-center bg-gradient-to-r from-emerald-700 via-teal-600 to-slate-700 bg-clip-text text-transparent leading-normal pb-2">
        Step 3: Heart Rate &amp; Oxygen Saturation
      </h2>
      <p className="mt-3 text-center text-slate-700">
        Place your fingertip gently on the pulse sensor until the reading stabilizes.
      </p>

      {/* Image — small, centered, only when idle */}
      {!ready && !loading && (
        <div className="mt-4 flex justify-center">
          <img
            src={PulseImg}
            alt="Pulse procedure"
            className="h-32 w-auto rounded-xl border border-slate-200 shadow-md object-contain"
          />
        </div>
      )}

      {/* ── Progress bars (visible while loading) ── */}
      {loading && (
        <div className="mt-6 mx-auto max-w-md space-y-4">
          {/* Phase stepper */}
          <div className="flex justify-between items-center">
            {PHASES.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`w-4 h-4 rounded-full transition-all duration-500 ${
                    i < phaseIndex
                      ? 'bg-emerald-500'
                      : i === phaseIndex
                      ? `${phaseColors[i]} ring-2 ring-offset-2 ring-emerald-400 animate-pulse`
                      : 'bg-slate-200'
                  }`}
                />
                <span className={`text-[10px] text-center leading-tight ${
                  i === phaseIndex ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                }`}>
                  {p.label}
                </span>
              </div>
            ))}
          </div>

          {/* Current phase bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium text-emerald-700">{phase.label}</span>
              <span>{phaseRemaining}s left</span>
            </div>
            <div className="h-5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-1000 ease-linear"
                style={{ width: `${phasePct}%` }}
              />
            </div>
          </div>

          {/* Overall bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Overall Progress</span>
              <span>{totalRemaining}s remaining</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-1000 ease-linear"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Button ── */}
      {!ready && (
        <div className="mt-8 flex flex-col items-center gap-4">
          {!loading && (
            <button
              onClick={handleStart}
              className="rounded-xl bg-[#6ec1af] px-8 py-3.5 text-base font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 w-56 transition-colors"
            >
              Start
            </button>
          )}
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>
      )}

      {/* ── Results ── */}
      {ready && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <ResultCard label="Heart Rate"        value={hr}   unit="bpm" />
          <ResultCard label="Oxygen Saturation" value={spo2} unit="%"   />
          <div className="md:col-span-2 flex justify-center gap-4">
            <RetryButton onClick={handleRetry} />
            <button
              onClick={async () => {
                setSaving(true);
                await savePulseToBackend(hr, spo2);
                setSaving(false);
                nav('/vitals/temperature');
              }}
              disabled={saving}
              className="rounded-xl bg-[#6ec1af] px-8 py-3.5 text-base font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Countdown Modal ── */}
      <SmallModal open={showInit}>
        <p className="text-xl font-semibold text-slate-800">
          Keep your finger steady.
        </p>
        <p className="mt-1 text-slate-600">
          Hold steady. Measuring starts in…
        </p>
        <p className="mt-3 text-5xl font-bold text-emerald-600">
          {countdown}
        </p>
      </SmallModal>
    </section>
  );
}
