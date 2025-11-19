// Register.jsx - Aligned with Arduino fingerprint enrollment
import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

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

  // Fingerprint enrollment state
  const [fpStatus, setFpStatus] = useState('idle')
  const [fpMessage, setFpMessage] = useState('')
  const [fpProgress, setFpProgress] = useState(0)
  const [enrollmentTimer, setEnrollmentTimer] = useState(null)
  const [enrollmentFingerprintId, setEnrollmentFingerprintId] = useState(null)
  const [registeredPatientId, setRegisteredPatientId] = useState(null)

  const dob = useMemo(() => {
    const m = String(months.indexOf(month) + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }, [month, day, year])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (enrollmentTimer) {
        clearInterval(enrollmentTimer)
      }
    }
  }, [enrollmentTimer])

  // Auto-redirect when enrollment completes
  useEffect(() => {
    if (fpStatus === 'enrolled' && registeredPatientId) {
      setTimeout(() => {
        setCreating(false)
        nav('/vitals/weight', { state: { afterCaptureGoTo: '/records' } })
      }, 1500)
    }
  }, [fpStatus, registeredPatientId, nav])

  // Start fingerprint enrollment
  const startAutomaticEnrollment = async (patientId) => {
    setFpStatus('enrolling')
    setFpMessage('Starting fingerprint enrollment...')
    setFpProgress(10)
   
    try {
      const response = await fetch('http://localhost:8000/fingerprint/enroll/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patient_id: patientId })
      })
     
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start enrollment')
      }
     
      const data = await response.json()
      setEnrollmentFingerprintId(data.fingerprint_id)
      setFpMessage('Place your finger on the sensor')
     
      // Poll for enrollment status
      const timer = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `http://localhost:8000/fingerprint/status/?fingerprint_id=${data.fingerprint_id}&patient_id=${patientId}`,
            { credentials: 'include' }
          )
         
          const statusData = await statusRes.json()
         
          // Update based on Arduino status
          if (statusData.status === 'place_finger') {
            if (statusData.step === 1) {
              setFpMessage('Place your finger on the sensor')
              setFpProgress(20)
            } else if (statusData.step === 2) {
              setFpMessage('Place same finger again')
              setFpProgress(60)
            }
          } else if (statusData.status === 'remove_finger') {
            setFpMessage('Remove finger...')
            setFpProgress(40)
          } else if (statusData.status === 'enrolled') {
            clearInterval(timer)
            setEnrollmentTimer(null)
            setFpStatus('enrolled')
            setFpProgress(100)
            setFpMessage('Fingerprint enrolled successfully!')
            setPopupMsg('Registration complete! Redirecting...')
          } else if (statusData.status === 'error') {
            clearInterval(timer)
            setEnrollmentTimer(null)
            setFpStatus('error')
            setFpMessage(statusData.message || 'Enrollment failed')
            setPopupMsg('Enrollment failed: ' + (statusData.message || 'Please try again'))
            setCreating(false)
          }
          
          // Update message if provided
          if (statusData.message && statusData.status !== 'error') {
            setFpMessage(statusData.message)
          }
        } catch (err) {
          console.error('Error checking enrollment status:', err)
        }
      }, 1000)
     
      setEnrollmentTimer(timer)
     
    } catch (err) {
      setPopupMsg(err.message || 'Failed to start fingerprint enrollment')
      setFpStatus('error')
      setFpMessage('Enrollment failed')
      setCreating(false)
    }
  }

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
      // 1. Register patient
      const registerRes = await fetch('http://localhost:8000/patients/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patientProfile),
      })

      if (!registerRes.ok) {
        const err = await registerRes.json().catch(() => ({}))
        const message = err.username?.[0] || err.username || err.error || err.detail || err.message || "Failed to register patient"
        setPopupMsg(message.charAt(0).toUpperCase() + message.slice(1))
        setCreating(false)
        return
      }

      // 2. Auto-login
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
        setRegisteredPatientId(loginData.patient_id)
       
        // 3. Start fingerprint enrollment
        setPopupMsg('Account created! Now enrolling fingerprint...')
        await startAutomaticEnrollment(loginData.patient_id)
       
      } else {
        console.warn("Login successful but no patient_id found in response payload.")
        setCreating(false)
      }

    } catch (err) {
      setPopupMsg("Network error. Please try again.")
      setCreating(false)
    }
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 py-16 bg-gradient-to-br from-emerald-50 to-teal-100">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-xl p-6 md:p-10">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-700 mb-8">
          Register
        </h2>

        <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
          <div className="grid gap-6">
            {/* Form content - replace form with div */}
            <div>
              {/* Name */}
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">First Name</label>
                  <input
                    value={first_name}
                    onChange={e => setFirstName(e.target.value.replace(/[^A-Za-z ]/g, ''))}
                    required
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Middle Name</label>
                  <input
                    value={middle_name}
                    onChange={e => setMiddleName(e.target.value.replace(/[^A-Za-z ]/g, ''))}
                    placeholder="(optional)"
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Last Name</label>
                  <input
                    value={last_name}
                    onChange={e => setLastName(e.target.value.replace(/[^A-Za-z ]/g, ''))}                
                    required
                    disabled={creating}
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
                        {Array.from({ length: 62 }, (_, i) => 587 + i).map(brgy => (
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
                      disabled={creating}
                      className="absolute inset-y-0 right-2 my-auto h-9 w-9 grid place-items-center rounded-md hover:bg-slate-100 disabled:opacity-50"
                    >
                      {showPin ? '🙈' : '👁️'}
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
                  {creating ? (fpStatus === 'enrolling' ? 'Enrolling Fingerprint...' : 'Creating Account...') : 'Register'}
                </button>
              </div>
            </div>
          </div>

          {/* Biometric Status Card */}
          <aside className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="text-lg font-extrabold text-emerald-800">Biometric Enrollment</h3>
            <p className="mt-1 text-sm text-emerald-900/80">
              Fingerprint enrollment required
            </p>
           
            <div className="mt-5 grid place-items-center">
              <div className="h-32 w-32 rounded-full bg-white border-2 border-emerald-300 grid place-items-center overflow-hidden relative">
                {fpStatus === 'idle' && (
                  <div className="text-emerald-700/80 text-sm text-center px-2">
                    Ready
                  </div>
                )}
                
                {fpStatus === 'enrolling' && (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div className="h-16 w-16 animate-pulse rounded-full bg-emerald-400" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="h-12 w-12 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                        <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                        <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
                        <path d="M2 12a10 10 0 0 1 18-6" />
                        <path d="M2 16h.01" />
                        <path d="M21.8 16c.2-2 .131-5.354 0-6" />
                        <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
                        <path d="M8.65 22c.21-.66.45-1.32.57-2" />
                        <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
                      </svg>
                    </div>
                  </div>
                )}
                
                {fpStatus === 'enrolled' && (
                  <div className="text-emerald-600 text-4xl">✓</div>
                )}
                
                {fpStatus === 'error' && (
                  <div className="text-red-600 text-4xl">✗</div>
                )}
              </div>
            </div>
           
            {/* Progress Bar */}
            {fpStatus === 'enrolling' && (
              <div className="mt-4 w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300" 
                  style={{ width: fpProgress + '%' }} 
                />
              </div>
            )}
           
            <div className="mt-4">
              <p className="text-sm">
                Status:{' '}
                <span className={`font-semibold ${
                  fpStatus === 'enrolled' ? 'text-emerald-700' :
                  fpStatus === 'enrolling' ? 'text-blue-600' :
                  fpStatus === 'error' ? 'text-red-600' :
                  'text-slate-600'
                }`}>
                  {fpStatus === 'idle' && 'Waiting...'}
                  {fpStatus === 'enrolling' && 'Enrolling...'}
                  {fpStatus === 'enrolled' && 'Enrolled ✓'}
                  {fpStatus === 'error' && 'Failed'}
                </span>
              </p>
              {fpMessage && (
                <p className="text-xs text-emerald-800 mt-2">{fpMessage}</p>
              )}
            </div>
           
            <div className="mt-5">
              {fpStatus === 'enrolling' && (
                <div className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-blue-800 text-sm">
                  Follow the sensor prompts carefully
                </div>
              )}
             
              {fpStatus === 'enrolled' && (
                <div className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-emerald-800 text-sm flex items-center gap-2">
                  <span>✓</span>
                  <span>Enrollment successful</span>
                </div>
              )}

              {fpStatus === 'error' && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-red-800 text-sm">
                  {fpMessage}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      
      {/* Popup */}
      {popupMsg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
            <p className="text-slate-800 mb-4">{popupMsg}</p>
            <button
              onClick={() => setPopupMsg('')}
              className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  )
}