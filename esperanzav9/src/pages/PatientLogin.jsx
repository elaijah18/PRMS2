// PatientLogin.jsx
// This component allows users to identify themselves as either new or existing patients,
// directing them to the appropriate registration or login process.

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import newUser from '../assets/add-user.png'
import existingUser from '../assets/patient.png'
import backIcon from '../assets/arrow.png'

export default function PatientLogin() {
  const [patientType, setPatientType] = useState(null)
  const nav = useNavigate()

  const tileClass =
    "group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all " +
    "border border-emerald-500/60 shadow-lg hover:shadow-xl overflow-hidden px-5 py-8"

  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      {/* Back */}
      <div className="mb-3">
        <button onClick={() => nav(-1)}
          className="flex items-center gap-2 rounded-xl bg-transparent px-3 py-2 text-[#406E65]">
        <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
        </button>
      </div>

      <div className="text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide bg-gradient-to-r 
                       from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
          Welcome to Esperanza Health Center!
        </h2>
        <p className="mt-3 text-xl text-slate-700">
          Are you an existing patient or a new patient?
        </p>
      </div>

      <div className="mt-10 grid sm:grid-cols-2 gap-6">
        {/* New Patient */}
        <button onClick={() => nav('/register')} className={tileClass}>
          <div className="flex flex-col items-center text-center">
            <div className="grid place-items-center h-36 w-full">
              <img src={newUser} alt="New patient" className="h-32 w-32 object-contain opacity-95 drop-shadow" />
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-white">New Patient</h3>
            <p className="mt-1 text-white/85">Create your account and PIN.</p>
          </div>
        </button>

        {/* Existing Patient */}
        <button onClick={() => nav('/login-auth', { state: { role: 'patient' } })} className={tileClass}>
          <div className="flex flex-col items-center text-center">
            <div className="grid place-items-center h-36 w-full">
              <img src={existingUser} alt="Existing patient" className="h-32 w-32 object-contain opacity-95 drop-shadow" />
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-white">Existing Patient</h3>
            <p className="mt-1 text-white/85">Verify to continue.</p>
          </div>
        </button>
      </div>
    </section>
  )
}
