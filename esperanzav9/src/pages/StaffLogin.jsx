// StaffLogin.jsx
// Staff login page

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import newUser from '../assets/add-user.png'
import existingUser from '../assets/patient.png'
import Popup from '../components/ErrorPopup'
import backIcon from '../assets/arrow.png'

export default function StaffLogin() {
  const nav = useNavigate()
  const [popupMsg, setPopupMsg] = useState('')
  
  const tileClass = "group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all " +
    "border border-emerald-500/60 shadow-lg hover:shadow-xl overflow-hidden px-5 py-8"

  // =====================================================
  // RENDER: STAFF TYPE SELECTION STAGE
  // =====================================================

  return (
    <>
      {popupMsg && (
        <Popup
          message={popupMsg}
          onClose={() => setPopupMsg('')}
        />
      )}

      <section className="mx-auto max-w-5xl px-4 py-16">
        {/* Back */}
        <div className="mb-3">
            <button
                  onClick={() => nav(-1)}
                  className="flex items-center gap-2 rounded-xl bg-transparent px-3 py-2 text-[#406E65]"
                >
            <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
            </button>
        
        <div className="text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide bg-gradient-to-r 
                         from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
            Welcome, Healthcare Personnel!
          </h2>
          <p className="mt-3 text-xl text-slate-700">
            Are you a new staff member or an existing staff member?
          </p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 gap-6">
          {/* New Staff */}
          <button 
            onClick={() => nav('/staff-register')} 
            className={tileClass}
          >
            <div className="flex flex-col items-center text-center">
              <div className="grid place-items-center h-36 w-full">
                <img src={newUser} alt="New staff" className="h-32 w-32 object-contain opacity-95 drop-shadow" />
              </div>
              <h3 className="mt-4 text-2xl font-extrabold text-white">New Staff</h3>
              <p className="mt-1 text-white/85">Register and enroll fingerprint.</p>
            </div>
          </button>

          {/* Existing Staff */}
          <button 
            onClick={() => nav('/login-auth', { state: { role: 'staff' } })} 
            className={tileClass}
          >
            <div className="flex flex-col items-center text-center">
              <div className="grid place-items-center h-36 w-full">
                <img src={existingUser} alt="Existing staff" className="h-32 w-32 object-contain opacity-95 drop-shadow" />
              </div>
              <h3 className="mt-4 text-2xl font-extrabold text-white">Existing Staff</h3>
              <p className="mt-1 text-white/85">Verify to continue.</p>
            </div>
          </button>
        </div>
        </div>
      </section>
    </>
  )
}
