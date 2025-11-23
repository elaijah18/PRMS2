// Staff.jsx
// This component serves as the main dashboard for healthcare personnel,
// providing access to patient records, kiosk status, and reports.

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import reportsIcon from '../assets/file.png'
import patientsIcon from '../assets/patients.png'
import queueIcon from '../assets/queue.png'
import logoutIcon from '../assets/logout-green.png'

export default function Staff() {
  const nav = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const tile =
    "group rounded-3xl bg-[#6ec1af] hover:bg-emerald-800/70 transition-all " +
    "border border-emerald-500/60 shadow-lg hover:shadow-xl overflow-hidden px-6 py-8 text-white flex flex-col items-center text-center"

  const handleLogout = () => {
    // clear relevant items from localStorage
    localStorage.removeItem('staffProfile')
    localStorage.removeItem('patientProfile')
    localStorage.removeItem('latestVitals')
    localStorage.removeItem('vitalsHistory')

    // navigate to login
    nav('/login')
  }

  return (
    <section className="relative mx-auto max-w-6xl px-4 py-16">
      {/* Logout button */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-[#406E65] hover:bg-slate-50 shadow"
          aria-label="Open logout confirmation"
        >
          <img
            src={logoutIcon}
            alt="Logout icon"
            className="h-4 w-4 object-contain"
            loading="lazy"
          />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>

      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-700 bg-clip-text text-transparent text-center">
        Healthcare Personnel&apos;s Dashboard
      </h2>
      <p className="mt-2 text-slate-600 text-center">
        Manage patient records and supervise queuing system.
      </p>

      <div className="mt-8 grid md:grid-cols-3 gap-6">
        <Link to="/staff/patient-records" className={tile} aria-label="Patients">
          <img
            src={patientsIcon}
            alt="Patients"
            className="h-16 w-16 object-contain mb-4"
            loading="lazy"
          />
          <h3 className="text-xl font-extrabold">Patients</h3>
          <p className="mt-1 text-white/85">Search, view, and update records.</p>
        </Link>

        <Link to="/staff/QueueManagement" className={tile} aria-label="Queue Management">
          <img
            src={queueIcon}
            alt="Queue Management"
            className="h-16 w-16 object-contain mb-4"
            loading="lazy"
          />
          <h3 className="text-xl font-extrabold">Queue Management</h3>
          <p className="mt-1 text-white/85">Supervise the queue's workflow.</p>
        </Link>

        <Link to="/staff/reports" className={tile} aria-label="Reports">
          <img
            src={reportsIcon}
            alt="Reports"
            className="h-16 w-16 object-contain mb-4"
            loading="lazy"
          />
          <h3 className="text-xl font-extrabold">Reports</h3>
          <p className="mt-1 text-white/85">
            View recent vitals and visit summaries.
          </p>
        </Link>
      </div>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Logout confirmation"
        >
          <div className="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center shadow-lg">
            <p className="text-lg font-semibold text-slate-700">
              Are you sure you want to logout?
            </p>

            <div className="mt-6 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false)
                  handleLogout()
                }}
                className="px-4 py-2 rounded-lg bg-[#6ec1af] text-white hover:bg-emerald-800/70"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
