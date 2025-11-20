// Register.jsx (OPTION 2 Implementation)
// Keep existing UI but replace demo fingerprint system with real AS608 enrollment
import React, { useMemo, useState, useEffect } from 'react'
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

  // Address
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

  // Fingerprint
  const [fpStatus, setFpStatus] = useState('idle') 
  const [fpMessage, setFpMessage] = useState('')
  const [fingerprintId, setFingerprintId] = useState(null)
  const [pollTimer, setPollTimer] = useState(null)
  const [patientId, setPatientId] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  const dob = useMemo(() => {
    const m = String(months.indexOf(month) + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }, [month, day, year])

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [pollTimer])

  // Auto redirect on success
  useEffect(() => {
    if (fpStatus === 'enrolled') {
      setPopupMsg("Fingerprint enrolled successfully! Redirecting...")
      setTimeout(() => {
        nav('/vitals/weight', { state: { afterCaptureGoTo: '/records' } })
      }, 1500);
    }
  }, [fpStatus])

  // --------------------------------------------
  // REAL FINGERPRINT ENROLLMENT (Option 2)
  // --------------------------------------------
  const startFingerprintCapture = async () => {
    if (!patientId) {
      setPopupMsg("Please complete registration first.")
      return
    }

    setFpStatus("capturing")
    setFpMessage("Starting enrollment...")
    setRetryCount(0)

    try {
      const res = await fetch("http://localhost:8000/fingerprint/enroll/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patient_id: patientId })
      })

      if (!res.ok) {
        setPopupMsg("Sensor error. Retrying...")
        return setTimeout(() => startFingerprintCapture(), 1500)
      }

      const data = await res.json()
      setFingerprintId(data.fingerprint_id)
      setFpMessage("Place your finger on the sensor")

      // begin polling
      const timer = setInterval(() => pollFingerprintStatus(data.fingerprint_id), 1000)
      setPollTimer(timer)

    } catch (err) {
      setPopupMsg("Network error. Retrying...")
      setTimeout(() => startFingerprintCapture(), 1500)
    }
  }

  const pollFingerprintStatus = async (fpId) => {
    try {
      const res = await fetch(
        `http://localhost:8000/fingerprint/status/?fingerprint_id=${fpId}&patient_id=${patientId}`,
        { credentials: "include" }
      )

      const data = await res.json()

      if (data.status === "place_finger") {
        setFpStatus("capturing")
        setFpMessage(data.message || "Place your finger")

      } else if (data.status === "remove_finger") {
        setFpMessage(data.message || "Remove finger...")

      } else if (data.status === "enrolled") {
        clearInterval(pollTimer)
        setPollTimer(null)
        setFpStatus("enrolled")
        setFpMessage("Fingerprint enrollment complete!")

      } else if (data.status === "error") {
        clearInterval(pollTimer)
        setPollTimer(null)

        const nextRetry = retryCount + 1
        setRetryCount(nextRetry)
        setFpMessage(`Retrying... (Attempt ${nextRetry + 1})`)

        setTimeout(() => startFingerprintCapture(), 1500)
      }

    } catch (err) {
      console.log("Polling error but continuing...")
    }
  }

  // --------------------------------------------
  // SUBMIT FORM → REGISTER → LOGIN → ENABLE FP
  // --------------------------------------------
  const submit = async (e) => {
    e.preventDefault()

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
      barangay: address.barangay.trim(),
      username: username.trim(),
      pin
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
        const message = err.username?.[0] || err.username || err.error || err.detail || err.message || "Failed to register patient"
        setPopupMsg(message)
        setCreating(false)
        return
      }

      // Login
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
        return nav('/login')
      }

      const loginData = await loginRes.json().catch(() => ({}))

      if (!loginData.patient_id) {
        setPopupMsg("No patient ID returned.")
        setCreating(false)
        return
      }

      // Save for fingerprint
      sessionStorage.setItem('isAuthenticated', 'true')
      sessionStorage.setItem('patient_id', loginData.patient_id)
      setPatientId(loginData.patient_id)

      setPopupMsg("Account created! You may now capture fingerprint.")

      setCreating(false)

    } catch (err) {
      setPopupMsg("Network error. Please try again.")
      setCreating(false)
    }
  }

  // --------------------------------------------
  // RENDER
  // --------------------------------------------
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
          {/* FORM */}
          <form onSubmit={submit} className="grid gap-6">

            {/* NAME */}
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-semibold text-slate-700">First Name</label>
                <input
                  value={first_name}
                  onChange={e => setFirstName(e.target.value.replace(/[^A-Za-z ]/g, ''))}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Middle Name</label>
                <input
                  value={middle_name}
                  onChange={e => setMiddleName(e.target.value.replace(/[^A-Za-z ]/g, ''))}
                  placeholder="(optional)"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Last Name</label>
                <input
                  value={last_name}
                  onChange={e => setLastName(e.target.value.replace(/[^A-Za-z ]/g, ''))}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
                />
              </div>
            </div>

            {/* SEX / DOB */}
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-semibold text-slate-700">Sex</label>
                <select
                  value={sex}
                  onChange={e => setSex(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
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
                    onChange={e => setMonth(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                  >
                    {months.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <select
                    value={day}
                    onChange={e => setDay(Number(e.target.value))}
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d}>{d}</option>)}
                  </select>
                  <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                  >
                    {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(y => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* CONTACT / ADDRESS */}
            <div className="grid md:grid-cols-[1fr,2fr] gap-2 items-start md:items-center">
              {/* Phone */}
              <div>
                <label className="text-sm font-semibold text-slate-700">Phone Number</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                />
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 block mb-2">Address</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Street */}
                  <div>
                    <input
                      type="text"
                      placeholder="Street / Building / House No."
                      value={address.street}
                      onChange={e => setAddress({ ...address, street: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                      required
                    />
                  </div>

                  {/* Barangay */}
                  <div>
                    <select
                      value={address.barangay}
                      onChange={e => setAddress({ ...address, barangay: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                      required
                    >
                      <option value="">Select Brgy.</option>

                      <option value="3">Brgy. 587A</option>

                      {Array.from({ length: 648 - 587 + 1 }, (_, i) => 587 + i).map(brgy => (
                        <option key={brgy} value={brgy - 586}>
                          Brgy. {brgy}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-4 col-span-2">
                    <input
                      type="text"
                      value="Manila"
                      readOnly
                      className="rounded-xl border border-slate-300 px-4 py-2.5 bg-gray-100 cursor-not-allowed"
                    />

                    <input
                      type="text"
                      value="NCR"
                      readOnly
                      className="rounded-xl border border-slate-300 px-4 py-2.5 bg-gray-100 cursor-not-allowed"
                    />

                    <input
                      type="text"
                      value="Philippines"
                      readOnly
                      className="rounded-xl border border-slate-300 px-4 py-2.5 bg-gray-100 cursor-not-allowed"
                    />
                  </div>

                </div>
              </div>
            </div>

            {/* USERNAME / PIN */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-semibold text-slate-700">Username</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">4-Digit PIN</label>
                <div className="relative mt-2">
                  <input
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0,4))}
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{4}"
                    type={showPin ? 'text' : 'password'}
                    required
                    className="mt-0 w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(s => !s)}
                    className="absolute inset-y-0 right-2 my-auto h-9 w-9 grid place-items-center rounded-md hover:bg-slate-100"
                  >
                    <img
                      src={showPin ? hidePinIcon : showPinIcon}
                      alt="toggle pin"
                      className="h-5 w-5 object-contain select-none"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="text-right">
              <button
                type="submit"
                disabled={creating}
                className="mt-6 bg-[#6ec1af] hover:bg-emerald-800/70 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl shadow-md"
              >
                {creating ? 'Creating Account...' : 'Register'}
              </button>
            </div>

          </form>

          {/* BIOMETRIC */}
          <aside className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="text-lg font-extrabold text-emerald-800">Biometric Enrollment</h3>
            <p className="mt-1 text-sm text-emerald-900/80">
              Capture the patient’s fingerprint.
            </p>

            <div className="mt-5 grid place-items-center">
              <div className="h-32 w-32 rounded-full bg-white border-2 border-emerald-300 grid place-items-center overflow-hidden">
                {fpStatus === 'capturing' && (
                  <div className="h-8 w-8 animate-ping rounded-full bg-emerald-400" />
                )}

                {fpStatus === 'idle' && (
                  <div className="text-emerald-700/80 text-sm">No scan</div>
                )}

                {fpStatus === 'enrolled' && (
                  <img src={fingerPrint} className="h-full w-full object-contain" alt="" />
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-emerald-900">{fpMessage}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {fpStatus !== 'capturing' && (
                <button
                  type="button"
                  onClick={startFingerprintCapture}
                  disabled={!patientId}
                  className="rounded-xl bg-[#6ec1af] hover:bg-emerald-800/70 text-white font-semibold px-4 py-2 disabled:opacity-50"
                >
                  {fpStatus === 'enrolled' ? 'Re-capture' : 'Start Capture'}
                </button>
              )}

              {fpStatus === 'capturing' && (
                <button disabled className="rounded-xl bg-[#6ec1af] text-white font-semibold px-4 py-2">
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

      {popupMsg && <Popup message={popupMsg} onClose={() => setPopupMsg('')} />}
    </section>
  )
}
