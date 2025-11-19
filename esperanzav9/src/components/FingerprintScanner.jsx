// FingerprintScanner.jsx (REAL Arduino-integrated version)
// Matches Django + Arduino messages used in Register.jsx


import React, { useEffect, useState } from 'react'
import fingerprintImg from '../assets/fingerprint-sensor.png'


export default function FingerprintScanner({
  fingerprintId,
  patientId,
  onSuccess = () => {},
  onError = () => {}
}) {


  const [status, setStatus] = useState('waiting')
  const [message, setMessage] = useState('Place your finger on the sensor')
  const [progress, setProgress] = useState(0)


  useEffect(() => {
    if (!fingerprintId || !patientId) return


    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/fingerprint/status/?fingerprint_id=${fingerprintId}&patient_id=${patientId}`,
          { credentials: 'include' }
        )
        const data = await res.json()


        // Handle Arduino messages
        setStatus(data.status || 'waiting')


        if (data.message) {
          setMessage(data.message)
        }


        // Match Arduino / Backend enrollment states
        switch (data.status) {
          case 'place_finger':
            setMessage("Place your finger on the sensor")
            setProgress(20)
            break
          case 'remove_finger':
            setMessage("Remove finger...")
            setProgress(50)
            break
          case 'capture_1':
            setMessage("Capturing sample 1...")
            setProgress(60)
            break
          case 'capture_2':
            setMessage("Capturing sample 2...")
            setProgress(80)
            break
          case 'enrolled':
          case 'success':
            setProgress(100)
            setMessage("Fingerprint enrolled successfully!")
            clearInterval(interval)
            setTimeout(() => onSuccess(), 400)
            break
          case 'error':
            clearInterval(interval)
            onError(data.message || "Enrollment failed")
            break
          default:
            break
        }
      } catch (err) {
        console.error("Polling error:", err)
      }
    }, 800)


    return () => clearInterval(interval)
  }, [fingerprintId, patientId, onSuccess, onError])


  return (
    <div className="flex flex-col items-center">
      <div className="relative size-40 rounded-[28px] border-2 border-[#6ec1af] p-4 bg-white shadow-sm">
        <div className="absolute inset-0 rounded-[26px] animate-pulseGlow"></div>


        {/* Fingerprint Box */}
        <div className="relative flex h-full w-full items-center justify-center rounded-2xl"
             style={{ backgroundColor: '#6EC1AF' }}>
          <img
            src={fingerprintImg}
            alt="Fingerprint"
            className="h-24 w-24 object-contain opacity-90 select-none pointer-events-none"
            draggable={false}
          />


          {/* Horizontal scan animation */}
          {(status !== 'enrolled' && status !== 'error') && (
            <div className="pointer-events-none absolute inset-x-4 top-0 bottom-0 overflow-hidden rounded-xl">
              <div className="absolute inset-x-0 h-6 translate-y-[-100%] animate-scan bg-emerald-400/15 backdrop-blur-[1px]" />
            </div>
          )}
        </div>
      </div>


      {/* Status Message */}
      <div className="mt-3 text-slate-700 text-sm font-medium text-center w-48">
        {message}
      </div>


      {/* Progress Bar */}
      <div className="mt-3 w-56 h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full bg-[#6ec1af]" style={{ width: progress + '%' }} />
      </div>
    </div>
  )
}


