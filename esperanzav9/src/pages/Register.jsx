// Register.jsx
// This page provides a registration form for new patients,
// including biometric fingerprint capture (placeholder/demo only).

import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import bgRegister from '../assets/bgreg.png'
import fingerPrint from '../assets/fingerprint-sensor.png'
import showPinIcon from '../assets/show.png'
import hidePinIcon from '../assets/hide.png'
import Popup from '../components/ErrorPopup'

const months = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export default function Register() {
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')

  // Name fields
  const [first_name, setFirstName] = useState('')
  const [middle_name, setMiddleName] = useState('')
  const [last_name, setLastName] = useState('')

  // Demographics
  const [sex, setSex] = useState('Male')
  const [phone, setPhone] = useState('')

  // Address object state
  const [address, setAddress] = useState({
    street: '',
    barangay: '',
    city: 'Manila',
    region: 'NCR',
    country: 'Philippines'
  })

  // Birthdate
  const [month, setMonth] = useState(months[0])
  const [day, setDay] = useState(1)
  const [year, setYear] = useState(new Date().getFullYear())

  // Account
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)

  // Fingerprint (DEMO)
  const [fpStatus, setFpStatus] = useState('idle') // idle | capturing | enrolled
  const [fpPreview, setFpPreview] = useState(null)
  const requireFingerprint = false // demo: allow registration without real enrollment

  const dob = useMemo(() => {
    const m = String(months.indexOf(month) + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }, [month, day, year])

  // Demo fingerprint capture
  const startFingerprintCapture = async () => {
    setFpStatus('capturing')
    setFpPreview(null)
    await new Promise(r => setTimeout(r, 1200))
    const fakeTemplate = {
      vendor: 'demo',
      version: 1,
      capturedAt: new Date().toISOString(),
      data: Math.random().toString(36).slice(2),
    }
    localStorage.setItem('fingerprintTemplate', JSON.stringify(fakeTemplate))
    setFpPreview(fingerPrint)
    setFpStatus('enrolled')
  }

  const submit = async (e) => {
    e.preventDefault()

    if (requireFingerprint && fpStatus !== 'enrolled') {
      setPopupMsg('Please capture fingerprint before registering.')
      return
    }
    if (!first_name.trim() || !last_name.trim()) {
      setPopupMsg('Please enter first and last name.')
      return
    }

    setCreating(true)

    const patientProfile = {
      first_name: first_name.trim(),
      middle_name: middle_name.trim(),
      last_name: last_name.trim(),
      sex,
      birthdate: dob,
      contact: phone.trim(),
      street: address.street.trim(),
      barangay: address.barangay.replace('Barangay ', ''), 
      // address: `${address.street}, ${address.barangay}, ${address.city}, ${address.region}, ${address.country}`,
      username: username.trim(),
      patient_pin: pin
    }

    try {
      // Register
      const registerRes = await fetch('http://localhost:8000/patients/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patientProfile),
      })

      if (!registerRes.ok) {
        const err = await registerRes.json().catch(() => ({}))
        setPopupMsg("Failed to register patient:\n" + JSON.stringify(err, null, 2))
        setCreating(false)
        return
      }

      // Auto-login
      const loginRes = await fetch('http://localhost:8000/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          pin,
          login_type: 'patient'
        }),
      })

      if (!loginRes.ok) {
        setPopupMsg("Registration successful but login failed. Please login manually.")
        setCreating(false)
        nav('/login')
        return
      }

      const loginData = await loginRes.json().catch(() => ({}))
      sessionStorage.setItem('isAuthenticated', 'true')

      if (loginData.patient_id) {
        sessionStorage.setItem('patient_id', loginData.patient_id)
      } else {
        console.warn("Login successful but no patient_id found in response payload. Check backend /login/ response.")
      }

      setCreating(false)
      nav('/vitals/weight', { state: { afterCaptureGoTo: '/records' } })
    } catch (err) {
      setPopupMsg("Network error: " + (err?.message || err))
      setCreating(false)
    }
  }

  return (
    <section
      className="relative min-h-screen flex items-center justify-center px-4 py-16 bg-cover bg-center"
      style={{ backgroundImage: `url(${bgRegister})` }}
    >
      <div className="absolute inset-0 bg-emerald-900/40 backdrop-blur-sm" />

      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-xl p-6 md:p-10">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-700 mb-8">
          Register
        </h2>

        <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
          <div className="grid gap-6">
            <div>
              {/* Name */}
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">First Name</label>
                  <input
                    value={first_name}
                    onChange={e => setFirstName(e.target.value.replace(/[^A-Za-z ]/g, '').slice(0, 50))}
                    required
                    disabled={creating}
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Middle Name</label>
                  <input
                    value={middle_name}
                    onChange={e => setMiddleName(e.target.value.replace(/[^A-Za-z ]/g, '').slice(0, 50))}
                    placeholder="(optional)"
                    disabled={creating}
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Last Name</label>
                  <input
                    value={last_name}
                    onChange={e => setLastName(e.target.value.replace(/[^A-Za-z ]/g, '').slice(0, 50))}                
                    required
                    disabled={creating}
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Sex / Birthdate */}
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Sex</label>
                  <select
                    value={sex}
                    onChange={e=>setSex(e.target.value)}
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  >
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Birthdate</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <select
                      value={month}
                      onChange={e=>setMonth(e.target.value)}
                      disabled={creating}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      {months.map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select
                      value={day}
                      onChange={e=>setDay(Number(e.target.value))}
                      disabled={creating}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d}>{d}</option>)}
                    </select>
                    <select
                      value={year}
                      onChange={e=>setYear(Number(e.target.value))}
                      disabled={creating}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(y => (
                        <option key={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact / Address */}
              <div className="grid md:grid-cols-[1fr,2fr] gap-2 items-start md:items-center mb-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Phone Number</label>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    required
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700 block mb-2">Address</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <input
                        type="text"
                        placeholder="Street / Building / House No."
                        value={address.street}
                        onChange={e => setAddress({ ...address, street: e.target.value })}
                        disabled={creating}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                        required
                      />
                    </div>
                    <div>
                      <select
                        value={address.barangay}
                        onChange={e => setAddress({ ...address, barangay: e.target.value })}
                        disabled={creating}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                        required
                      >
                        <option value="">Select Brgy.</option>
                        <option value="1">Brgy. 587</option>
                        <option value="1-A">Brgy. 587-A</option>
                        {Array.from({ length: 61 }, (_, i) => 588 + i).map(brgy => (
                          <option key={brgy} value={brgy - 586}>
                            Brgy. {brgy}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-4 col-span-2">
                      <input type="text" value="Manila" readOnly className="rounded-xl border border-slate-300 px-4 py-2.5 bg-gray-100 cursor-not-allowed" />
                      <input type="text" value="NCR" readOnly className="rounded-xl border border-slate-300 px-4 py-2.5 bg-gray-100 cursor-not-allowed" />
                      <input type="text" value="Philippines" readOnly className="rounded-xl border border-slate-300 px-4 py-2.5 bg-gray-100 cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Username / PIN */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Username</label>
                  <input
                    value={username}
                    onChange={e=>setUsername(e.target.value)}
                    required
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">4-Digit PIN</label>
                  <div className="relative mt-2">
                    <input
                      value={pin}
                      onChange={e=>setPin(e.target.value.replace(/\D/g, '').slice(0,4))}
                      required
                      maxLength={4}
                      inputMode="numeric"
                      pattern="\d{4}"
                      type={showPin ? 'text' : 'password'}
                      disabled={creating}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-12 disabled:opacity-50"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(s => !s)}
                      className="absolute inset-y-0 right-2 my-auto h-9 w-9 grid place-items-center rounded-md hover:bg-slate-100"
                    >
                      <img
                        src={showPin ? hidePinIcon : showPinIcon}
                        alt="toggle pin"
                        className="h-5 w-5 object-contain select-none pointer-events-none"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <button
                  onClick={submit}
                  disabled={creating}
                  className="mt-6 bg-[#6ec1af] hover:bg-emerald-600 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl shadow-md transition-colors"
                >
                  {creating ? 'Creating Account...' : 'Register'}
                </button>
              </div>
            </div>
          </div>

          {/* Biometric Card (Demo Only) */}
          <aside className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="text-lg font-extrabold text-emerald-800">Biometric Enrollment</h3>
            <p className="mt-1 text-sm text-emerald-900/80">
              Capture the patient’s fingerprint. Placeholder only — will wire up the sensor later.
            </p>
            <div className="mt-5 grid place-items-center">
              <div className="h-32 w-32 rounded-full bg-white border-2 border-emerald-300 grid place-items-center overflow-hidden">
                {fpStatus === 'capturing' && <div className="h-8 w-8 animate-ping rounded-full bg-emerald-400" />}
                {fpStatus === 'idle' && <div className="text-emerald-700/80 text-sm">No scan</div>}
                {fpStatus === 'enrolled' && fpPreview && (
                  <img src={fpPreview} alt="Fingerprint preview" className="h-full w-full object-contain" />
                )}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm">
                Status:{' '}
                <span className={`font-semibold ${
                  fpStatus === 'enrolled' ? 'text-emerald-700' :
                  fpStatus === 'capturing' ? 'text-emerald-600' : 'text-slate-600'
                }`}>
                  {fpStatus === 'idle' && 'Not enrolled'}
                  {fpStatus === 'capturing' && 'Capturing…'}
                  {fpStatus === 'enrolled' && 'Enrolled'}
                </span>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {fpStatus !== 'capturing' && (
                <button
                  type="button"
                  onClick={startFingerprintCapture}
                  className="rounded-xl bg-[#6ec1af] hover:bg-emerald-800/70 text-white font-semibold px-4 py-2"
                >
                  {fpStatus === 'enrolled' ? 'Re-capture' : 'Start Capture'}
                </button>
              )}
              {fpStatus === 'capturing' && (
                <button type="button" disabled className="rounded-xl bg-[#6ec1af] text-white font-semibold px-4 py-2">
                  Capturing…
                </button>
              )}
              {fpStatus === 'enrolled' && (
                <div className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-emerald-800 text-sm">
                  Fingerprint saved
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {popupMsg && <Popup msg={popupMsg} onClose={() => setPopupMsg('')} />}
    </section>
  )
}
