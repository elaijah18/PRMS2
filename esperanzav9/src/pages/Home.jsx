// Home.jsx
// The home page of the healthcare clinic website, featuring a hero section and a carousel of images.

import { Link } from 'react-router-dom'
import homeImage from '../assets/personnel.png'

export default function Home() {
  return (
    <section className="relative">
      <div className="absolute inset-0 -z-10 bg-mesh" />
      <div className="mx-auto max-w-6xl px-4 py-24 md:py-32">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="mt-2 text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
              ESPERANZA HEALTH CENTER
            </h1>
            <p className="mt-4 text-lg text-slate-600 max-w-prose">
              Your trusted partner in health and wellness. We are committed to providing compassionate, patient-centered care
              for individuals and families.
            </p>
            <div className="mt-8 text-2xl flex flex-wrap gap-3">
              <Link className="px-8 py-4 rounded-lg font-semibold text-white bg-[#6ec1af] hover:bg-emerald-800/70 transition" to="/register">Register</Link>
              <Link className="px-8 py-4 btn-outline outline-[#6ec1af] text-[#426F66]/85" to="/login">Login</Link>
            </div>
          </div>
          
          <div className="relative h-80 md:h-96 rounded-2xl overflow-hidden">
            <img src={homeImage} alt="Clinic showcase" className="h-full w-full object-contain" />
          </div>
        </div>
      </div>
    </section>
  )
}
