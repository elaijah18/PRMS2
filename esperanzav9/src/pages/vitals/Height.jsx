// Height.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import ResultCard from '../../components/ResultCard';
import HeightImg from '../../assets/height2.png';
import RetryButton from '../../components/RetryButton';
import { SESSION_KEYS, initModalDelay } from './utils';

const PHASES = [
  { label: 'Measuring Height', duration: 3 },
];
const TOTAL_SECONDS = PHASES.reduce((s, p) => s + p.duration, 0); // 3

export default function Height() {
  const [saving, setSaving] = useState(false); // ← add this with other useState
  const nav = useNavigate();
  const [height, setHeight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showInit, setShowInit] = useState(false);
  const [error, setError] = useState('');

  // Timer state (UI only)
  const [elapsed,      setElapsed]      = useState(0);
  const [phaseIndex,   setPhaseIndex]   = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const timerRef = useRef(null);

  // Countdown modal state
  const [countdown, setCountdown] = useState(3);

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

  const stopTimer = () => clearInterval(timerRef.current);

  // Cleanup on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── ORIGINAL saveHeight — untouched ──────────────────────────────────────
  const saveHeight = async (heightValue) => {
    try {
      const patientId = sessionStorage.getItem('patient_id');
      if (!patientId) return;
      const currentVitalId = sessionStorage.getItem('current_vital_id');
      const response = await fetch(`http://localhost:8000/receive-vitals/`, {
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
      if (response.ok && result?.data?.id) {
        sessionStorage.setItem('current_vital_id', result.data.id);
      }
    } catch (err) {
      console.error('Error saving height:', err);
    }
  };
  
  const handleContinue = async () => {
    setSaving(true);
    await saveHeight(height);  // saves again only if retry happened without re-measuring
    setSaving(false);
    nav('/vitals/pulse');
  };
  // ── ORIGINAL handleStart — fetch logic untouched ──────────────────────────
  const handleStart = async () => {
    setLoading(true);
    setShowInit(true);
    setError('');
    setHeight(null);
    setElapsed(0);
    setPhaseIndex(0);
    setPhaseElapsed(0);

    // Countdown 3-2-1
    setCountdown(3);
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setShowInit(false);

    startTimer();

    try {
      // ✅ FIXED: was measure_/ — now correctly measure_height/
      const res = await fetch(`${API_BASE}/measure_height/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      console.log('Response from Django:', data);

      if (res.ok && data.height !== undefined) {
        const measuredHeight = Number(data.height);
        stopTimer();
        setHeight(measuredHeight);
        sessionStorage.setItem(SESSION_KEYS.height, String(measuredHeight));
        await saveHeight(measuredHeight);
      } else {
        setError(data.error || 'No height data received from Arduino.');
      }
    } catch (err) {
      console.error('Error fetching height:', err);
      setError('Failed to connect to Arduino.');
    } finally {
      stopTimer();
      setLoading(false);
      setTimeout(() => setShowInit(false), initModalDelay);
    }
  };

  const ready = height !== null;

  // ── Derived display values ─────────────────────────────────
  const phase          = PHASES[phaseIndex];
  const phaseRemaining = phase.duration - phaseElapsed;
  const totalRemaining = TOTAL_SECONDS - elapsed;
  const overallPct     = Math.min((elapsed / TOTAL_SECONDS) * 100, 100);
  const phasePct       = Math.min((phaseElapsed / phase.duration) * 100, 100);

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <section className="min-h-screen mx-auto px-4 py-12 flex flex-col items-center justify-center overflow-hidden scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="w-full max-w-2xl">
        {/* Header */}
        <h2 className="text-4xl md:text-6xl font-extrabold text-center bg-gradient-to-r from-emerald-700 via-teal-600 to-slate-700 bg-clip-text text-transparent leading-normal pb-2">
        Step 2: Height
      </h2>
      <p className="mt-3 text-center text-slate-700 text-lg">
        Stand straight beneath the height sensor until your height is detected.
      </p>

        {/* Image — small, centered, only when idle */}
        {!ready && !loading && (
          <div className="mt-4 flex justify-center">
            <img
              src={HeightImg}
              alt="Height procedure"
              className="h-48 w-auto rounded-xl border border-slate-200 shadow-md object-contain"
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

        {/* ── Button ── */}
        {!ready ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              onClick={handleStart}
              disabled={loading}
              className="rounded-xl bg-[#6ec1af] px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 w-64 transition-colors"
            >
              {loading ? 'Measuring…' : 'Start'}
            </button>
            {error && <p className="text-2xl text-red-600 font-medium">{error}</p>}
          </div>
        ) : (
          <div className="mt-8 space-y-6 text-center">
            <ResultCard label="Height" value={height} unit="cm" />
            <div className="flex justify-center gap-4">
              <RetryButton onClick={() => { setHeight(null); setError(''); }} />
              <button
                onClick={handleContinue}
                disabled={saving}
                className="rounded-xl bg-[#6ec1af] px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Countdown Modal ── */}
      <SmallModal open={showInit}>
        <p className="text-2xl font-semibold text-slate-800">
          Stand straight and stay still.
        </p>
        <p className="mt-1 text-lg text-slate-600">
          Hold steady. Measuring starts in…
        </p>
        <p className="mt-3 text-7xl font-bold text-emerald-600">
          {countdown}
        </p>
      </SmallModal>
    </section>
  );
}
