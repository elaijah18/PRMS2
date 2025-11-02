import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Replace these with your actual icon imports
const priorityIcon = '🚨';
const nextIcon = '➡️';
const listIcon = '📋';
const backIcon = '⬅️';
const searchIcon = '🔍';

const API_BASE = 'http:localhost:8000'; // UPDATE THIS

const calcBmi = (height, weight) => {
  const h = Number(height);
  const w = Number(weight);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0) return '—';
  const m = h / 100;
  return (w / (m * m)).toFixed(1);
};

const getPriorityColor = (priority) => {
  switch (priority) {
    case 'CRITICAL': return 'bg-red-100 border-red-300 text-red-900';
    case 'HIGH': return 'bg-orange-100 border-orange-300 text-orange-900';
    case 'MEDIUM': return 'bg-yellow-100 border-yellow-300 text-yellow-900';
    default: return 'bg-emerald-100 border-emerald-300 text-emerald-900';
  }
};

const getPriorityBadge = (priority) => {
  const colors = {
    CRITICAL: 'bg-red-500 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-500 text-white',
    NORMAL: 'bg-emerald-500 text-white'
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-bold ${colors[priority] || colors.NORMAL}`}>
      {priority}
    </span>
  );
};

export default function QueueManagement() {
  const nav = useNavigate();
  const [query, setQuery] = useState('');
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNowModal, setShowNowModal] = useState(false);
  const tableRef = useRef(null);

  // Fetch queue from backend
  const fetchQueue = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/queue/current_queue/`, {
        credentials: 'include' // Include session cookies
      });
      
      if (!response.ok) throw new Error('Failed to fetch queue');
      
      const data = await response.json();
      
      // Transform backend data to frontend format
      const transformedQueue = data.map((entry, index) => {
        const patient = entry.patient;
        const vitals = patient.latest_vitals || {};
        
        return {
          id: entry.id,
          queueEntryId: entry.id,
          patientId: patient.patient_id,
          number: String(index + 1).padStart(3, '0'),
          name: `${patient.first_name} ${patient.last_name}`.toUpperCase(),
          sex: patient.sex || '—',
          height: vitals.height || '—',
          weight: vitals.weight || '—',
          hr: vitals.heart_rate || '—',
          bp: vitals.blood_pressure || '—',
          temp: vitals.temperature ? `${vitals.temperature} °C` : '—',
          spo2: vitals.oxygen_saturation ? `${vitals.oxygen_saturation}%` : '—',
          bmi: vitals.bmi || calcBmi(vitals.height, vitals.weight),
          priority: entry.priority || 'NORMAL',
          enteredAt: entry.entered_at,
          address: patient.address || '—',
          contact: patient.contact || '—',
          birthDate: patient.birth_date || '—'
        };
      });
      
      setQueue(transformedQueue);
    } catch (error) {
      console.error('Error fetching queue:', error);
      alert('Failed to load queue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchQueue();
    
    // Optional: Auto-refresh every 30 seconds
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  const currentPatient = useMemo(() => queue[currentIndex] || null, [queue, currentIndex]);
  const currentNumber = currentPatient?.number ?? '—';

  // Actions
  const handleNext = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowNowModal(true);
      setTimeout(() => setShowNowModal(false), 2000);
    } else {
      alert('No more patients in queue');
    }
  };

  const handleEmergency = async () => {
    // In a real scenario, you'd have a form to enter patient ID or create emergency entry
    const patientId = prompt('Enter Patient ID for emergency:');
    if (!patientId) return;
    
    try {
      // Check if patient exists
      const response = await fetch(`${API_BASE}/patients/?patient_id=${patientId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        alert('Patient not found');
        return;
      }
      
      // Refresh queue (backend will automatically prioritize based on vitals)
      await fetchQueue();
      
      // Set to first position (should be the emergency patient if they have critical vitals)
      setCurrentIndex(0);
      setShowNowModal(true);
      setTimeout(() => setShowNowModal(false), 2000);
      
    } catch (error) {
      console.error('Error adding emergency:', error);
      alert('Failed to add emergency patient');
    }
  };

  const handleRemoveFromQueue = async (queueEntryId) => {
    if (!confirm('Remove this patient from queue?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/queue/${queueEntryId}/`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        await fetchQueue();
        if (currentIndex >= queue.length - 1) {
          setCurrentIndex(Math.max(0, queue.length - 2));
        }
      }
    } catch (error) {
      console.error('Error removing from queue:', error);
      alert('Failed to remove patient from queue');
    }
  };

  const handleGoList = () => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExit = () => nav('/staff');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter(
      (r) =>
        r.number.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.patientId.toLowerCase().includes(q) ||
        (r.bp || '').toLowerCase().includes(q)
    );
  }, [queue, query]);

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="text-center text-emerald-800">Loading queue...</div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      {/* Back button */}
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 shadow mb-6"
      >
        <span className="text-sm">{backIcon}</span>
        <span className="text-sm font-medium">Back</span>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-800">
          Queue Management
        </h1>
        <button
          onClick={fetchQueue}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Current Patient Card */}
      {currentPatient && (
        <div className={`mb-6 rounded-2xl border-2 p-6 ${getPriorityColor(currentPatient.priority)}`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm font-medium mb-1">Currently Serving</div>
              <div className="text-4xl font-black tabular-nums">{currentNumber}</div>
            </div>
            {getPriorityBadge(currentPatient.priority)}
          </div>
          <div className="text-lg font-bold">{currentPatient.name}</div>
          <div className="text-sm mt-2 grid grid-cols-2 gap-2">
            <div>ID: {currentPatient.patientId}</div>
            <div>Sex: {currentPatient.sex}</div>
            <div>HR: {currentPatient.hr}{typeof currentPatient.hr === 'number' ? ' bpm' : ''}</div>
            <div>BP: {currentPatient.bp}</div>
            <div>Temp: {currentPatient.temp}</div>
            <div>SpO2: {currentPatient.spo2}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Queue Count */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="flex justify-center items-center mt-2 flex-1">
            <span className="text-6xl font-black text-emerald-900 tabular-nums">{queue.length}</span>
          </div>
          <div className="text-sm text-emerald-800/80 mt-4">Total in Queue</div>
        </div>

        {/* Next Patient */}
        <button
          onClick={handleNext}
          disabled={currentIndex >= queue.length - 1}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center"
        >
          <span className="text-4xl mb-2">{nextIcon}</span>
          <div className="text-sm text-slate-600">Next</div>
          <div className="mt-2 text-xl font-extrabold text-emerald-800">Next Patient</div>
        </button>

        {/* Emergency */}
        <button
          onClick={handleEmergency}
          className="rounded-2xl border border-red-200 bg-white p-5 text-center shadow-sm hover:bg-red-50 flex flex-col items-center justify-center"
        >
          <span className="text-4xl mb-2">{priorityIcon}</span>
          <div className="text-sm text-slate-600">Add</div>
          <div className="mt-2 text-xl font-extrabold text-red-800">Emergency</div>
        </button>

        {/* Queue List */}
        <button
          onClick={handleGoList}
          className="rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-sm hover:bg-emerald-50 flex flex-col items-center justify-center"
        >
          <span className="text-4xl mb-2">{listIcon}</span>
          <div className="text-sm text-slate-600">View</div>
          <div className="mt-2 text-xl font-extrabold text-emerald-800">Queue List</div>
        </button>
      </div>

      {/* Patient Queue table */}
      <div
        ref={tableRef}
        className="mt-6 rounded-2xl border shadow-sm overflow-hidden bg-white"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-5 pt-5">
          <div className="text-lg font-extrabold" style={{ color: '#406E65' }}>
            Patient <span className="text-emerald-700">Queue</span>
          </div>
          <div className="w-full md:w-[26rem]">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search number, name, ID, BP…"
                className="w-full rounded-full border border-emerald-200/70 bg-emerald-50/40 px-4 py-2.5 pr-10 text-emerald-900 placeholder-emerald-800/60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-800/70">
                {searchIcon}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm" style={{ color: '#406E65' }}>
            <thead style={{ background: '#DCEBE8', color: '#406E65' }}>
              <tr>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Queue #</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Patient ID</th>
                <th className="px-4 py-3">Height/Weight</th>
                <th className="px-4 py-3">BMI</th>
                <th className="px-4 py-3">Heart Rate</th>
                <th className="px-4 py-3">BP</th>
                <th className="px-4 py-3">Temp</th>
                <th className="px-4 py-3">SpO2</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-t"
                  style={{
                    background: i === currentIndex ? '#CFE6E1' : '#DCEBE8',
                    color: '#406E65',
                  }}
                >
                  <td className="px-4 py-3">{getPriorityBadge(r.priority)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-center">{r.number}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{r.patientId}</td>
                  <td className="px-4 py-3">
                    {r.height}{typeof r.height === 'number' ? ' cm' : ''} / {r.weight}{typeof r.weight === 'number' ? ' kg' : ''}
                  </td>
                  <td className="px-4 py-3">{r.bmi}</td>
                  <td className="px-4 py-3">
                    {r.hr}{typeof r.hr === 'number' ? ' bpm' : ''}
                  </td>
                  <td className="px-4 py-3">{r.bp}</td>
                  <td className="px-4 py-3">{r.temp}</td>
                  <td className="px-4 py-3">{r.spo2}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemoveFromQueue(r.queueEntryId)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center" colSpan={11} style={{ color: '#406E65' }}>
                    No patients in queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5">
          <button
            onClick={handleExit}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Now Serving Modal */}
      {showNowModal && currentPatient && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`w-full max-w-xl rounded-2xl shadow-2xl p-8 text-center ${getPriorityColor(currentPatient.priority)}`}>
            <div className="mb-4">{getPriorityBadge(currentPatient.priority)}</div>
            <h3 className="text-4xl font-extrabold tracking-wide">
              Now serving queue #{currentNumber}
            </h3>
            <div className="mt-4 text-2xl font-bold">{currentPatient.name}</div>
            <div className="mt-2 text-lg">{currentPatient.patientId}</div>
            <div className="mt-4">
              <div className="mx-auto h-1 w-40 rounded-full bg-emerald-600/70" />
            </div>
            <button
              onClick={() => setShowNowModal(false)}
              className="mt-6 rounded-xl border border-slate-300 px-5 py-2.5 hover:bg-white/50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}