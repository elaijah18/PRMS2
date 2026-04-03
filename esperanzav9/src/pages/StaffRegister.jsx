// StaffRegister.jsx - Staff Fingerprint Enrollment (Side Panel)
// This component handles STAFF registration with fingerprint enrollment
// NOT for patients - for HCStaff/employees only

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Keyboard from '../components/Keyboard'
import NumPad from '../components/NumPad'
import bgRegister from '../assets/bgreg.png'
import showPinIcon from '../assets/show.png'
import hidePinIcon from '../assets/hide.png'
import Popup from '../components/ErrorPopup'

export default function StaffRegister() {
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  const [errors, setErrors] = useState({})

  // Staff personal info fields
  const [first_name, setFirstName] = useState('')
  const [middle_name, setMiddleName] = useState('')
  const [last_name, setLastName] = useState('')

  // Staff contact info
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Staff work info
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')

  // Staff account credentials
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)

  // STAFF Fingerprint enrollment state - for employee biometric setup
  const [fpStatus, setFpStatus] = useState('idle') // 'idle', 'enrolling', 'enrolled', 'error'
  const [fpMessage, setFpMessage] = useState('')
  const [fpProgress, setFpProgress] = useState(0)
  const [enrollmentTimer, setEnrollmentTimer] = useState(null)
  const [enrollmentFingerprintId, setEnrollmentFingerprintId] = useState(null)
  const [registeredStaffId, setRegisteredStaffId] = useState(null) // staff_id NOT patient_id
  const [retryCount, setRetryCount] = useState(0)

  // Keyboard and NumPad state
  const [pressedKeys, setPressedKeys] = useState(new Set())
  const [showUsernameKeyboard, setShowUsernameKeyboard] = useState(false)
  const [showPinNumPad, setShowPinNumPad] = useState(false)
  const [showPhoneNumPad, setShowPhoneNumPad] = useState(false)
  const [invalidCharErrors, setInvalidCharErrors] = useState({})
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (enrollmentTimer) {
        clearInterval(enrollmentTimer)
      }
    }
  }, [enrollmentTimer])

  // Auto-redirect staff to dashboard when enrollment completes
  useEffect(() => {
    if (fpStatus === 'enrolled' && registeredStaffId) {
      setTimeout(() => {
        nav('/staff') // Redirect to staff dashboard, NOT patient area
      }, 2000)
    }
  }, [fpStatus, registeredStaffId, nav])

  // Start STAFF fingerprint enrollment - uses staff-specific endpoints
  const startAutomaticEnrollment = async (staffId, currentRetry = 0) => {
    setRetryCount(currentRetry)
    setFpStatus('enrolling')
    setFpMessage('Starting staff fingerprint enrollment...')
    setFpProgress(10)
    setRegisteredStaffId(staffId) // Store staff_id
   
    try {
      // STAFF endpoint: /staff/fingerprint/enroll/
      // NOT /fingerprint/enroll/ (that's for patients)
      const response = await fetch('http://localhost:8000/staff/fingerprint/enroll/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ staff_id: staffId }) // staff_id, NOT patient_id
      })
     
      if (!response.ok) {
        // Silent retry for staff enrollment
        const nextRetry = currentRetry + 1
        setFpMessage(`Retrying staff enrollment... (Attempt ${nextRetry + 1})`)
        setFpProgress(5)
        
        setTimeout(() => {
          startAutomaticEnrollment(staffId, nextRetry)
        }, 1500)
        return
      }
     
      const data = await response.json()
      setEnrollmentFingerprintId(data.fingerprint_id)
      setFpMessage('Staff: Place your finger on the sensor')
      setFpProgress(25)
     
      // Poll STAFF enrollment status - staff-specific endpoint
      const timer = setInterval(async () => {
        try {
          // STAFF endpoint: /staff/fingerprint/status/
          // NOT /fingerprint/status/ (that's for patients)
          const statusRes = await fetch(
            `http://localhost:8000/staff/fingerprint/status/?fingerprint_id=${data.fingerprint_id}&staff_id=${staffId}`,
            { credentials: 'include' }
          )
         
          if (!statusRes.ok) throw new Error('Staff status check failed')
          
          const statusData = await statusRes.json()
         
          // Update based on Arduino status for staff enrollment
          if (statusData.status === 'place_finger') {
            if (statusData.step === 1) {
              setFpMessage('Staff: Place your finger on the sensor')
              setFpProgress(30)
            } else if (statusData.step === 2) {
              setFpMessage('Staff: Place same finger again')
              setFpProgress(65)
            }
          } else if (statusData.status === 'remove_finger') {
            setFpMessage('Staff: Remove finger...')
            setFpProgress(45)
          } else if (statusData.status === 'enrolled') {
            clearInterval(timer)
            setEnrollmentTimer(null)
            setFpStatus('enrolled')
            setFpProgress(100)
            setFpMessage('Staff fingerprint enrolled successfully!')
            setPopupMsg('Staff registration complete! Redirecting to dashboard...')
          } else if (statusData.status === 'error') {
            // Clear timer and retry for staff
            clearInterval(timer)
            setEnrollmentTimer(null)
            
            const nextRetry = currentRetry + 1
            setFpMessage(`Retrying staff enrollment... (Attempt ${nextRetry + 1})`)
            setFpProgress(10)
            
            setTimeout(() => {
              startAutomaticEnrollment(staffId, nextRetry)
            }, 1500)
          }
          
          if (statusData.message && statusData.status !== 'error') {
            setFpMessage(statusData.message)
          }
        } catch (err) {
          console.error('Error checking staff enrollment status:', err)
          // Continue polling even on error
        }
      }, 1000)
     
      setEnrollmentTimer(timer)
     
    } catch (err) {
      // Retry on network/server errors for staff
      const nextRetry = currentRetry + 1
      setFpMessage(`Staff connection error. Retrying... (Attempt ${nextRetry + 1})`)
      setFpProgress(5)
      
      setTimeout(() => {
        startAutomaticEnrollment(staffId, nextRetry)
      }, 1500)
    }
  }

  // Cancel staff enrollment
  const cancelEnrollment = () => {
    if (enrollmentTimer) {
      clearInterval(enrollmentTimer)
      setEnrollmentTimer(null)
    }
    setFpStatus('cancelled')
    setFpMessage('Staff enrollment cancelled')
    setCreating(false)
    setPopupMsg('Staff fingerprint enrollment cancelled. You can try again from staff profile.')
  }

  // Keyboard handler
  const onKeyboardPress = (key) => {
    const keyForPressState = /^[a-z]$/.test(key) ? key.toUpperCase() : key
    setPressedKeys(new Set([keyForPressState]))
    setTimeout(() => setPressedKeys(new Set()), 120)

    const isNameField = ['first_name', 'middle_name', 'last_name', 'position', 'department'].includes(focusedField)
    if (/^[0-9]$/.test(key) && isNameField) {
      setFieldInvalidChar(focusedField, true, 'Only letters allowed')
      setTimeout(() => {
        setFieldInvalidChar(focusedField, false)
      }, 2000)
      return
    }

    if (/^[A-Za-z]$/.test(key) || (/^[0-9]$/.test(key) && !isNameField) || (focusedField === 'email' && /^[._@-]$/.test(key))) {
      if (focusedField === 'first_name') {
        setFirstName(v => v + key)
      } else if (focusedField === 'middle_name') {
        setMiddleName(v => v + key)
      } else if (focusedField === 'last_name') {
        setLastName(v => v + key)
      } else if (focusedField === 'position') {
        setPosition(v => v + key)
      } else if (focusedField === 'department') {
        setDepartment(v => v + key)
      } else if (focusedField === 'username') {
        setUsername(u => u + key)
      } else if (focusedField === 'email') {
        setEmail(e => e + key)
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
      } else if (focusedField === 'position') {
        setPosition(v => v.slice(0, -1))
      } else if (focusedField === 'department') {
        setDepartment(v => v.slice(0, -1))
      } else if (focusedField === 'username') {
        setUsername(u => u.slice(0, -1))
      } else if (focusedField === 'email') {
        setEmail(e => e.slice(0, -1))
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
      } else if (focusedField === 'position') {
        setPosition(v => v + ' ')
      } else if (focusedField === 'department') {
        setDepartment(v => v + ' ')
      } else if (focusedField === 'username') {
        setUsername(u => u + ' ')
      }
      if (focusedField) {
        if (focusedField === 'email') {
          setFieldInvalidChar('email', true, 'Invalid character: " "')
          setTimeout(() => {
            setFieldInvalidChar('email', false)
          }, 2000)
        } else {
          setFieldInvalidChar(focusedField, false)
        }
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

  // PIN NumPad handler
  const onNumPadPress = (key) => {
    if (/^[0-9]$/.test(key)) {
      if (pin.length < 4) {
        setPin(p => p + key)
      }
    } else if (key === 'BACKSPACE') {
      setPin(p => p.slice(0, -1))
    }
  }

  // Phone NumPad handler
  const onPhoneNumPadPress = (key) => {
    if (/^[0-9]$/.test(key)) {
      if (phone.length < 11) {
        setPhone(ph => ph + key)
      }
    } else if (key === 'BACKSPACE') {
      setPhone(ph => ph.slice(0, -1))
    }
  }

  // Validate staff form
  const validateForm = () => {
    const newErrors = {}

    if (!first_name.trim()) newErrors.first_name = 'First name is required'
    if (!last_name.trim()) newErrors.last_name = 'Last name is required'
    if (!username.trim()) newErrors.username = 'Username is required'
    if (!pin || pin.length !== 4) newErrors.pin = 'PIN must be 4 digits'
    if (!position.trim()) newErrors.position = 'Position is required'
    if (!department.trim()) newErrors.department = 'Department is required'
    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required'
    } else if (!/^\d{10,}$/.test(phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid phone number'
    }
    if (!email.trim()) {
      newErrors.email = 'Email address is required'
    } else if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Create STAFF account - then start STAFF fingerprint enrollment in side panel
  const handleCreateStaff = async () => {
    if (!validateForm()) return

    setCreating(true)

    try {
      // Create staff record via /staff/ endpoint (NOT /patients/)
      const res = await fetch('http://localhost:8000/staff/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          first_name: first_name.trim(),
          middle_name: middle_name.trim(),
          last_name: last_name.trim(),
          username: username.trim(),
          pin,
          phone: phone.trim(),
          email: email.trim(),
          position: position.trim(),
          department: department.trim(),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Staff registration failed')
      }

      const data = await res.json()
      
      // Start STAFF fingerprint enrollment immediately in side panel
      // Uses staff_id, NOT patient_id
      setPopupMsg('Staff account created! Please follow the fingerprint enrollment steps.')
      await startAutomaticEnrollment(data.staff_id) // staff_id for staff, not patient_id
      
    } catch (err) {
      setPopupMsg(err.message || 'Staff registration failed')
      setCreating(false)
    }
  }

  // Render the STAFF registration form with side panel enrollment
  return (
    <>
      {popupMsg && (
        <Popup
          message={popupMsg}
          onClose={() => setPopupMsg('')}
        />
      )}

      <section
        className={`relative min-h-screen px-4 py-16 ${showUsernameKeyboard ? 'min-h-screen' : 'min-h-screen flex items-center justify-center'}`}
        style={{ backgroundImage: `url(${bgRegister})` }}
      >
        <div className="absolute inset-0 bg-emerald-900/40 backdrop-blur-sm" />
        
        <div className={`relative w-full max-w-5xl bg-white rounded-3xl shadow-xl p-6 md:p-10 mx-auto ${(showUsernameKeyboard || showPinNumPad || showPhoneNumPad) ? 'mb-[22rem]' : ''}`}>
          <div className="mb-8">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-700">
              Staff Registration
            </h2>
            <p className="mt-2 text-gray-600">
              {fpStatus === 'idle' 
                ? 'Create staff account and enroll staff fingerprint' 
                : 'Complete staff fingerprint enrollment'}
            </p>
          </div>

          {/* 2-Column Grid: Staff Form (left) + Staff Biometric Card (right) */}
          <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
            
            {/* LEFT: Staff Registration Form - Disabled during enrollment */}
            <form onSubmit={(e) => { e.preventDefault(); handleCreateStaff() }} className="space-y-6">
              
              {/* Staff Personal Information */}
              <div className={fpStatus !== 'idle' ? 'opacity-50 pointer-events-none' : ''}>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff First Name</label>
                    <input
                      type="text"
                      value={first_name}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('first_name', /[^A-Za-z ]/.test(next), 'Only letters allowed')
                        setFirstName(next.replace(/[^A-Za-z ]/g, ''))
                      }}
                      onFocus={() => {
                        setShowUsernameKeyboard(true)
                        setShowPinNumPad(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('first_name')
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="Staff First Name"
                    />
                    {invalidCharErrors.first_name && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.first_name}</p>}
                    {errors.first_name && <p className="text-red-600 text-xs mt-1">{errors.first_name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Middle Name</label>
                    <input
                      type="text"
                      value={middle_name}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('middle_name', /[^A-Za-z ]/.test(next), 'Only letters allowed')
                        setMiddleName(next.replace(/[^A-Za-z ]/g, ''))
                      }}
                      onFocus={() => {
                        setShowUsernameKeyboard(true)
                        setShowPinNumPad(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('middle_name')
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="Staff Middle Name (optional)"
                    />
                    {invalidCharErrors.middle_name && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.middle_name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Last Name</label>
                    <input
                      type="text"
                      value={last_name}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('last_name', /[^A-Za-z ]/.test(next), 'Only letters allowed')
                        setLastName(next.replace(/[^A-Za-z ]/g, ''))
                      }}
                      onFocus={() => {
                        setShowUsernameKeyboard(true)
                        setShowPinNumPad(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('last_name')
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="Staff Last Name"
                    />
                    {invalidCharErrors.last_name && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.last_name}</p>}
                    {errors.last_name && <p className="text-red-600 text-xs mt-1">{errors.last_name}</p>}
                  </div>
                </div>
              </div>

              {/* Staff Contact Information */}
              <div className={fpStatus !== 'idle' ? 'opacity-50 pointer-events-none' : ''}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('phone', /[^0-9]/.test(next))
                        setPhone(next.replace(/\D/g, '').slice(0, 11))
                      }}
                      onFocus={() => {
                        setShowPhoneNumPad(true)
                        setShowUsernameKeyboard(false)
                        setShowPinNumPad(false)
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="Staff Contact Number"
                    />
                    {invalidCharErrors.phone && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.phone}</p>}
                    {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('email', /[^A-Za-z0-9._@-]/.test(next))
                        setEmail(next.replace(/[^A-Za-z0-9._@-]/g, ''))
                      }}
                      onFocus={() => {
                        setShowUsernameKeyboard(true)
                        setShowPinNumPad(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('email')
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="Staff Email address"
                    />
                    {invalidCharErrors.email && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.email}</p>}
                    {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
                  </div>
                </div>
              </div>

              {/* Staff Position & Department */}
              <div className={fpStatus !== 'idle' ? 'opacity-50 pointer-events-none' : ''}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Position</label>
                    <input
                      type="text"
                      value={position}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('position', /[^A-Za-z0-9 ]/.test(next))
                        setPosition(next.replace(/[^A-Za-z0-9 ]/g, ''))
                      }}
                      onFocus={() => {
                        setShowUsernameKeyboard(true)
                        setShowPinNumPad(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('position')
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="e.g., Nurse, Doctor, Admin"
                    />
                    {invalidCharErrors.position && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.position}</p>}
                    {errors.position && <p className="text-red-600 text-xs mt-1">{errors.position}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Department</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => {
                        const next = e.target.value
                        setFieldInvalidChar('department', /[^A-Za-z0-9 ]/.test(next))
                        setDepartment(next.replace(/[^A-Za-z0-9 ]/g, ''))
                      }}
                      onFocus={() => {
                        setShowUsernameKeyboard(true)
                        setShowPinNumPad(false)
                        setShowPhoneNumPad(false)
                        setFocusedField('department')
                      }}
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="e.g., HR, Medical, IT"
                    />
                    {invalidCharErrors.department && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.department}</p>}
                    {errors.department && <p className="text-red-600 text-xs mt-1">{errors.department}</p>}
                  </div>
                </div>
              </div>

              {/* Staff Account Credentials */}
              <div className={fpStatus !== 'idle' ? 'opacity-50 pointer-events-none' : ''}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
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
                      disabled={creating}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 disabled:bg-gray-100"
                      placeholder="Staff Username"
                    />
                    {invalidCharErrors.username && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.username}</p>}
                    {errors.username && <p className="text-red-600 text-xs mt-1">{errors.username}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Staff PIN (4 digits)</label>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        value={pin}
                        onChange={(e) => {
                          const next = e.target.value
                          setFieldInvalidChar('pin', /[^0-9]/.test(next))
                          setPin(next.slice(0, 4).replace(/\D/g, ''))
                        }}
                        onFocus={() => {
                          setShowPinNumPad(true)
                          setShowUsernameKeyboard(false)
                          setShowPhoneNumPad(false)
                        }}
                        disabled={creating}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 text-center tracking-widest disabled:bg-gray-100"
                        placeholder=""
                        maxLength="4"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <img
                          src={showPin ? hidePinIcon : showPinIcon}
                          alt={showPin ? 'Hide' : 'Show'}
                          className="h-5 w-5"
                        />
                      </button>
                    </div>
                    {invalidCharErrors.pin && <p className="text-red-600 text-xs mt-1">{invalidCharErrors.pin}</p>}
                    {errors.pin && <p className="text-red-600 text-xs mt-1">{errors.pin}</p>}
                  </div>
                </div>
              </div>

              {/* Staff Registration Buttons - Hidden during fingerprint enrollment */}
              {fpStatus === 'idle' && (
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => nav('/staff-login')}
                    className="mt-6 px-8 py-3 rounded-xl border-2 border-gray-300 text-[#426F66] font-medium
                              hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="mt-6 bg-[#6ec1af] hover:bg-emerald-800/70 disabled:opacity-60 text-white font-bold px-8 py-3 rounded-xl shadow-md transition-colors"
                  >
                    {creating ? 'Creating Staff Account...' : 'Register Staff'}
                  </button>
                </div>
              )}

              {/* Keyboard and NumPad components */}
              {showUsernameKeyboard && (
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-2 backdrop-blur">
                  <div className="mx-auto max-w-5xl">
                    <div className="h-[15rem] w-full overflow-hidden">
                      <Keyboard pressedKeys={pressedKeys} onKeyPress={onKeyboardPress} mode="letters" />
                    </div>
                  </div>
                </div>
              )}

              {showPinNumPad && (
                <div className="fixed inset-x-0 bottom-0 justify-items-center z-20 border-t border-slate-200 bg-white/90 p-2 backdrop-blur">
                  <div className="mx-auto max-w-5xl">
                    <div className="h-[15rem] w-full overflow-hidden">
                      <NumPad onKeyPress={onNumPadPress} />
                    </div>
                  </div>
                </div>
              )}

              {showPhoneNumPad && (
                <div className="fixed inset-x-0 bottom-0 z-20 justify-items-center border-t border-slate-200 bg-white/90 p-2 backdrop-blur">
                  <div className="mx-auto max-w-5xl">
                    <div className="h-[15rem] w-full overflow-hidden">
                      <NumPad onKeyPress={onPhoneNumPadPress} />
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* RIGHT: STAFF Biometric Enrollment Card - Shows staff enrollment progress */}
            <aside className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="text-lg font-extrabold text-emerald-800">Staff Biometric Enrollment</h3>
              <p className="mt-1 text-sm text-emerald-900/80">
                {fpStatus === 'idle' ? 'Staff fingerprint enrollment required' : 
                 fpStatus === 'enrolling' ? 'Staff: Follow the instructions below' :
                 fpStatus === 'enrolled' ? 'Staff enrollment complete!' :
                 'Staff enrollment cancelled'}
              </p>
            
              <div className="mt-5 grid place-items-center">
                <div className="h-32 w-32 rounded-full bg-white border-2 border-emerald-300 grid place-items-center overflow-hidden relative">
                  {fpStatus === 'idle' && (
                    <div className="text-emerald-700/80 text-sm text-center px-2">
                      Staff<br/>Ready
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

                  {fpStatus === 'cancelled' && (
                    <div className="text-orange-600 text-4xl">✕</div>
                  )}
                </div>
              </div>
            
              {/* Progress Bar for Staff Enrollment */}
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
                  Staff Status:{' '}
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
                      Staff: Follow the sensor prompts carefully
                      {retryCount > 0 && (
                        <div className="mt-2 text-xs text-blue-600">
                          Staff retry attempt: {retryCount + 1}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={cancelEnrollment}
                      className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 rounded-lg transition-colors"
                    >
                      Cancel Staff Enrollment
                    </button>
                  </div>
                )}
              
                {fpStatus === 'enrolled' && (
                  <div className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-emerald-800 text-sm flex items-center gap-2">
                    <span>✓</span>
                    <span>Staff fingerprint saved!</span>
                  </div>
                )}

                {fpStatus === 'cancelled' && (
                  <div>
                    <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-800 text-sm mb-3">
                      Staff enrollment was cancelled
                    </div>
                    <button
                      onClick={() => startAutomaticEnrollment(registeredStaffId)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2 rounded-lg transition-colors"
                    >
                      Retry Staff Enrollment
                    </button>
                  </div>
                )}

                {fpStatus === 'idle' && !creating && (
                  <div className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-600 text-sm">
                    Click "Register Staff" to start enrollment
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}