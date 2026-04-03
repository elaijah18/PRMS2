// LoginAuth.jsx
import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import NumPad from '../components/NumPad'
import Keyboard from '../components/Keyboard'
import FingerprintScanner from '../components/FingerprintScanner'
import pinIcon from '../assets/dialpadalt.png'
import fingerprintIcon from '../assets/fingerprint.png'
import showPinIcon from '../assets/show.png'
import hidePinIcon from '../assets/hide.png'
import Popup from '../components/ErrorPopup'
import backIcon from '../assets/arrow.png'

let globalPollingLock = false

export default function LoginAuth() {
  const { state } = useLocation()
  const role = state?.role || 'patient'
  const nav = useNavigate()
  const timeoutRef = useRef(null)
  const [mode, setMode] = useState(null)
  const [pin, setPin] = useState('')
  const [username, setUsername] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  const [pressedKeys, setPressedKeys] = useState(new Set())
  const [showUsernameKeyboard, setShowUsernameKeyboard] = useState(false)
  const [InvalidKeyMsg, setInvalidKeyMsg] = useState('')
  
  const [fpStatus, setFpStatus] = useState('idle')
  const [scanAttempt, setScanAttempt] = useState(0)
  const [fpMessage, setFpMessage] = useState('')
  const pollingRef = useRef(null)
  const lastScannedIdRef = useRef(null)
  const hasSuccessRef = useRef(false)
  
  const safeStopFingerprint = async () => {
    try {
      await fetch('http://localhost:8000/api/fingerprint/stop/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (err) {
      console.error('Stop error:', err)
    }
  }
  
  useEffect(() => {
    return () => {
      cleanupFingerprint()
    }
  }, [])

  const cleanupFingerprint = async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    globalPollingLock = false
    hasSuccessRef.current = false
    setFpStatus('idle')
    setFpMessage('')
    await safeStopFingerprint() 
  }

  const authenticateUser = async (enteredPin, loginType) => {
    if (isAuthenticating) return
    if (username.trim().length === 0) {
      setPopupMsg('Please enter your username.')
      return
    }

    setIsAuthenticating(true)

    try {
      const res = await fetch(`http://localhost:8000/api/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pin: enteredPin,
          login_type: loginType,
          username: username.trim(),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Authentication failed')
      }

      const userData = await res.json()

      if (userData.role !== role) {
        throw new Error(`This account is a ${userData.role}, not ${role}.`)
      }

      if (userData.role === 'patient') {
        sessionStorage.setItem('patientName', userData.name)
        sessionStorage.setItem('isAuthenticated', 'true')
        sessionStorage.setItem('userRole', 'patient')
        sessionStorage.setItem('patient_id', userData.patient_id)
        nav('/portal')
      } else if (userData.role === 'staff') {
        sessionStorage.setItem('staffName', userData.name)
        sessionStorage.setItem('isAuthenticated', 'true')
        sessionStorage.setItem('userRole', 'staff')
        sessionStorage.setItem('staff_id', userData.staff_id)
        nav('/staff')
      }
    } catch (err) {
      setPopupMsg(err.message || 'Authentication failed')
      setPin('')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const startFingerprintScan = async () => {
    if (globalPollingLock) {
      setPopupMsg('Another scan is active. Please wait.')
      return
    }

    await cleanupFingerprint()
    globalPollingLock = true
    hasSuccessRef.current = false

    lastScannedIdRef.current = null
    setFpStatus('scanning')
    setFpMessage(role === 'staff' ? 'Place staff finger...' : 'Place finger...')

    try {
      const res = await fetch('http://localhost:8000/api/fingerprint/scan/', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Scan start failed: ${err}`)
      }

      pollingRef.current = setInterval(() => checkFingerprintMatch(), 600)
      
      // Back to 10 seconds for 1-phase fast scan
      timeoutRef.current = setTimeout(async () => {
        if (hasSuccessRef.current) return

        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }

        globalPollingLock = false
        await safeStopFingerprint()

        setFpStatus('idle')
        setFpMessage('')
        setPopupMsg('No match found. Please register.')

      }, 10000) 

    } catch (err) {
      setPopupMsg(err.message)
      setFpStatus('idle')
      globalPollingLock = false
    }
  }

  const checkFingerprintMatch = async () => {
    if (hasSuccessRef.current) return

    const endpoint = role === 'staff'
      ? 'http://localhost:8000/api/fingerprint/staff/match/'
      : 'http://localhost:8000/api/fingerprint/patient/match/'   

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include'
      })

      const data = await res.json()

      // Keep user informed if button was clicked
      if (data.message && data.message.includes("Button queued")) {
        setFpMessage("Button queued! Processing login...")
        return
      }

      if (data.status === 'scanning' || data.status === 'place_finger' || data.status === 'remove_finger') {
        if (data.message && data.message !== fpMessage) {
          setFpMessage(data.message)
        }
        return
      }

      if (data.status === 'success') {
        if (hasSuccessRef.current) return
        hasSuccessRef.current = true

        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }

        globalPollingLock = false
        await safeStopFingerprint() 

        if (role === 'staff') {
          sessionStorage.setItem('staffName', data.name)
          sessionStorage.setItem('staff_id', data.staff_id)
          sessionStorage.setItem('isAuthenticated', 'true')  
          sessionStorage.setItem('userRole', 'staff')  
          nav('/staff')
        } else {
          sessionStorage.setItem('patientName', data.name)
          sessionStorage.setItem('patient_id', data.patient_id)
          sessionStorage.setItem('isAuthenticated', 'true')  
          sessionStorage.setItem('userRole', 'patient')       
          nav('/portal')
        }
        return
      }

    } catch (err) {
      console.error('Network error:', err)
    }
  }

  const onKey = (k) => {
    if (isAuthenticating) return
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (/[0-9]/.test(k) && pin.length < 4) {
      const newPin = pin + k
      setPin(newPin)
      if (newPin.length === 4) authenticateUser(newPin, role)
      return
    }
    if (k === 'Enter') {
      if (pin.length < 4) {
        setPopupMsg('Please enter your 4-digit PIN.')
        return
      }
      authenticateUser(pin, role)
    }
  }

  const onKeyboardPress = (key) => {
    const keyForPressState = /^[a-z]$/.test(key) ? key.toUpperCase() : key
    setPressedKeys(new Set([keyForPressState]))
    setTimeout(() => setPressedKeys(new Set()), 120)

    if (/^[A-Za-z0-9]$/.test(key)) {
      setUsername(u => u + key)
      setInvalidKeyMsg('')
      return
    }
    if (key === 'BACKSPACE') {
      setUsername(u => u.slice(0, -1))
      setInvalidKeyMsg('')
      return
    }
    if (key === 'SPACE') {
      setUsername(u => u + ' ')
      setInvalidKeyMsg('')
      return
    }
    if (key === 'ENTER2') {
      if (pin.length < 4) {
        setPopupMsg('Please enter your 4-digit PIN.')
        return
      }
      authenticateUser(pin, role)
      return
    }
    if (key === 'KEYBOARD') {
      setShowUsernameKeyboard(false)
      return
    }
    if (key && key.length === 1) {
      setInvalidKeyMsg(`Invalid character: "${key}"`)
      setTimeout(() => setInvalidKeyMsg(''), 2000)
      return
    }
  }

  const tile =
    'group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all ' +
    'border border-emerald-500/60 shadow-lg hover:shadow-xl overflow-hidden px-6 py-10'

  const pinReady = username.trim() && pin.length === 4

  const handleBack = () => {
    if (!mode) {
      nav(-1)
      return
    }
    if (mode === 'fp') {
      cleanupFingerprint()
    }
    setShowUsernameKeyboard(false)
    setMode(null)
  }

  return (
    <section className={`mx-auto max-w-5xl px-4 pt-20 ${showUsernameKeyboard ? 'pb-[22rem]' : 'pb-16'}`}>
      <div className="mb-3">
        <button onClick={handleBack}
          className="flex items-center gap-2 rounded-xl bg-transparent px-3 py-2 text-[#406E65] hover:bg-gray-100 transition-colors">
          <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      <div className="text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide leading-snug 
          bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 
          bg-clip-text text-transparent">
          {role === 'staff' ? 'Staff Login' : 'Patient Login'}
        </h2>
        <p className="mt-1 text-slate-600 text-center">Choose your authentication method</p>
        
        <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
          ${role === 'staff' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
          <span>{role === 'staff' ? '🔒 Staff Access' : '🏥 Patient Access'}</span>
        </div>
      </div>

      {!mode && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button className={tile} onClick={() => setMode('pin')} disabled={isAuthenticating}>
            <div className="flex flex-col items-center text-white">
              <div className="grid place-items-center h-36 w-full">
                <img src={pinIcon} alt="PIN" className="h-28 w-28 opacity-95" />
              </div>
              <div className="mt-4 text-2xl font-extrabold">PIN Code</div>
              <div className="mt-1 text-sm opacity-80">Username + 4-digit PIN</div>
            </div>
          </button>

          <button className={tile} onClick={() => {
            setMode('fp')
            setScanAttempt(a => a + 1)
            startFingerprintScan()
          }} disabled={isAuthenticating || globalPollingLock}>
            <div className="flex flex-col items-center text-white">
              <div className="grid place-items-center h-36 w-full">
                <img src={fingerprintIcon} alt="Fingerprint" className="h-28 w-28 opacity-95" />
              </div>
              <div className="mt-4 text-2xl font-extrabold">Fingerprint</div>
              <div className="mt-1 text-sm opacity-80">
                {globalPollingLock ? 'Scan active elsewhere...' : 'Biometric authentication'}
              </div>
            </div>
          </button>
        </div>
      )}

      {mode === 'pin' && (
        <div className="mt-10 grid md:grid-cols-[1fr_auto] gap-8 items-start">
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 md:p-8">
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setShowUsernameKeyboard(true)}
                placeholder={`Enter ${role} username`}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {InvalidKeyMsg && <p className="mt-2 text-sm text-red-600 font-medium">{InvalidKeyMsg}</p>}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">4-Digit PIN</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onFocus={() => setShowUsernameKeyboard(false)}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setPin(value)
                    if (value.length === 4) authenticateUser(value, role)
                  }}
                  placeholder="••••"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-2xl tracking-[0.5em] text-center font-bold"
                />
                <button type="button" onClick={() => setShowPin((s) => !s)}
                  className="absolute inset-y-0 right-2 my-auto h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 transition-colors">
                  <img src={showPin ? hidePinIcon : showPinIcon} alt="Toggle" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <p className={`text-sm ${pinReady ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>
              {pinReady ? 'Press Enter or tap Login' : 'Enter username and PIN'}
            </p>

            <button onClick={() => pin.length === 4 && authenticateUser(pin, role)}
              disabled={!pinReady || isAuthenticating}
              className={`mt-4 w-full py-3 rounded-xl font-bold transition-colors
                ${pinReady && !isAuthenticating ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              {isAuthenticating ? 'Authenticating...' : 'Login'}
            </button>
          </div>
          <NumPad onKey={onKey} />
        </div>
      )}

      {mode === 'fp' && (
        <div className="mt-10">
          <div className={`mb-4 rounded-2xl p-4 text-center
            ${role === 'staff' ? 'bg-blue-50 border border-blue-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <p className={`text-sm font-bold uppercase tracking-wide ${role === 'staff' ? 'text-blue-800' : 'text-emerald-800'}`}>
              {role === 'staff' ? '🔒 Staff Biometric' : '🏥 Patient Biometric'}
            </p>
            <p className="text-xs text-slate-600 mt-1">{fpMessage || 'Place finger on sensor'}</p>
          </div>

          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 md:p-8">
            <FingerprintScanner key={scanAttempt} status={fpStatus} message={fpMessage} onComplete={() => {}} />
            
            <button onClick={() => {
              cleanupFingerprint()
              setMode(null)
            }} className="mt-6 w-full py-3 rounded-xl border-2 border-slate-300 text-slate-600 font-medium hover:bg-slate-50">
              Cancel & Try PIN Instead
            </button>
          </div>
        </div>
      )}

      {mode === 'pin' && showUsernameKeyboard && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-2 backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <div className="h-[15rem] w-full overflow-hidden">
              <Keyboard pressedKeys={pressedKeys} onKeyPress={onKeyboardPress} />
            </div>
          </div>
        </div>
      )}

      {popupMsg && <Popup message={popupMsg} onClose={() => setPopupMsg('')} />}
    </section>
  )
}