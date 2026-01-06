// Register.jsx - Continuous fingerprint enrollment with auto-retry
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
  const [errors, setErrors] = useState({})

  // Name fields
  const [first_name, setFirstName] = useState('')
  const [middle_name, setMiddleName] = useState('')
  const [last_name, setLastName] = useState('')

  // Demographics
  const [sex, setSex] = useState('')
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
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')

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
  const [retryCount, setRetryCount] = useState(0)

  const dob = useMemo(() => {
    if (!month || !day || !year) return ''
    const mIndex = months.indexOf(month)
    if (mIndex < 0) return ''
    const m = String(mIndex + 1).padStart(2, '0')
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

  // Start fingerprint enrollment with silent auto-retry
  const startAutomaticEnrollment = async (patientId, currentRetry = 0) => {
    setRetryCount(currentRetry)
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
        // Silent retry on network error
        const nextRetry = currentRetry + 1
        setFpMessage(`Retrying enrollment... (Attempt ${nextRetry + 1})`)
        setFpProgress(5)
        
        setTimeout(() => {
          startAutomaticEnrollment(patientId, nextRetry)
        }, 1500)
        return
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
            // Clear timer and silently retry
            clearInterval(timer)
            setEnrollmentTimer(null)
            
            const nextRetry = currentRetry + 1
            setFpMessage(`Retrying enrollment... (Attempt ${nextRetry + 1})`)
            setFpProgress(10)
            
            // Wait 1.5 seconds before retrying
            setTimeout(() => {
              startAutomaticEnrollment(patientId, nextRetry)
            }, 1500)
          }
          
          // Update message if provided
          if (statusData.message && statusData.status !== 'error') {
            setFpMessage(statusData.message)
          }
        } catch (err) {
          console.error('Error checking enrollment status:', err)
          // Continue polling even on error
        }
      }, 1000)
     
      setEnrollmentTimer(timer)
     
    } catch (err) {
      // Retry on network/server errors silently
      const nextRetry = currentRetry + 1
      setFpMessage(`Retrying enrollment... (Attempt ${nextRetry + 1})`)
      setFpProgress(5)
      
      setTimeout(() => {
        startAutomaticEnrollment(patientId, nextRetry)
      }, 1500)
    }
  }

  // Cancel enrollment and go back
  const cancelEnrollment = () => {
    if (enrollmentTimer) {
      clearInterval(enrollmentTimer)
      setEnrollmentTimer(null)
    }
    setFpStatus('cancelled')
    setFpMessage('Enrollment cancelled')
    setCreating(false)
    setPopupMsg('Fingerprint enrollment cancelled. You can try again from your profile.')
    setTimeout(() => {
      nav('/vitals/weight', { state: { afterCaptureGoTo: '/records' } })
    }, 2000)
  }

  const submit = async (e) => {
    e.preventDefault()

    const trimmedFirst = first_name.trim()
    const trimmedMiddle = middle_name.trim()
    const trimmedLast = last_name.trim()
    const cleanedPhone = phone.replace(/\D/g, '').slice(0, 11)
    const trimmedStreet = address.street.trim()
    const trimmedBarangay = address.barangay.trim()
    const trimmedUsername = username.trim()
    const cleanedPin = pin.replace(/\D/g, '').slice(0, 4)

    const newErrors = {}
    if (!trimmedFirst) {
      newErrors.first_name = 'First name is required.'
    } else if (trimmedFirst.length > 50) {
      newErrors.first_name = 'First name must be 1-50 characters.'
    }

    if (trimmedMiddle.length > 50) {
      newErrors.middle_name = 'Middle name must be 0-50 characters.'
    }

    if (!trimmedLast) {
      newErrors.last_name = 'Last name is required.'
    } else if (trimmedLast.length > 50) {
      newErrors.last_name = 'Last name must be 1-50 characters.'
    }
    if (!cleanedPhone) {
      newErrors.phone = 'Phone number is required.'
    } else if (cleanedPhone.length !== 11) {
      newErrors.phone = 'Phone number must be 11 digits.'
    }
    if (!trimmedStreet) {
      newErrors.street = 'Street address is required.'
    }
    if (!trimmedBarangay) {
      newErrors.barangay = 'Please select a barangay.'
    }
    if (!sex) {
      newErrors.sex = 'Please select sex.'
    }
    if (!month || !day || !year) {
      newErrors.birthdate = 'Please select birth month, day, and year.'
    }
    if (!trimmedUsername) {
      newErrors.username = 'Username is required.'
    }
    if (!cleanedPin || cleanedPin.length !== 4) {
      newErrors.pin = 'PIN must be 4 digits.'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})

    setCreating(true)

    const patientProfile = {
      first_name: trimmedFirst,
      middle_name: trimmedMiddle,
      last_name: trimmedLast,
      sex,
      birthdate: dob,
      contact: cleanedPhone,
      street: trimmedStreet,
      barangay: trimmedBarangay,
      username: trimmedUsername,
      pin: cleanedPin
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
          username: trimmedUsername,
          pin: cleanedPin,
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
                    placeholder="First Name"
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>
                  )}
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
                  {errors.middle_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.middle_name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Last Name</label>
                  <input
                    value={last_name}
                    onChange={e => setLastName(e.target.value.replace(/[^A-Za-z ]/g, '').slice(0, 50))}                
                    required
                    disabled={creating}
                    placeholder="Last Name"
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>
                  )}
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
                    required
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  >
                    <option value="" disabled>Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                  {errors.sex && (
                    <p className="mt-1 text-xs text-red-600">{errors.sex}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Birthdate</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <select
                      value={month}
                      onChange={e=>setMonth(e.target.value)}
                      disabled={creating}
                      required
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      <option value="" disabled>Month</option>
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select
                      value={day}
                      onChange={e=>setDay(e.target.value)}
                      disabled={creating}
                      required
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      <option value="" disabled>Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={year}
                      onChange={e=>setYear(e.target.value)}
                      disabled={creating}
                      required
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      <option value="" disabled>Year</option>
                      {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  {errors.birthdate && (
                    <p className="mt-1 text-xs text-red-600">{errors.birthdate}</p>
                  )}
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
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
                  )}
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
                      {errors.street && (
                        <p className="mt-1 text-xs text-red-600">{errors.street}</p>
                      )}
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
                      {errors.barangay && (
                        <p className="mt-1 text-xs text-red-600">{errors.barangay}</p>
                      )}
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
                  {errors.username && (
                    <p className="mt-1 text-xs text-red-600">{errors.username}</p>
                  )}
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
                  {errors.pin && (
                    <p className="mt-1 text-xs text-red-600">{errors.pin}</p>
                  )}
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
                  fpStatus === 'cancelled' ? 'text-orange-600' :
                  'text-slate-600'
                }`}>
                  {fpStatus === 'idle' && 'Not enrolled'}
                  {fpStatus === 'enrolling' && 'Capturing…'}
                  {fpStatus === 'enrolled' && 'Enrolled'}
                  {fpStatus === 'cancelled' && 'Cancelled'}
                </span>
              </p>
              {fpMessage && (
                <p className="text-xs text-emerald-800 mt-2">{fpMessage}</p>
              )}
            </div>
          
            <div className="mt-5">
              {fpStatus === 'enrolling' && (
                <div>
                  <div className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-blue-800 text-sm mb-3">
                    Follow the sensor prompts carefully
                    {retryCount > 0 && (
                      <div className="mt-2 text-xs text-blue-600">
                        Retry attempt: {retryCount + 1}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={cancelEnrollment}
                    className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 rounded-lg transition-colors"
                  >
                    Cancel Enrollment
                  </button>
                </div>
              )}
            
              {fpStatus === 'enrolled' && (
                <div className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-emerald-800 text-sm flex items-center gap-2">
                  <span>✓</span>
                  <span>Fingerprint saved</span>
                </div>
              )}

              {fpStatus === 'cancelled' && (
                <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-800 text-sm">
                  Enrollment cancelled
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}