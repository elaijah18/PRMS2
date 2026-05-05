// Pulse.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SmallModal from '../../components/SmallModal';
import PulseImg from '../../assets/pulse.png';
import RetryButton from '../../components/RetryButton';
import { SESSION_KEYS } from './utils';

const API_BASE = 'http://localhost:8000/api';

export default function Pulse() {
  const nav = useNavigate();

  // Final confirmed values
  const [hr,   setHr]   = useState(null);
  const [spo2, setSpo2] = useState(null);

  // Live streamed values
  const [liveHr,   setLiveHr]   = useState(null);
  const [liveSpo2, setLiveSpo2] = useState(null);
  const [logs,     setLogs]     = useState([]);

  // Edit state
  const [editHr,   setEditHr]   = useState(false);
  const [editSpo2, setEditSpo2] = useState(false);
  const [tempHr,   setTempHr]   = useState('');
  const [tempSpo2, setTempSpo2] = useState('');

  // Flow control
  const [flowState, setFlowState] = useState('idle'); // 'idle'|'countdown'|'measuring'|'done'
  const [countdown, setCountdown] = useState(3);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(''); // 'getting'|'saving'|''

  const pollRef   = useRef(null);
  const logEndRef = useRef(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup poll on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── Append a line to the log terminal ──────────────────────────────────────
  const appendLog = (line) =>
    setLogs(prev => [...prev.slice(-49), line]);

  // ── Poll /api/live_pulse/ every second ─────────────────────────────────────
  const startPolling = () => {
    clearInterval(pollRef.current); // safety: never double-poll
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/live_pulse/`, {
          method: 'GET',
          credentials: 'include',
        });

        // 204 = buffer empty / waiting, not an error
        if (res.status === 204) return;
        if (!res.ok) return;

        const data = await res.json();
        const lhr   = data.heart_rate ?? null;
        const lspo2 = data.spo2       ?? null;

        if (lhr !== null && lspo2 !== null && lhr > 0 && lspo2 > 0) {
          setLiveHr(lhr);
          setLiveSpo2(lspo2);
          appendLog(`Heart Rate: ${lhr} bpm  |  SpO₂: ${lspo2} %`);
        }
      } catch {
        // silently ignore network hiccups
      }
    }, 1000);
  };

  const stopPolling = () => clearInterval(pollRef.current);

  // ── Save vitals to backend ──────────────────────────────────────────────────
  const savePulseToBackend = async (heartRate, oxygenSaturation) => {
    try {
      const patientId      = sessionStorage.getItem('patient_id');
      if (!patientId) return;
      const currentVitalId = sessionStorage.getItem('current_vital_id');

      const response = await fetch('http://localhost:8000/receive-vitals/', {
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

  // ── START: countdown → POST /api/measure_pulse/ ────────────────────────────
  const handleStart = async () => {
    setError('');
    setLogs([]);
    setLiveHr(null);
    setLiveSpo2(null);
    setHr(null);
    setSpo2(null);

    // Countdown modal
    setFlowState('countdown');
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }

    setFlowState('measuring');
    appendLog('Sensor started — reading live data…');

    try {
      // Sends PULSE to Arduino and returns immediately
      const res = await fetch(`${API_BASE}/measure_pulse/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to start pulse sensor.');
        setFlowState('idle');
        return;
      }

      // Start polling live_pulse now that Arduino is streaming
      startPolling();

    } catch (err) {
      setError('Could not connect to Arduino.');
      setFlowState('idle');
    }
  };

  // ── GET FINAL: POST /api/vitals/get-pulse-final/ ───────────────────────────
  const handleGetFinal = async () => {
    setSaving('getting');
    stopPolling();
    appendLog('── Fetching final reading from sensor… ──');

    try {
      const res  = await fetch(`${API_BASE}/get-pulse-final/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to get final readings.');
        appendLog(`Error: ${data.error || 'Failed to get final readings.'}`);
        setSaving('');
        startPolling(); // resume live polling if final fetch failed
        return;
      }

      // Arduino returns { heart_rate, oxygen_saturation }
      const finalHr   = data.heart_rate;
      const finalSpo2 = data.oxygen_saturation;

      setHr(finalHr);
      setSpo2(finalSpo2);
      sessionStorage.setItem(SESSION_KEYS.hr,   String(finalHr));
      sessionStorage.setItem(SESSION_KEYS.spo2, String(finalSpo2));

      appendLog('── Final Reading ──');
      appendLog(`Heart Rate: ${finalHr} bpm  |  SpO₂: ${finalSpo2} %`);

      await savePulseToBackend(finalHr, finalSpo2);
      setFlowState('done');

    } catch (err) {
      setError('Error retrieving final pulse data.');
      appendLog('Error: Could not reach server.');
      startPolling(); // resume if network error
    } finally {
      setSaving('');
    }
  };

  // ── RETRY ──────────────────────────────────────────────────────────────────
  const handleRetry = async () => {
    stopPolling();
    try {
      // correct URL: http://localhost:8000/api/cancel_vitals/ 
      await fetch(`${API_BASE}/cancel_vitals/`, {
        method: 'POST',
        credentials: 'include',
      });
      await new Promise(r => setTimeout(r, 500));
    } catch { /* ignore */ }

    setHr(null);
    setSpo2(null);
    setLiveHr(null);
    setLiveSpo2(null);
    setLogs([]);
    setError('');
    setFlowState('idle');
  };

  const isMeasuring = flowState === 'measuring';
  const isDone      = flowState === 'done';

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <section className="min-h-screen mx-auto px-4 py-12 flex flex-col items-center justify-center overflow-hidden scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="w-full max-w-2xl">

      {/* Header */}
      <h2 className="text-4xl md:text-6xl font-extrabold text-center bg-gradient-to-r from-emerald-700 via-teal-600 to-slate-700 bg-clip-text text-transparent leading-normal pb-2">
        Step 3: Heart Rate &amp; Oxygen Saturation
      </h2>
      <p className="mt-3 text-center text-slate-700 text-lg">
        Place your fingertip gently on the pulse sensor, then press{' '}
        <strong>Get Final Reading</strong> when the values look stable.
      </p>

      {/* Image — idle only */}
      {flowState === 'idle' && (
        <div className="mt-4 flex justify-center">
          <img
            src={PulseImg}
            alt="Pulse procedure"
            className="h-48 w-auto rounded-xl border border-slate-200 shadow-md object-contain"
          />
        </div>
      )}

      {/* ── Start Button ── */}
      {flowState === 'idle' && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            onClick={handleStart}
            className="rounded-xl bg-[#6ec1af] px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-800/70 transition-colors w-64"
          >
            Start
          </button>
          {error && <p className="text-2xl text-red-600 font-medium">{error}</p>}
        </div>
      )}

      {/* ── Live Monitor ── */}
      {(isMeasuring || isDone) && (
        <div className="mt-8 mx-auto max-w-2xl space-y-4">

          {/* Live value pills */}
          <div className="flex gap-4 justify-center">
            <div className={`flex flex-col items-center rounded-2xl border px-8 py-4 shadow-sm transition-all
              ${isMeasuring ? 'border-emerald-300 bg-emerald-50 animate-pulse' : 'border-slate-200 bg-white'}`}>
              <span className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-1">
                Heart Rate
              </span>
              <span className="text-7xl font-extrabold text-slate-800">
                {isDone ? hr : (liveHr ?? '—')}
              </span>
              <span className="text-lg text-slate-500 mt-1">bpm</span>
            </div>

            <div className={`flex flex-col items-center rounded-2xl border px-8 py-4 shadow-sm transition-all
              ${isMeasuring ? 'border-teal-300 bg-teal-50 animate-pulse' : 'border-slate-200 bg-white'}`}>
              <span className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-1">
                SpO₂
              </span>
              <span className="text-7xl font-extrabold text-slate-800">
                {isDone ? spo2 : (liveSpo2 ?? '—')}
              </span>
              <span className="text-lg text-slate-500 mt-1">%</span>
            </div>
          </div>

          {/* Log terminal */}
          <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 h-48 overflow-y-auto font-mono text-base">
            {logs.length === 0 && (
              <p className="text-slate-500 italic">Waiting for sensor data…</p>
            )}
            {logs.map((line, i) => (
              <p
                key={i}
                className={`leading-relaxed ${
                  line.startsWith('──')
                    ? 'text-emerald-400 font-semibold mt-1'
                    : line.startsWith('Error')
                    ? 'text-red-400'
                    : 'text-emerald-300'
                }`}
              >
                {line.startsWith('──') || line.startsWith('Error') ? line : `> ${line}`}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Status badge */}
          {isMeasuring && (
            <div className="flex items-center justify-center gap-2 text-lg text-emerald-700 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Sensor active — press <strong className="mx-1">Get Final Reading</strong> when stable
            </div>
          )}
          {isDone && (
            <div className="flex items-center justify-center gap-2 text-lg text-teal-700 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
              Final reading locked in
            </div>
          )}

          {error && <p className="text-2xl text-red-600 font-medium text-center">{error}</p>}
        </div>
      )}

      {/* ── Measuring action buttons ── */}
      {isMeasuring && (
        <div className="mt-6 flex justify-center gap-4">
          <RetryButton onClick={handleRetry} />
          <button
            onClick={handleGetFinal}
            disabled={saving === 'getting'}
            className="rounded-xl bg-emerald-600 px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            {saving === 'getting' ? 'Fetching…' : 'Get Final Reading'}
          </button>
        </div>
      )}

      {/* ── Done: edit cards + continue ── */}
      {isDone && (
        <div className="mt-8 mx-auto max-w-2xl space-y-4">
          <div className="grid gap-4 md:grid-cols-2">

            {/* HR edit card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-base font-medium text-slate-500">Heart Rate</p>
              <div className="mt-2 flex items-center gap-3">
                {editHr ? (
                  <>
                    <input
                      type="number"
                      value={tempHr}
                      onChange={e => setTempHr(e.target.value)}
                      className="w-24 rounded-lg border border-emerald-400 px-2 py-1 text-3xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <span className="text-lg text-slate-500">bpm</span>
                    <button
                      onClick={() => {
                        const v = Number(tempHr);
                        setHr(v);
                        sessionStorage.setItem(SESSION_KEYS.hr, String(v));
                        setEditHr(false);
                      }}
                      className="ml-auto rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-600"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-5xl font-extrabold text-slate-800">{hr}</span>
                    <span className="text-lg text-slate-500">bpm</span>
                    <button
                      onClick={() => { setTempHr(String(hr)); setEditHr(true); }}
                      className="ml-auto rounded-lg border border-slate-200 px-4 py-1.5 text-base font-medium text-slate-600 hover:bg-slate-100"
                    >
                      ✏️ Edit
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* SpO2 edit card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-base font-medium text-slate-500">Oxygen Saturation</p>
              <div className="mt-2 flex items-center gap-3">
                {editSpo2 ? (
                  <>
                    <input
                      type="number"
                      value={tempSpo2}
                      onChange={e => setTempSpo2(e.target.value)}
                      className="w-24 rounded-lg border border-emerald-400 px-2 py-1 text-3xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <span className="text-lg text-slate-500">%</span>
                    <button
                      onClick={() => {
                        const v = Number(tempSpo2);
                        setSpo2(v);
                        sessionStorage.setItem(SESSION_KEYS.spo2, String(v));
                        setEditSpo2(false);
                      }}
                      className="ml-auto rounded-lg bg-emerald-500 px-4 py-1.5 text-base font-semibold text-white hover:bg-emerald-600"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-5xl font-extrabold text-slate-800">{spo2}</span>
                    <span className="text-lg text-slate-500">%</span>
                    <button
                      onClick={() => { setTempSpo2(String(spo2)); setEditSpo2(true); }}
                      className="ml-auto rounded-lg border border-slate-200 px-4 py-1.5 text-base font-medium text-slate-600 hover:bg-slate-100"
                    >
                      ✏️ Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Retry + Continue */}
          <div className="flex justify-center gap-4">
            <RetryButton onClick={handleRetry} />
            <button
              onClick={async () => {
                setSaving('saving');
                const finalHr   = Number(sessionStorage.getItem(SESSION_KEYS.hr));
                const finalSpo2 = Number(sessionStorage.getItem(SESSION_KEYS.spo2));
                await savePulseToBackend(finalHr, finalSpo2);
                setSaving('');
                nav('/vitals/temperature');
              }}
              disabled={saving === 'saving'}
              className="rounded-xl bg-[#6ec1af] px-10 py-5 text-lg font-semibold text-white hover:bg-emerald-800/70 disabled:opacity-60 transition-colors"
            >
              {saving === 'saving' ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Countdown Modal ── */}
      <SmallModal open={flowState === 'countdown'}>
        <p className="text-2xl font-semibold text-slate-800">Keep your finger steady.</p>
        <p className="mt-1 text-lg text-slate-600">Measurement starts in…</p>
        <p className="mt-3 text-7xl font-bold text-emerald-600">{countdown}</p>
      </SmallModal>
      </div>
    </section>
  );
}