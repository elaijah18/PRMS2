import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import PatientPortal from './pages/PatientPortal'
import VitalSigns from './pages/VitalSigns'
import Weight from './pages/vitals/Weight'
import Height from './pages/vitals/Height'
import Pulse from './pages/vitals/Pulse'
import Temperature from './pages/vitals/Temperature'
import BP from "./pages/vitals/BP"
import Records from './pages/Records'
import Staff from './pages/Staff'
import PatientLogin from './pages/PatientLogin'
import LoginAuth from './pages/LoginAuth'
import bgImage from './assets/background.png'
import PatientRecords from './pages/PatientRecords'
import QueueManagement from './pages/QueueManagement'
import Reports from './pages/Reports'
import PrivacyNotice from './components/PrivacyNotice'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsofService from './pages/TermsofService'
import StaffLogin from './pages/StaffLogin'
import StaffRegister from './pages/StaffRegister'
import PINVerification from './pages/PINVerification'
import ArchivedPatients from './pages/ArchivedPatients'

const API_URL = 'http://localhost:8000'

export default function App() {

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/queue/check-next-button/`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()

        // Only fire if button was actually pressed AND sensor is not busy
        // sensor_busy means fingerprint/vitals is in progress — queue will
        // auto-advance via _pending_btn_next once the sensor session ends
        if (data.pressed && !data.sensor_busy) {
          window.dispatchEvent(new CustomEvent('hardware-next'))
        }
      } catch {
        // silent
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ backgroundImage: `url(${bgImage})` }} className="min-h-screen bg-cover bg-fixed bg-center overflow-hidden" >
      <main className="min-h-[calc(120vh-4rem)] bg-white/40">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsofService />} />
          <Route path="/login" element={<Login />} />
          <Route path="/patient-login" element={<PatientLogin />} />
          <Route path="/pin-verification" element={<PINVerification />} />
          <Route path="/staff-login" element={<StaffLogin />} />
          <Route path="/login-auth" element={<LoginAuth />} />
          <Route path="/register" element={<Register />} />
          <Route path="/staff-register" element={<StaffRegister />} />
          <Route path="/portal" element={<PatientPortal />} />
          <Route path="/vitals" element={<VitalSigns />} />
          <Route path="/vitals/weight" element={<Weight />} />
          <Route path="/vitals/height" element={<Height />} />
          <Route path="/vitals/pulse" element={<Pulse />} />
          <Route path="/vitals/temperature" element={<Temperature />} />
          <Route path="/vitals/bp" element={<BP />} />
          <Route path="/records/:username?" element={<Records />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/staff/patient-records/:patientId?" element={<PatientRecords />} />
          <Route path="/staff/archived-patients" element={<ArchivedPatients />} />
          <Route path="/staff/QueueManagement" element={<QueueManagement />} />
          <Route path="/staff/reports" element={<Reports />} />
        </Routes>
      </main>
      <PrivacyNotice />
    </div>
  )
}