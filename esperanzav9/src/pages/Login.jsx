// Login.jsx
// This component serves as the initial landing page where users can identify
// themselves as either patients or healthcare personnel, directing them to the
// appropriate login or registration process.

import React from 'react'
import { useNavigate } from 'react-router-dom'
import patientImg from '../assets/usernurse.png'
import personnelImg from '../assets/usermd.png'

export default function Login() {
  const nav = useNavigate()

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 pb-32">
      <div className="text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide 
             leading-snug md:leading-tight
             bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 
             bg-clip-text text-transparent">
          Welcome to Esperanza Health Center!
        </h2>
        <p className="mt-2 text-xl text-slate-700">
          Are you a patient or a healthcare personnel?
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Patient card */}
        <button
          onClick={() => nav('/patient-login')}
          className="group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all 
                     border border-emerald-500/60 shadow-lg hover:shadow-xl 
                     overflow-hidden px-5 py-8"
        >
          <div className="flex flex-col items-center text-white">
            <div className="grid place-items-center h-36 w-full">
              <img src={patientImg} alt="Patient" className="h-32 w-32 object-contain opacity-95 drop-shadow" />
            </div>
            <div className="mt-4 text-2xl font-extrabold tracking-wide drop-shadow">
              Patient
            </div>
          </div>
        </button>

        {/* Staff card */}
        <button
          onClick={() => nav('/pin-verification')}
          className="group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all 
                     border border-emerald-500/60 shadow-lg hover:shadow-xl 
                     overflow-hidden px-5 py-8"
        >
          <div className="flex flex-col items-center text-white">
            <div className="grid place-items-center h-36 w-full">
              <img src={personnelImg} alt="Staff" className="h-32 w-32 object-contain opacity-95 drop-shadow" />
            </div>
            <div className="mt-4 text-2xl font-extrabold tracking-wide text-center drop-shadow">
              Healthcare<br/>Personnel
            </div>
          </div>
        </button>
      </div>
    </section>
  )
}
