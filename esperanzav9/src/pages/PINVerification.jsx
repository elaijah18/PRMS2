// PINVerification.jsx
// PIN verification page for staff/healthcare personnel access

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NumPad from '../components/NumPad'
import showPinIcon from '../assets/show.png'
import hidePinIcon from '../assets/hide.png'
import Popup from '../components/ErrorPopup'

export default function PINVerification() {
  const nav = useNavigate()
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  // Verify PIN
  const verifyPin = async (enteredPin) => {
    if (isVerifying) return

    setIsVerifying(true)

    try {
      const res = await fetch('http://localhost:8000/staff/verify-pin/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pin: enteredPin,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'PIN verification failed')
      }

      const data = await res.json()

      if (data.verified) {
        setPin('')
        // Redirect to staff login
        nav('/staff-login')
      } else {
        setPopupMsg('Invalid PIN. Please try again.')
        setPin('')
      }
    } catch (err) {
      setPopupMsg(err.message || 'PIN verification failed')
      setPin('')
    } finally {
      setIsVerifying(false)
    }
  }

  // Handle keypad input
  const onKey = (k) => {
    if (isVerifying) return

    if (k === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (/[0-9]/.test(k) && pin.length < 4) {
      const newPin = pin + k
      setPin(newPin)
      if (newPin.length === 4) verifyPin(newPin)
      return
    }

    if (k === 'Enter') {
      if (pin.length < 4) {
        setPopupMsg('Please enter your 4-digit PIN.')
        return
      }
      verifyPin(pin)
    }
  }

  const tileClass =
    "group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all " +
    "border border-emerald-500/60 shadow-lg hover:shadow-xl overflow-hidden px-6 py-10"

  return (
    <>
      {popupMsg && (
        <Popup
          message={popupMsg}
          onClose={() => setPopupMsg('')}
        />
      )}

      <section className="mx-auto max-w-5xl px-4 pt-20 pb-16">
        <div className="text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide leading-snug 
                         bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 
                         bg-clip-text text-transparent">
            Healthcare Personnel Access
          </h2>
          <p className="mt-1 text-slate-600 text-center">Enter your assigned 4-digit PIN to proceed to staff login and management features.</p>
        </div>

        {/* PIN INPUT */}
        <div className="mt-10 flex justify-center">
          <div className="card rounded-3xl bg-white shadow-lg p-6 w-80">
            {/* PIN Label */}
            <label className="block text-sm font-medium text-slate-700 mb-4">
              4-Digit PIN
            </label>

            {/* PIN Input Field */}
            <div className="relative mb-6">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setPin(value)
                  if (value.length === 4) {
                    verifyPin(value)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pin.length === 4) {
                    verifyPin(pin)
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-2xl tracking-widest text-center"
                placeholder="••••"
              />
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                className="absolute inset-y-0 right-2 my-auto h-9 w-9 grid place-items-center"
              >
                <img
                  src={showPin ? hidePinIcon : showPinIcon}
                  alt="Toggle PIN visibility"
                  className="h-5 w-5"
                />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-6">
              {pin.length === 4
                ? 'Press Enter or wait for verification.'
                : 'Enter your 4-digit PIN.'}
            </p>

            {/* NumPad */}
            <NumPad 
              onKey={onKey}
              disabled={isVerifying}
            />
          </div>
        </div>

        {/* Back Button - HOME OR LOGIN (SAAN IREREDIRECT?) */}
        <div className="mt-6 flex items-center justify-center">
          <button
            onClick={() => nav('/')}
            className="px-6 py-2 rounded-lg border-2 border-emerald-600 text-emerald-600 
                       text-sm font-bold hover:bg-emerald-50 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </section>
    </>
  )
}
