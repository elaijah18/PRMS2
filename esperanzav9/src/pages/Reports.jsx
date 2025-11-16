// Reports.jsx - Connected to Database
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom' // ✅ Added useSearchParams
import backIcon from '../assets/arrow.png'
import accIcon from '../assets/account.png'
import searchIcon from '../assets/search.png'

const TEAL = '#406E65'
const TABLE_BG = '#DCEBE8'

const calcAge = (dobStr) => {
  if (!dobStr) return null
  const dob = new Date(dobStr)
  if (Number.isNaN(dob)) return null
  const t = new Date()
  let age = t.getFullYear() - dob.getFullYear()
  const m = t.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) age--
  return age
}

export default function Reports() {
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams() 
  const [query, setQuery] = useState(searchParams.get('q') || '') 
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPatients()
  }, [])

  useEffect(() => {
    // Whenever URL ?q changes, sync with the search box
    const q = searchParams.get('q') || ''
    setQuery(q)
  }, [searchParams])

  // Helper functions (place them anywhere inside the component)
  const handleSearch = () => {
    if (query.trim()) {
      setSearchParams({ q: query.trim() })
    } else {
      setSearchParams({})
    }
  }

  const handleClear = () => {
    setQuery('')
    setSearchParams({})
  }
  // End of helper functions

  const fetchPatients = async () => {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/patients/', {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch patients')
      const data = await res.json()
      setPatients(data)
    } catch (err) {
      console.error('Failed to fetch patients:', err)
      alert('Failed to fetch patient records')
    } finally {
      setLoading(false)
    }
  }

  const constructName = (patient) => {
    const first = patient.first_name || ''
    const middle = patient.middle_name ? patient.middle_name.charAt(0).toUpperCase() + '.' : ''
    const last = patient.last_name || ''
    const fullName = [first, middle, last].filter(Boolean).join(' ')
    return fullName || '—'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      })
    } catch {
      return '—'
    }
  }

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '—'
    try {
      const date = new Date(dateTimeStr)
      return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return '—'
    }
  }

  const rows = patients.map((patient) => ({
    id: patient.id,
    patientId: patient.patient_id,
    name: constructName(patient),
    sex: patient.sex || '—',
    age: calcAge(patient.birthdate) ?? '—',
    birthdate: formatDate(patient.birthdate),
    address: patient.barangay + patient.street|| '—',
    contact: patient.contact || '—',
    lastVisit: formatDateTime(patient.last_visit),
  }))

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.patientId.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.contact.toLowerCase().includes(q)
    )
  })

  return (
    <section className="relative mx-auto max-w-7xl px-4 py-16">
      {/* Back */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[#406E65] hover:bg-slate-50 shadow"
        >
          <img src={backIcon} alt="Back" className="h-4 w-4 object-contain" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Page title */}
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-700 bg-clip-text text-transparent text-center">
        Patient Reports
      </h2>

      {/* Header bar and search */}
      <div className="mt-6 rounded-2xl border shadow-sm" style={{ background: 'white' }}>
        <div className="flex flex-col md:flex-row items-center md:justify-between gap-4 p-6">
          <h3 className="text-2xl font-extrabold text-slate-900 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent text-center md:text-left w-full md:w-auto">
            <img src={accIcon} alt="Profile" className="inline h-8 w-8 object-contain mr-2" />
            Esperanza Patient Record
          </h3>
          <div className="w-full md:w-1/2 flex justify-end">
            <div className="relative w-full md:w-80">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search name, ID, address or contact…"
                className="w-full rounded-full px-4 py-2 outline-none shadow-inner pr-10"
                style={{
                  background: TABLE_BG,
                  color: TEAL,
                  border: `1px solid ${TEAL}20`,
                }}
              />
              <img
                src={searchIcon}
                alt="Search"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 opacity-70 pointer-events-none"
              />
            </div>
            {/* ✅ Optional Clear Button */}
            <button
              onClick={handleClear}
              className="ml-2 rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr style={{ background: TABLE_BG, color: TEAL }}>
                <th className="px-4 py-3">Last Visit</th>
                <th className="px-4 py-3">Patient ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Sex</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Birthdate</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Contact Number</th>
              </tr>
            </thead>
            <tbody style={{ background: TABLE_BG, color: TEAL }}>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center" colSpan={8}>
                    Loading patient records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center" colSpan={8}>
                    No results found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-white/50 transition-colors" style={{ borderColor: '#406E651A' }}>
                    <td className="px-4 py-3 font-semibold">{r.lastVisit}</td>
                    <td className="px-4 py-3 font-semibold">{r.patientId}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">{r.sex}</td>
                    <td className="px-4 py-3">{r.age}</td>
                    <td className="px-4 py-3">{r.birthdate}</td>
                    <td className="px-4 py-3">{r.address}</td>
                    <td className="px-4 py-3">{r.contact}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Results footer */}
          {!loading && patients.length > 0 && filtered.length > 0 && (
            <div className="px-6 pb-4 pt-2 text-sm text-slate-600 text-center">
              Showing <span className="font-semibold">{filtered.length}</span>
              {' '}out of{' '}
              <span className="font-semibold">{patients.length}</span>
              {' '}patient{patients.length === 1 ? '' : 's'}.
            </div>
          )}

        </div>
        <div className="h-4" />
      </div>
    </section>
  )
}
