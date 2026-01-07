// hehe hindi ko mapakailaman yung input BP since di nagffetch it should be fetch sa BP.jsx

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import backIcon from '../assets/arrow.png'
import accIcon from '../assets/account.png'
import historyIcon from '../assets/history.png'
import Popup from '../components/ErrorPopup'

const BRAND = {
  bg: '#DCEBE8',
  text: '#406E65',
  border: '#BEE1DB',
  button: '#6ec1af',
}

export default function PatientRecords() {
  const nav = useNavigate()
  const { patientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [patients, setPatients] = useState([])
  const [currentPatient, setCurrentPatient] = useState(null)
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [latestVitals, setLatestVitals] = useState(null)
  const [history, setHistory] = useState([])
  const [bpInput, setBpInput] = useState('')
  const [popupMsg, setPopupMsg] = useState('')
  const [errors, setErrors] = useState({})


  const constructName = (patient) => {
    if (patient.name) return patient.name
    const parts = [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean)
    return parts.join(' ') || '—'
  }

  const saveProfile = async () => {
  if (!currentPatient) return false
  
  try {
    const first_name = (currentPatient.first_name || '').trim()
    const middle_name = (currentPatient.middle_name || '').trim()
    const last_name = (currentPatient.last_name || '').trim()
    const cleanedPhone = (currentPatient.contact || '').replace(/\D/g, '').slice(0, 11)
    const trimmedAddress = (currentPatient.address || '').trim()
    const birthdate = (currentPatient.birthdate || '').trim()
    const sex = (currentPatient.sex || '').trim()

    const newErrors = {}
    if (!first_name) newErrors.first_name = 'First name is required.'
    else if (first_name.length > 50) newErrors.first_name = 'First name must be 1-50 characters.'

    if (middle_name.length > 50) newErrors.middle_name = 'Middle name must be 0-50 characters.'

    if (!last_name) newErrors.last_name = 'Last name is required.'
    else if (last_name.length > 50) newErrors.last_name = 'Last name must be 1-50 characters.'

    if (!cleanedPhone) newErrors.phone = 'Phone number is required.'
    else if (cleanedPhone.length !== 11) newErrors.phone = 'Phone number must be 11 digits.'

    if (!trimmedAddress) newErrors.address = 'Address is required.'
    if (!sex) newErrors.sex = 'Please select sex.'
    if (!birthdate) newErrors.birthdate = 'Please select birthdate.'

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      setPopupMsg('Please make sure everything is filled out correctly before saving.')
      return false
    }

    setErrors({})

    const payload = {
      first_name: first_name || 'Unknown',
      last_name: last_name || 'Unknown', 
      sex: sex || 'Male',
      address: trimmedAddress,
      contact: cleanedPhone,
      pin: currentPatient.pin,
    }
    
    if (middle_name) {
      payload.middle_name = middle_name
    }
    if (birthdate) {
      payload.birthdate = birthdate
    }

    const res = await fetch(`http://localhost:8000/patients/${currentPatient.patient_id}/`, {
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorData = await res.json()
      let errorMsg = 'Failed to update patient'
      if (errorData.detail) {
        errorMsg = errorData.detail
      } else if (typeof errorData === 'object') {
        const errors = Object.entries(errorData).map(([field, msgs]) => 
          `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`
        ).join('\n')
        errorMsg = errors || errorMsg
      }
      
      throw new Error(errorMsg)
    }

    setPopupMsg('Patient record updated successfully')
    setEditing(false)
    
    const currentSearch = searchParams.get('q') || ''
    fetchPatients(currentSearch)
    return true
  } catch (err) {
    console.error('Failed to save:', err)
    setPopupMsg(`Failed to save record: ${err.message}`)
    return false
  }
}

  const fetchPatients = async (searchTerm = '') => {
    setLoading(true)
    try {
      const url = searchTerm
        ? `http://localhost:8000/all-patients/?search=${encodeURIComponent(searchTerm)}`
        : `http://localhost:8000/all-patients/`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch patients')
      const data = await res.json()

      setPatients(data)

      if (!searchTerm) {
        setTotalCount(Array.isArray(data) ? data.length : 0)
      }
    } catch (err) {
      console.error('Failed to fetch patients:', err)
      setPopupMsg('Failed to fetch patients')
    } finally {
      setLoading(false)
    }
  }

  const fetchVitals = async (patientUrlId) => {
    if (!patientUrlId) {
      setLatestVitals(null)
      setHistory([])
      return
    }

    try {
      const res = await fetch(`http://localhost:8000/patient/vitals/${patientUrlId}/`, { 
        credentials: 'include',
      })

      if (!res.ok) {
        console.error('Failed to fetch vitals:', res.status)
        setLatestVitals(null)
        setHistory([])
        return
      }

      const data = await res.json()
      setLatestVitals(data.latest || null)
      setHistory(data.history || [])
      
    } catch (err) {
      console.error('Failed to fetch vitals:', err)
      setLatestVitals(null)
      setHistory([])
    }
  }
  
  useEffect(() => {
    if (currentPatient?.patient_id) {
      fetchVitals(currentPatient.patient_id)
    } else {
      setLatestVitals(null)
      setHistory([])
    }
  }, [currentPatient?.patient_id])


  useEffect(() => {
    if (patients.length > 0 && !editing) {
      if (patientId) {
        const patientToEdit = patients.find(p => p.patient_id === patientId)
        if (patientToEdit) {
          startEditing(patientToEdit)
        } else {
          const firstPatient = patients[0]
          setCurrentPatient(firstPatient)
          if (firstPatient) {
            fetchVitals(firstPatient.patient_id) 
          }
        }
      } else {
        const firstPatient = patients[0]
        setCurrentPatient(firstPatient)
        if (firstPatient) {
          fetchVitals(firstPatient.patient_id) 
        }
      }
    } else if (patients.length === 0) {
      setCurrentPatient(null)
      setLatestVitals(null)
      setHistory([])
    }
  }, [patients, patientId, editing])

  useEffect(() => {
    setBpInput((latestVitals?.blood_pressure ?? '').toString())
  }, [editing, latestVitals])

    // Add missing state
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [patientToArchive, setPatientToArchive] = useState(null)

  // Add missing components
  const Title = ({ children }) => (
    <h1 className="text-3xl font-bold text-center" style={{ color: BRAND.text }}>{children}</h1>
  )
  const GradientHeader = ({ icon, children }) => (
    <div className="mt-6 flex items-center gap-3">
      <img src={icon} alt="" className="h-6 w-6" />
      <h2 className="text-xl font-bold" style={{ color: BRAND.text }}>{children}</h2>
    </div>
  )
  const SectionHeader = ({ children }) => (
    <h3 className="text-lg font-semibold" style={{ color: BRAND.text }}>{children}</h3>
  )

  useEffect(() => {
  const searchTerm = searchParams.get('q') || ''
  fetchPatients(searchTerm)
}, [searchParams])

  const handleSearch = () => {
    if (query.trim()) {
      setSearchParams({ q: query.trim() })
    } else {
      setSearchParams({})
    }
  }

  const handleClear = () => {
    setQuery('')
    setSearchParams({})
  }

  const saveBp = async () => {
    if (!currentPatient) {
      setPopupMsg('No patient selected')
      return
    }
    
    if (!bpInput.trim()) {
      setPopupMsg('Please enter blood pressure')
      return
    }
    
    const bpPattern = /^\d{2,3}\/\d{2}$/
    if (!bpPattern.test(bpInput.trim())) {
      setPopupMsg('Blood pressure must be in format xxx/xx (e.g. 120/80)')
      return
    }
    
    try {
      const res = await fetch(`http://localhost:8000/receive-vitals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: currentPatient.patient_id,
          blood_pressure: bpInput.trim(),
          date: new Date().toISOString().split('T')[0],
        }),
      })
      
      if (!res.ok) throw new Error('Failed to save blood pressure')
      
      setPopupMsg('Blood pressure saved successfully')
      fetchVitals(currentPatient.patient_id) 
    } catch (err) {
      console.error('Failed to save BP:', err)
      setPopupMsg('Failed to save blood pressure')
    }
  }

  const handleFinish = async () => {
    const success = await saveProfile()
    
    if (!success) {
      return
    }
    
    setEditing(false)
    setCurrentPatient(null)
    const currentSearch = searchParams.get('q')
    if (currentSearch) {
      nav(`/staff/patient-records?q=${encodeURIComponent(currentSearch)}`, { replace: true })
    } else {
      nav('/staff/patient-records', { replace: true })
    }
  }

  const startEditing = (patient) => {
    const patientToEdit = {
      ...patient,
       address: patient.address ||
      `${patient.barangay ?? ''} ${patient.street ?? ''}`.trim(),
      first_name: patient.first_name || '',
      middle_name: patient.middle_name || '',
      last_name: patient.last_name || '',
      sex: patient.sex || 'Male',
      birthdate: patient.birthdate || patient.dob || '',
    }
    
    setCurrentPatient(patientToEdit)
    setEditing(true)
    
    setLatestVitals(patient.latest_vitals || null)
    
    fetchVitals(patient.patient_id)
    
    const currentSearch = searchParams.get('q')
    if (currentSearch) {
      nav(`/staff/patient-records/${patient.patient_id}?q=${encodeURIComponent(currentSearch)}`, { replace: true })
    } else {
      nav(`/staff/patient-records/${patient.patient_id}`, { replace: true })
    }
  }

  const [totalCount, setTotalCount] = useState(0)

  const handleArchiveClick = (patientId) => {
    setPatientToArchive(patientId)
    setShowArchiveModal(true)
  }

  const cancelArchive = () => {
    setShowArchiveModal(false)
    setPatientToArchive(null)
  }

  const confirmArchive = async () => {
    if (!patientToArchive) return
    
    try {
      const res = await fetch(`http://localhost:8000/archive-patient/${patientToArchive}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: 'Archived from patient records'
        })
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to archive patient')
      }
      
      setPopupMsg('Patient archived successfully')
      
      setShowArchiveModal(false)
      setPatientToArchive(null)
      
      const currentSearch = searchParams.get('q') || ''
      fetchPatients(currentSearch)
      
      if (currentPatient?.patient_id === patientToArchive) {
        setCurrentPatient(null)
        setEditing(false)
        nav('/staff/patient-records', { replace: true })
      }
      
    } catch (err) {
      console.error('Failed to archive patient:', err)
      setPopupMsg(`Failed to archive patient: ${err.message}`)
    }
  }

  const startEditing = (patient) => {
    const patientToEdit = {
      ...patient,
      first_name: patient.first_name || '',
      middle_name: patient.middle_name || '',
      last_name: patient.last_name || '',
      sex: patient.sex || 'Male',
      birthdate: patient.birthdate || patient.dob || '',
      street: patient.street || '',
      barangay: patient.barangay || '',
    }
    
    setCurrentPatient(patientToEdit)
    setEditing(true)
    
    setLatestVitals(patient.latest_vitals || null)
    
    fetchVitals(patient.patient_id)
    
    const currentSearch = searchParams.get('q')
    if (currentSearch) {
      nav(`/staff/patient-records/${patient.patient_id}?q=${encodeURIComponent(currentSearch)}`, { replace: true })
    } else {
      nav(`/staff/patient-records/${patient.patient_id}`, { replace: true })
    }
  }
  
  const [totalCount, setTotalCount] = useState(0)

  return (
    <section className="relative mx-auto max-w-5xl px-2 py-16">
      <div className="absolute top-4 left-4">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[#406E65] hover:bg-slate-50 shadow"
        >
          <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      <Title>Patient Records</Title>

      <div className="mt-6 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by Name or Patient ID…"
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
        />
        <button
          onClick={handleClear}
          className="rounded-xl border border-slate-300 px-4 py-2.5 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {!loading && patients.length === 0 && (
          <div className="rounded-2xl border bg-white p-6 text-slate-600">No matches.</div>
        )}

        {patients.map((p) => (
          <div key={p.patient_id} className="rounded-2xl border bg-white p-6">
            {!editing || currentPatient?.patient_id !== p.patient_id ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-extrabold" style={{ color: BRAND.text }}>
                      {constructName(p)}
                    </h3>
                    <p className="text-sm" style={{ color: BRAND.text }}>
                      Patient ID: <span className="font-semibold">{p.patient_id || '—'}</span> • 
                      Contact: <span className="font-semibold">{p.contact || '—'}</span> • 
                      Address: <span className="font-semibold">{p.address || '—'}</span>
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => startEditing(p)}
                      className="rounded-xl px-4 py-2 font-semibold text-white"
                      style={{ background: BRAND.text }}
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleArchiveClick(p.patient_id)} 
                      className="rounded-xl px-4 py-2 font-semibold text-white transition-colors"
                      style={{ backgroundColor: '#cb4c4e' }}
                    >
                      Archive
                    </button>
                  </div>
                </div>
                
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border p-5" style={{ background: BRAND.bg, color: BRAND.text, borderColor: BRAND.border }}>
                    <div className="text-sm opacity-90">Pulse Rate</div>
                    <div className="mt-2 text-3xl font-extrabold tabular-nums">
                      {p.latest_vitals?.pulse_rate ?? '—'}
                    </div>
                    <div className="mt-1 text-xs opacity-80">BPM</div>
                  </div>
                  <div className="rounded-2xl border p-5" style={{ background: BRAND.bg, color: BRAND.text, borderColor: BRAND.border }}>
                    <div className="text-sm opacity-90">Temperature</div>
                    <div className="mt-2 text-3xl font-extrabold tabular-nums">
                      {p.latest_vitals?.temperature ?? '—'}
                    </div>
                    <div className="mt-1 text-xs opacity-80">°C</div>
                  </div>
                  <div className="rounded-2xl border p-5" style={{ background: BRAND.bg, color: BRAND.text, borderColor: BRAND.border }}>
                    <div className="text-sm opacity-90">SpO₂</div>
                    <div className="mt-2 text-3xl font-extrabold tabular-nums">
                      {p.latest_vitals?.oxygen_saturation ?? '—'}
                    </div>
                    <div className="mt-1 text-xs opacity-80">%</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <GradientHeader icon={accIcon}>Personal Information</GradientHeader>

                <div
                  className="mt-3 rounded-2xl overflow-hidden border relative"
                  style={{ borderColor: BRAND.border }}
                >
                  <table className="min-w-full text-sm" style={{ background: BRAND.bg, color: BRAND.text }}>
                    <tbody>
                      <tr className="border-b" style={{ borderColor: BRAND.border }}>
                        <th className="px-4 py-3 text-left w-52">First Name</th>
                        <td className="px-4 py-3">
                          <input
                            value={currentPatient.first_name || ''}
                            onChange={(e) =>
                              setCurrentPatient({ ...currentPatient, first_name: e.target.value })
                            }
                            className="w-full rounded-lg border px-3 py-2 bg-white"
                            style={{ borderColor: BRAND.border }}
                            autoCapitalize="words"
                            required
                          />
                          {errors.first_name && <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>}
                        </td>
                        <th className="px-4 py-3 text-left w-40">Middle Name</th>
                        <td className="px-4 py-3">
                          <input
                            value={currentPatient.middle_name || ''}
                            onChange={(e) =>
                              setCurrentPatient({ ...currentPatient, middle_name: e.target.value })
                            }
                            maxLength={50}
                            placeholder="Optional"
                            className="w-full rounded-lg border px-3 py-2 bg-white"
                            style={{ borderColor: BRAND.border }}
                            autoCapitalize="words"
                          />
                          {errors.middle_name && <p className="mt-1 text-xs text-red-600">{errors.middle_name}</p>}
                        </td>
                      </tr>

                      <tr className="border-b" style={{ borderColor: BRAND.border }}>
                        <th className="px-4 py-3 text-left">Last Name</th>
                        <td className="px-4 py-3">
                          <input
                            value={currentPatient.last_name || ''}
                            onChange={(e) =>
                              setCurrentPatient({ ...currentPatient, last_name: e.target.value })
                            }
                            className="w-full rounded-lg border px-3 py-2 bg-white"
                            style={{ borderColor: BRAND.border }}
                            autoCapitalize="words"
                            required
                          />
                          {errors.last_name && <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>}
                        </td>
                        <th className="px-4 py-3 text-left w-40">Sex</th>
                        <td className="px-4 py-3">
                          <select
                            value={currentPatient.sex || 'Male'}
                            onChange={(e) =>
                              setCurrentPatient({ ...currentPatient, sex: e.target.value })
                            }
                            className="w-full rounded-lg border px-3 py-2 bg-white"
                            style={{ borderColor: BRAND.border }}
                          >
                            <option>Male</option>
                            <option>Female</option>
                          </select>
                          {errors.sex && <p className="mt-1 text-xs text-red-600">{errors.sex}</p>}
                        </td>
                      </tr>

                      <tr className="border-b" style={{ borderColor: BRAND.border }}>
                        <th className="px-4 py-3 text-left">Address</th>
                        <td className="px-4 py-3">
                          <input
                              value={currentPatient.address || ''}
                              onChange={(e) =>
                                setCurrentPatient({
                                  ...currentPatient,
                                  address: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border px-3 py-2 bg-white"
                              style={{ borderColor: BRAND.border }}
                            />
                          {errors.street && <p className="mt-1 text-xs text-red-600">{errors.street}</p>}
                        </td>
                        <th className="px-4 py-3 text-left">Birthdate</th>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={currentPatient.birthdate || ''}
                            onChange={(e) =>
                              setCurrentPatient({ ...currentPatient, birthdate: e.target.value })
                            }
                            className="w-full rounded-lg border px-3 py-2 bg-white"
                            style={{ borderColor: BRAND.border, color: BRAND.text }}
                          />
                          {errors.birthdate && <p className="mt-1 text-xs text-red-600">{errors.birthdate}</p>}
                        </td>
                      </tr>

                      <tr>
                        <th className="px-4 py-3 text-left">Contact Number</th>
                        <td className="px-4 py-3">
                          <input
                            value={currentPatient.contact || ''}
                            onChange={(e) =>
                              setCurrentPatient({ ...currentPatient, contact: e.target.value })
                            }
                            className="w-full rounded-lg border px-3 py-2 bg-white"
                            style={{ borderColor: BRAND.border }}
                          />
                          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                        </td>
                        <th className="px-4 py-3 text-left">Patient ID</th>
                        <td className="px-4 py-3">
                          <input
                            value={currentPatient.patient_id || ''}
                            disabled
                            className="w-full rounded-lg border px-3 py-2 bg-slate-100"
                            style={{ borderColor: BRAND.border }}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border p-5" style={{ background: BRAND.bg, color: BRAND.text, borderColor: BRAND.border }}>
                    <div className="text-sm opacity-90">Pulse Rate</div>
                    <div className="mt-2 text-3xl font-extrabold tabular-nums">
                      {latestVitals?.pulse_rate ?? '—'}
                    </div>
                    <div className="mt-1 text-xs opacity-80">BPM</div>
                  </div>
                  <div className="rounded-2xl border p-5" style={{ background: BRAND.bg, color: BRAND.text, borderColor: BRAND.border }}>
                    <div className="text-sm opacity-90">Temperature</div>
                    <div className="mt-2 text-3xl font-extrabold tabular-nums">
                      {latestVitals?.temperature ?? '—'}
                    </div>
                    <div className="mt-1 text-xs opacity-80">°C</div>
                  </div>
                  <div className="rounded-2xl border p-5" style={{ background: BRAND.bg, color: BRAND.text, borderColor: BRAND.border }}>
                    <div className="text-sm opacity-90">SpO₂</div>
                    <div className="mt-2 text-3xl font-extrabold tabular-nums">
                      {latestVitals?.oxygen_saturation ?? '—'}
                    </div>
                    <div className="mt-1 text-xs opacity-80">%</div>
                  </div>
                </div>

                <div className="mt-6">
                  <SectionHeader>Blood Pressure</SectionHeader>
                  <div className="mt-3 rounded-2xl border p-4 flex items-center gap-3"
                       style={{ borderColor: BRAND.border, background: BRAND.bg, color: BRAND.text }}>
                    <label className="min-w-[10rem] font-semibold">BP (mmHg)</label>
                    <input
                      value={bpInput}
                      onChange={(e) => {
                        let value = e.target.value;

                        // Remove all characters except digits and slash
                        value = value.replace(/[^\d/]/g, "");

                        // Prevent more than ONE slash
                        const parts = value.split("/");
                        if (parts.length > 2) return;

                        // Limit systolic (before slash) to 3 digits
                        if (parts[0].length > 3) parts[0] = parts[0].slice(0, 3);

                        // Limit diastolic (after slash) to 2 digits
                        if (parts[1]?.length > 2) parts[1] = parts[1].slice(0, 2);

                        // Combine back
                        value = parts.join("/");

                        setBpInput(value);
                      }}
                      placeholder="e.g. 120/80"
                      className="rounded-lg border px-3 py-2 bg-white flex-1"
                      style={{ borderColor: BRAND.border }}
                    />
                    
                    <button
                      type="button"
                      onClick={saveBp}
                      className="rounded-lg px-4 py-2 text-white font-semibold"
                      style={{ background: BRAND.text }}
                    >
                      Save BP
                    </button>
                  </div>
                </div>

                <GradientHeader icon={historyIcon}>Vital Signs History</GradientHeader>
                <div
                  className="mt-3 rounded-2xl overflow-hidden border relative"
                  style={{ borderColor: BRAND.border }}
                >
                  <table className="min-w-full text-sm" style={{ background: BRAND.bg, color: BRAND.text }}>
                    <thead style={{ background: '#cfe5e1' }}>
                      <tr>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Height</th>
                        <th className="px-4 py-3 text-left">Weight</th>
                        <th className="px-4 py-3 text-left">Pulse Rate</th>
                        <th className="px-4 py-3 text-left">Oxygen Saturation</th>
                        <th className="px-4 py-3 text-left">Temperature</th>
                        <th className="px-4 py-3 text-left">BMI</th>
                        <th className="px-4 py-3 text-left">Blood Pressure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history.length ? history : []).map((r, i) => (
                        <tr key={r.id || i} className="border-t" style={{ borderColor: BRAND.border }}>
                          <td className="px-4 py-3">{r.date}</td>
                          <td className="px-4 py-3">{r.height ?? '—'}</td>
                          <td className="px-4 py-3">{r.weight ?? '—'}</td>
                          <td className="px-4 py-3">{r.pulse_rate ? `${r.pulse_rate} bpm` : '—'}</td>
                          <td className="px-4 py-3">{r.oxygen_saturation ?? '—'}</td>
                          <td className="px-4 py-3">{r.temperature ?? '—'}</td>
                          <td className="px-4 py-3">{r.bmi ?? '—'}</td>
                          <td className="px-4 py-3">{r.blood_pressure ?? '—'}</td>
                        </tr>
                      ))}
                      {!history.length && (
                        <tr>
                          <td className="px-4 py-6 text-center" colSpan={8}>
                            No history yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleFinish}
                    className="rounded-xl px-6 py-3 font-semibold text-white"
                    style={{ background: BRAND.text }}
                  >
                    Finish
                  </button>
                </div>
              </>
            )}
          </div>
          
        ))}
      </div>

      {/* Results counter */}
      {!loading && patients.length > 0 && (
        <div className="mt-4 text-sm text-slate-600 text-center">
          Showing <span className="font-semibold">{patients.length}</span>
          {totalCount > 0 && (
            <> out of <span className="font-semibold">{totalCount}</span></>
          )}
          {' '}patient{totalCount === 1 ? '' : 's'}.
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center">
          <h3 className="text-lg font-bold text-slate-800">
            Archive this patient record?
          </h3>
          <p className="text-sm text-slate-600 mt-2">
            The record will be moved to the archive and can be restored later.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={cancelArchive}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={confirmArchive}
              className="px-4 py-2 rounded-xl text-white font-semibold"
              style={{ backgroundColor: '#cb4c4e' }}
            >
              Yes, Archive
            </button>
          </div>
        </div>
      </div>
      )}

      {popupMsg && <Popup message={popupMsg} onClose={() => setPopupMsg('')} />}
    </section>
  )
}