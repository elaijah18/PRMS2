// // FingerprintScanner.jsx - Aligned with Arduino code
// import React, { useEffect, useState } from 'react'

// export default function FingerprintScanner({
//   fingerprintId,
//   patientId,
//   onSuccess = () => {},
//   onError = () => {}
// }) {
//   const [status, setStatus] = useState('waiting')
//   const [message, setMessage] = useState('Initializing...')
//   const [progress, setProgress] = useState(0)

//   useEffect(() => {
//     if (!fingerprintId || !patientId) return

//     const interval = setInterval(async () => {
//       try {
//         const res = await fetch(
//           `http://localhost:8000/fingerprint/status/?fingerprint_id=${fingerprintId}&patient_id=${patientId}`,
//           { credentials: 'include' }
//         )
//         const data = await res.json()

//         setStatus(data.status || 'waiting')

//         // Handle Arduino status messages (aligned with your code)
//         switch (data.status) {
//           case 'place_finger':
//             if (data.step === 1) {
//               setMessage("Place your finger on the sensor")
//               setProgress(20)
//             } else if (data.step === 2) {
//               setMessage("Place same finger again")
//               setProgress(60)
//             } else {
//               setMessage("Place your finger on the sensor")
//               setProgress(20)
//             }
//             break
            
//           case 'remove_finger':
//             setMessage("Remove finger...")
//             setProgress(40)
//             break
            
//           case 'enrolled':
//             setProgress(100)
//             setMessage("Fingerprint enrolled successfully!")
//             clearInterval(interval)
//             setTimeout(() => onSuccess(), 400)
//             break
            
//           case 'error':
//             clearInterval(interval)
//             const errorMsg = data.message || "Enrollment failed"
//             setMessage(errorMsg)
//             onError(errorMsg)
//             break
            
//           case 'waiting':
//             if (data.message) {
//               setMessage(data.message)
//             }
//             break
            
//           default:
//             if (data.message) {
//               setMessage(data.message)
//             }
//             break
//         }
//       } catch (err) {
//         console.error("Polling error:", err)
//       }
//     }, 800)

//     return () => clearInterval(interval)
//   }, [fingerprintId, patientId, onSuccess, onError])

//   return (
//     <div className="flex flex-col items-center">
//       <div className="relative size-40 rounded-[28px] border-2 border-[#6ec1af] p-4 bg-white shadow-sm">
//         <div className="absolute inset-0 rounded-[26px] animate-pulseGlow"></div>

//         {/* Fingerprint Box */}
//         <div className="relative flex h-full w-full items-center justify-center rounded-2xl"
//              style={{ backgroundColor: '#6EC1AF' }}>
//           <svg 
//             className="h-24 w-24 text-white opacity-90"
//             viewBox="0 0 24 24" 
//             fill="none" 
//             stroke="currentColor" 
//             strokeWidth="2"
//           >
//             <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
//             <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
//             <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
//             <path d="M2 12a10 10 0 0 1 18-6" />
//             <path d="M2 16h.01" />
//             <path d="M21.8 16c.2-2 .131-5.354 0-6" />
//             <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
//             <path d="M8.65 22c.21-.66.45-1.32.57-2" />
//             <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
//           </svg>

//           {/* Horizontal scan animation */}
//           {(status !== 'enrolled' && status !== 'error') && (
//             <div className="pointer-events-none absolute inset-x-4 top-0 bottom-0 overflow-hidden rounded-xl">
//               <div className="absolute inset-x-0 h-6 translate-y-[-100%] animate-scan bg-emerald-400/15 backdrop-blur-[1px]" />
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Status Message */}
//       <div className="mt-3 text-slate-700 text-sm font-medium text-center w-48">
//         {message}
//       </div>

//       {/* Progress Bar */}
//       <div className="mt-3 w-56 h-2 rounded-full bg-slate-200 overflow-hidden">
//         <div 
//           className="h-full bg-[#6ec1af] transition-all duration-300" 
//           style={{ width: progress + '%' }} 
//         />
//       </div>
      
//       {/* Error state */}
//       {status === 'error' && (
//         <div className="mt-3 text-xs text-red-600 text-center">
//           {message}
//         </div>
//       )}
//     </div>
//   )
// }

// FingerprintScanner.jsx
// This component simulates a fingerprint scanning process with a progress bar and animation.

import React, { useEffect, useState } from 'react'
import fingerprint from '../assets/fingerprint.png'

export default function FingerprintScanner({ onComplete = () => {} }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + 5)
        if (next === 100) {
          clearInterval(t)
          setTimeout(onComplete, 400)
        }
        return next
      })
    }, 120)
    return () => clearInterval(t)
  }, [onComplete])

  return (
    <div className="flex flex-col items-center">
      <div className="relative size-40 rounded-[28px] border-2 border-[#6ec1af] p-4 bg-white shadow-sm">
        <div className="absolute inset-0 rounded-[26px] animate-pulseGlow"></div>

        <div className="relative flex h-full w-full items-center justify-center rounded-2xl" style={{ backgroundColor: '#6EC1AF' }}>
          <img
            src={fingerprint}
            alt="Fingerprint"
            className="h-24 w-24 object-contain opacity-90 select-none pointer-events-none"
            draggable={false}
          />
          
          <div className="pointer-events-none absolute inset-x-4 top-0 bottom-0 overflow-hidden rounded-xl">
            <div className="absolute inset-x-0 h-6 translate-y-[-100%] animate-scan bg-emerald-400/15 backdrop-blur-[1px]" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 text-slate-600">
        <span className="font-medium">Scanning</span>
        <span className="inline-flex gap-1 ml-1">
          <span className="animate-dot1">.</span>
          <span className="animate-dot2">.</span>
          <span className="animate-dot3">.</span>
        </span>
      </div>

      <div className="mt-3 w-56 h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full bg-[#6ec1af]" style={{ width: progress + '%' }} />
      </div>
    </div>
  )
}