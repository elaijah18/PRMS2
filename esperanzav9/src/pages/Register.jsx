// Register.jsx - Continuous fingerprint enrollment with auto-retry
import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Keyboard from '../components/Keyboard'
import NumPad from '../components/NumPad'
import bgRegister from '../assets/bgreg.png'
import fingerPrint from '../assets/fingerprint-sensor.png'
import showPinIcon from '../assets/show.png'
import hidePinIcon from '../assets/hide.png'
import Popup from '../components/ErrorPopup'
import RetryButton from '../components/RetryButton' 

const months = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export default function Register() {
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  const [errors, setErrors] = useState({})

  const [first_name, setFirstName] = useState('')
  const [middle_name, setMiddleName] = useState('')
  const [last_name, setLastName] = useState('')

  const [sex, setSex] = useState('')
  const [phone, setPhone] = useState('')

  const [address, setAddress] = useState({
    street: '',
    barangay: '',
    city: 'Manila',
    region: 'NCR',
    country: 'Philippines'
  })

  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')

  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)

  const [fpStatus, setFpStatus] = useState('idle')
  const [fpMessage, setFpMessage] = useState('')
  const [fpProgress, setFpProgress] = useState(0)
  const [enrollmentTimer, setEnrollmentTimer] = useState(null)
  const [enrollmentFingerprintId, setEnrollmentFingerprintId] = useState(null)
  const [registeredPatientId, setRegisteredPatientId] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [pressedKeys, setPressedKeys] = useState(new Set())
  const [showUsernameKeyboard, setShowUsernameKeyboard] = useState(false)
  const [showPinNumPad, setShowPinNumPad] = useState(false)
  const [showPhoneNumPad, setShowPhoneNumPad] = useState(false)
  const [invalidCharErrors, setInvalidCharErrors] = useState({})
  const [usesKeyboard, setUsesKeyboard] = useState(false)
  const [focusedField, setFocusedField] = useState(null)

  const setFieldInvalidChar = (field, isInvalid, message = 'Invalid character') => {
    setInvalidCharErrors(prev => {
      if (!isInvalid && !prev[field]) return prev
      return {
        ...prev,
        [field]: isInvalid ? message : ''
      }
    })
  }

  const dob = useMemo(() => {
    if (!month || !day || !year) return ''
    const mIndex = months.indexOf(month)
    if (mIndex < 0) return ''
    const m = String(mIndex + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }, [month, day, year])

  useEffect(() => {
    return () => {
      if (enrollmentTimer) {
        clearInterval(enrollmentTimer)
      }
    }
  }, [enrollmentTimer])

  useEffect(() => {
    if (fpStatus === 'enrolled' && registeredPatientId) {
      setTimeout(() => {
        setCreating(false)
        nav('/vitals/weight', { state: { afterCaptureGoTo: '/records' } })
      }, 1500)
    }
  }, [fpStatus, registeredPatientId, nav])

  const startAutomaticEnrollment = async (patientId, currentRetry = 0) => {
    setRetryCount(currentRetry)

    if (currentRetry >= 3) {
      setFpStatus('error')
      setFpMessage('Sensor connection lost or timed out.')
      setFpProgress(0)
      return
    }

    setFpStatus('enrolling')
    setFpMessage(currentRetry > 0 ? `Retrying enrollment... (Attempt ${currentRetry})` : 'Starting fingerprint enrollment...')
    setFpProgress(10)
    
    try {
      const response = await fetch('http://localhost:8000/fingerprint/enroll/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patient_id: patientId })
      })
      
      if (!response.ok) {
        setTimeout(() => startAutomaticEnrollment(patientId, currentRetry + 1), 1500)
        return
      }
      
      const data = await response.json()
      setEnrollmentFingerprintId(data.fingerprint_id)
      setFpMessage('Place your finger on the sensor')
      
      const timer = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `http://localhost:8000/fingerprint/status/?fingerprint_id=${data.fingerprint_id}&patient_id=${patientId}`,
            { credentials: 'include' }
          )
          
          const statusData = await statusRes.json()
          
          // --- 2-PHASE UI LOGIC RESTORED ---
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
            setTimeout(() => startAutomaticEnrollment(patientId, currentRetry + 1), 1500)
          }
          
          // Ignore empty polling messages so instructions don't disappear
          if (
            statusData.message && 
            statusData.status !== 'error' && 
            statusData.message !== 'No update from sensor' &&
            statusData.message !== 'Waiting for fingerprint sensor...'
          ) {
            setFpMessage(statusData.message)
          }
        } catch (err) {
          console.error('Error checking enrollment status:', err)
        }
      }, 1000)
      
      setEnrollmentTimer(timer)
      
    } catch (err) {
      setTimeout(() => startAutomaticEnrollment(patientId, currentRetry + 1), 1500)
    }
  }

  const cancelEnrollment = () => {
    if (enrollmentTimer) {
      clearInterval(enrollmentTimer)
      setEnrollmentTimer(null)
    }

    // Use the dedicated enrollment stop endpoint
    fetch('http://localhost:8000/fingerprint/enroll/stop/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }).catch(console.error)

    setFpStatus('cancelled')
    setFpMessage('Enrollment cancelled')
    setCreating(false)
    setPopupMsg('Fingerprint enrollment cancelled. You can try again from your profile.')
    setTimeout(() => {
      nav('/vitals/weight', { state: { afterCaptureGoTo: '/records' } })
    }, 2000)
  }

  const capitalizeWords = (str) => {
    return str
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const onKeyboardPress = (key) => {
    const keyForPressState = /^[a-z]$/.test(key) ? key.toUpperCase() : key
    setPressedKeys(new Set([keyForPressState]))
    setTimeout(() => setPressedKeys(new Set()), 120)

    const isNameField = ['first_name', 'middle_name', 'last_name'].includes(focusedField)
    if (/^[0-9]$/.test(key) && isNameField) {
      setFieldInvalidChar(focusedField, true, 'Only letters allowed')
      setTimeout(() => {
        setFieldInvalidChar(focusedField, false)
      }, 2000)
      return
    }

    if (/^[A-Za-z]$/.test(key) || (/^[0-9]$/.test(key) && !isNameField)) {
      if (focusedField === 'first_name') {
        setFirstName(v => v + key)
      } else if (focusedField === 'middle_name') {
        setMiddleName(v => v + key)
      } else if (focusedField === 'last_name') {
        setLastName(v => v + key)
      } else if (focusedField === 'street') {
        setAddress(a => ({ ...a, street: a.street + key }))
      } else if (focusedField === 'username') {
        setUsername(u => u + key)
      }
      if (focusedField) {
        setFieldInvalidChar(focusedField, false)
      }
      return
    }

    if (key === 'BACKSPACE') {
      if (focusedField === 'first_name') {
        setFirstName(v => v.slice(0, -1))
      } else if (focusedField === 'middle_name') {
        setMiddleName(v => v.slice(0, -1))
      } else if (focusedField === 'last_name') {
        setLastName(v => v.slice(0, -1))
      } else if (focusedField === 'street') {
        setAddress(a => ({ ...a, street: a.street.slice(0, -1) }))
      } else if (focusedField === 'username') {
        setUsername(u => u.slice(0, -1))
      }
      if (focusedField) {
        setFieldInvalidChar(focusedField, false)
      }
      return
    }

    if (key === 'SPACE') {
      if (focusedField === 'first_name') {
        setFirstName(v => v + ' ')
      } else if (focusedField === 'middle_name') {
        setMiddleName(v => v + ' ')
      } else if (focusedField === 'last_name') {
        setLastName(v => v + ' ')
      } else if (focusedField === 'street') {
        setAddress(a => ({ ...a, street: a.street + ' ' }))
      } else if (focusedField === 'username') {
        setUsername(u => u + ' ')
      }
      if (focusedField) {
        setFieldInvalidChar(focusedField, false)
      }
      return
    }

    if (key === 'KEYBOARD') {
      setShowUsernameKeyboard(false)
      setFocusedField(null)
      return
    }

    if (key && key.length === 1) {
      if (focusedField) {
        const activeField = focusedField
        setFieldInvalidChar(activeField, true, `Invalid character: "${key}"`)
        setTimeout(() => {
          setFieldInvalidChar(activeField, false)
        }, 2000)
      }
      return
    }
  }

  const onNumPadPress = (key) => {
    if (/^[0-9]$/.test(key)) {
      if (pin.length < 4) {
        setPin(p => p + key)
        setFieldInvalidChar('pin', false)
      }
    } else if (key === 'BACKSPACE') {
      setPin(p => p.slice(0, -1))
      setFieldInvalidChar('pin', false)
    }
  }

  const onPhoneNumPadPress = (key) => {
    if (/^[0-9]$/.test(key)) {
      if (phone.length < 11) {
        setPhone(ph => ph + key)
        setFieldInvalidChar('phone', false)
      }
    } else if (key === 'BACKSPACE') {
      setPhone(ph => ph.slice(0, -1))
      setFieldInvalidChar('phone', false)
    }
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
      first_name: capitalizeWords(trimmedFirst),
      middle_name: capitalizeWords(trimmedMiddle),
      last_name: capitalizeWords(trimmedLast),
      sex,
      birthdate: dob,
      contact: cleanedPhone,
      street: trimmedStreet,
      barangay: trimmedBarangay,
      username: trimmedUsername,
      pin: cleanedPin
    }

    try {
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
        
        setPopupMsg('Account created! Now enrolling fingerprint...')
        await startAutomaticEnrollment(loginData.patient_id, 0)
        
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
      className={`relative min-h-screen px-4 py-16 ${showUsernameKeyboard ? 'min-h-screen' : 'min-h-screen flex items-center justify-center'}`}
      style={{ backgroundImage: `url(${bgRegister})` }}
    >
      <div className="absolute inset-0 bg-emerald-900/40 backdrop-blur-sm" />
      <div className={`relative w-full max-w-5xl bg-white rounded-3xl shadow-xl p-6 md:p-10 mx-auto ${(showUsernameKeyboard || showPinNumPad || showPhoneNumPad) ? 'mb-[20rem]' : ''}`}>
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
                    onChange={e => {
                      const next = e.target.value
                      setFieldInvalidChar('first_name', /[^A-Za-z ]/.test(next))
                      setFirstName(next.replace(/[^A-Za-z ]/g, '').slice(0, 50))
                    }}
                    onFocus={() => {
                      setShowUsernameKeyboard(true)
                      setShowPinNumPad(false)
                      setShowPhoneNumPad(false)
                      setFocusedField('first_name')
                    }}
                    required
                    disabled={creating}
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                  {invalidCharErrors.first_name && (
                    <p className="mt-1 text-xs text-red-600">{invalidCharErrors.first_name}</p>
                  )}
                  {errors.first_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Middle Name</label>
                  <input
                    value={middle_name}
                    onChange={e => {
                      const next = e.target.value
                      setFieldInvalidChar('middle_name', /[^A-Za-z ]/.test(next))
                      setMiddleName(next.replace(/[^A-Za-z ]/g, '').slice(0, 50))
                    }}
                    onFocus={() => {
                      setShowUsernameKeyboard(true)
                      setShowPinNumPad(false)
                      setShowPhoneNumPad(false)
                      setFocusedField('middle_name')
                    }}
                    onBlur={() => setFocusedField(null)}
                    placeholder="(optional)"
                    disabled={creating}
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                  {invalidCharErrors.middle_name && (
                    <p className="mt-1 text-xs text-red-600">{invalidCharErrors.middle_name}</p>
                  )}
                  {errors.middle_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.middle_name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Last Name</label>
                  <input
                    value={last_name}
                    onChange={e => {
                      const next = e.target.value
                      setFieldInvalidChar('last_name', /[^A-Za-z ]/.test(next))
                      setLastName(next.replace(/[^A-Za-z ]/g, '').slice(0, 50))
                    }}
                    onFocus={() => {
                      setShowUsernameKeyboard(true)
                      setShowPinNumPad(false)
                      setShowPhoneNumPad(false)
                      setFocusedField('last_name')
                    }}
                    required
                    disabled={creating}
                    maxLength={50}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                  {invalidCharErrors.last_name && (
                    <p className="mt-1 text-xs text-red-600">{invalidCharErrors.last_name}</p>
                  )}
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
                    onFocus={() => setShowUsernameKeyboard(false)}
                    disabled={creating}
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
                      onFocus={() => setShowUsernameKeyboard(false)}
                      disabled={creating}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      <option value="" disabled>Month</option>
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select
                      value={day}
                      onChange={e=>setDay(e.target.value)}
                      onFocus={() => setShowUsernameKeyboard(false)}
                      disabled={creating}
                      className="rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                    >
                      <option value="" disabled>Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={year}
                      onChange={e=>setYear(e.target.value)}
                      onFocus={() => setShowUsernameKeyboard(false)}
                      disabled={creating}
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
                    onChange={e => {
                      const next = e.target.value
                      setFieldInvalidChar('phone', /[^0-9]/.test(next))
                      setPhone(next.replace(/\D/g, '').slice(0, 11))
                    }}
                    onFocus={() => {
                      setShowPhoneNumPad(true)
                      setShowUsernameKeyboard(false)
                      setShowPinNumPad(false)
                      setFocusedField('phone')
                    }}
                    required
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:opacity-50"
                  />
                  {invalidCharErrors.phone && (
                    <p className="mt-1 text-xs text-red-600">{invalidCharErrors.phone}</p>
                  )}
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
                        onChange={e => {
                          const next = e.target.value
                          setFieldInvalidChar('street', /[^A-Za-z0-9 ]/.test(next))
                          setAddress({ ...address, street: next.replace(/[^A-Za-z0-9 ]/g, '') })
                        }}
                        onFocus={() => {
                          setShowUsernameKeyboard(true)
                          setShowPinNumPad(false)
                          setShowPhoneNumPad(false)
                          setFocusedField('street')
                        }}
                        disabled={creating}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                        required
                      />
                      {invalidCharErrors.street && (
                        <p className="mt-1 text-xs text-red-600">{invalidCharErrors.street}</p>
                      )}
                      {errors.street && (
                        <p className="mt-1 text-xs text-red-600">{errors.street}</p>
                      )}
                    </div>
                    <div>
                      <select
                        value={address.barangay}
                        onChange={e => setAddress({ ...address, barangay: e.target.value })}
                        onFocus={() => setShowUsernameKeyboard(false)}
                        disabled={creating}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                        required
                      >
                        <option value="">Select Brgy.</option>
                        <option value="1">Brgy. 587</option>
                        <option value="1-A">Brgy. 587-A</option>
                        {Array.from({ length: 62 }, (_, i) => 588 + i).map(brgy => (
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
                    onChange={e => {
                      const next = e.target.value
                      setFieldInvalidChar('username', /[^A-Za-z0-9 ]/.test(next))
                      setUsername(next.replace(/[^A-Za-z0-9 ]/g, ''))
                    }}
                    onFocus={() => {
                      setShowUsernameKeyboard(true)
                      setShowPinNumPad(false)
                      setShowPhoneNumPad(false)
                      setFocusedField('username')
                    }}
                    required
                    disabled={creating}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 disabled:opacity-50"
                  />
                  {invalidCharErrors.username && (
                    <p className="mt-1 text-xs text-red-600">{invalidCharErrors.username}</p>
                  )}
                  {errors.username && (
                    <p className="mt-1 text-xs text-red-600">{errors.username}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">4-Digit PIN</label>
                  <div className="relative mt-2">
                    <input
                      value={pin}
                      onChange={e => {
                        const next = e.target.value
                        setFieldInvalidChar('pin', /[^0-9]/.test(next))
                        setPin(next.replace(/\D/g, '').slice(0,4))
                      }}
                      onFocus={() => {
                        setShowPinNumPad(true)
                        setShowUsernameKeyboard(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('pin')
                      }}
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
                  {invalidCharErrors.pin && (
                    <p className="mt-1 text-xs text-red-600">{invalidCharErrors.pin}</p>
                  )}
                  {errors.pin && (
                    <p className="mt-1 text-xs text-red-600">{errors.pin}</p>
                  )}
                </div>
              </div>

              {showUsernameKeyboard && (
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-2 backdrop-blur">
                  <div className="mx-auto max-w-5xl">
                    <div className="h-[27rem] w-full overflow-hidden">
                      <Keyboard pressedKeys={pressedKeys} onKeyPress={onKeyboardPress} mode={focusedField === 'pin' ? 'pin' : 'letters'} />
                    </div>
                  </div>
                </div>
              )}

              {showPinNumPad && (
                <div className="fixed inset-x-0 bottom-0 justify-items-center z-20 border-t border-slate-200 bg-white/90 p-2 backdrop-blur">
                  <div className="mx-auto max-w-5xl">
                    <div className="h-[24rem] w-full overflow-hidden">
                      <NumPad onKeyPress={onNumPadPress} />
                    </div>
                  </div>
                </div>
              )}

              {showPhoneNumPad && (
                <div className="fixed inset-x-0 bottom-0 z-20 justify-items-center border-t border-slate-200 bg-white/90 p-2 backdrop-blur">
                  <div className="mx-auto max-w-5xl">
                    <div className="h-[24rem] w-full overflow-hidden">
                      <NumPad onKeyPress={onPhoneNumPadPress} />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => nav('/patient-login')}
                  className="mt-6 px-8 py-3 rounded-xl border-2 border-gray-300 text-[#426F66] font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={creating}
                  className="mt-6 bg-[#6ec1af] hover:bg-emerald-800/70 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl shadow-md transition-colors"
                >
                  {creating ? (fpStatus === 'enrolling' ? 'Enrolling...' : 'Creating Account...') : 'Register'}
                </button>
              </div>
            </div>
          </div>

          {/* Biometric Status Card */}
          <aside className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 flex flex-col">
            <h3 className="text-lg font-extrabold text-emerald-800">Biometric Enrollment</h3>
            <p className="mt-1 text-lg text-emerald-900/80">
              Fingerprint enrollment required
            </p>
          
            <div className="mt-5 grid place-items-center">
              <div className={`h-32 w-32 rounded-full border-2 grid place-items-center overflow-hidden relative ${fpStatus === 'error' ? 'border-red-400 bg-red-50' : 'border-emerald-300 bg-white'}`}>
                {fpStatus === 'idle' && (
                  <div className="text-emerald-700/80 text-sm text-center px-2">Ready</div>
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
                  <div className="text-red-500 font-bold text-5xl">!</div>
                )}
              </div>
            </div>
          
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
                  fpStatus === 'cancelled' ? 'text-orange-600' :
                  'text-slate-600'
                }`}>
                  {fpStatus === 'idle' && 'Not enrolled'}
                  {fpStatus === 'enrolling' && 'Capturing…'}
                  {fpStatus === 'enrolled' && 'Enrolled'}
                  {fpStatus === 'error' && 'Error'}
                  {fpStatus === 'cancelled' && 'Cancelled'}
                </span>
              </p>
              {fpMessage && (
                <p className={`text-xs mt-2 font-medium ${fpStatus === 'error' ? 'text-red-600' : 'text-emerald-800'}`}>
                  {fpMessage}
                </p>
              )}
            </div>
          
            <div className="mt-auto pt-5">
              {fpStatus === 'enrolling' && (
                <div>
                  <div className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-blue-800 text-sm mb-3">
                    Follow the sensor prompts carefully
                    {retryCount > 0 && (
                      <div className="mt-2 text-xs font-semibold text-blue-600">
                        Retry attempt: {retryCount} / 3
                      </div>
                    )}
                  </div>
                  <button
                    onClick={cancelEnrollment}
                    className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Cancel Enrollment
                  </button>
                </div>
              )}

              {fpStatus === 'error' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <RetryButton onClick={() => startAutomaticEnrollment(registeredPatientId, 0)} />
                    <button
                      onClick={cancelEnrollment}
                      className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-sm py-2 rounded-lg transition-colors"
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              )}
            
              {fpStatus === 'enrolled' && (
                <div className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-emerald-800 text-sm flex items-center justify-center gap-2 font-medium">
                  <span>✓</span>
                  <span>Fingerprint saved</span>
                </div>
              )}

              {fpStatus === 'cancelled' && (
                <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-800 text-sm text-center font-medium">
                  Enrollment skipped
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
