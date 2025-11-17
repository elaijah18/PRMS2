// This file sets up the main application structure with routing and a consistent layout.

import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Services from './pages/Services'
import About from './pages/About'
import Contact from './pages/Contact'
import Login from './pages/Login'
import Register from './pages/Register'
import PatientPortal from './pages/PatientPortal'
import VitalSigns from './pages/VitalSigns'
import Weight from './pages/vitals/Weight'
import Height from './pages/vitals/Height'
import Pulse from './pages/vitals/Pulse'
import Temperature from './pages/vitals/Temperature'
import BP from "./pages/vitals/BP";
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

export default function App() {
  return (
    <div style={{ backgroundImage: `url(${bgImage})` }} className="min-h-screen bg-cover bg-fixed bg-center scale-110x">
      <Navbar />
      <main className="min-h-[calc(100vh-4rem)] bg-white/70">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsofService />} />
          <Route path="/services" element={<Services />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/patient-login" element={<PatientLogin />} /> 
          <Route path="/login-auth" element={<LoginAuth />} />       
          <Route path="/register" element={<Register />} />
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
          <Route path="/staff/QueueManagement" element={<QueueManagement />} />
          <Route path="/staff/reports" element={<Reports />} />
        </Routes>
      </main>
      <PrivacyNotice />
    </div>
  )
}
