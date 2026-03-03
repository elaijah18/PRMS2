// Home.jsx
// The home page of the healthcare clinic website, featuring a hero section and a carousel of images.

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import homeImage from '../assets/personnel.png'
import img1 from '../assets/image1.png'
import img2 from '../assets/image2.png'
import img3 from '../assets/image3.png'

export default function Home() {
  // carousel of pics
  const panels = [img1, img2, img3]
  const [active, setActive] = useState(0)
  const order = [(active + 2) % 3, active, (active + 1) % 3]

  return (
    <section className="relative">
      <div className="absolute inset-0 -z-10 bg-mesh" />

      
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
              ESPERANZA HEALTH CENTER
            </h1>
            <p className="mt-4 text-slate-600 max-w-prose">
              Your trusted partner in health and wellness. We are committed to providing compassionate, patient-centered care
              for individuals and families.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="px-5 py-3 rounded-lg font-semibold text-white bg-[#6ec1af] hover:bg-emerald-800/70 transition" to="/register">Register</Link>
              <Link className="btn-outline outline-[#6ec1af]" to="/login">Login</Link>
            </div>
          </div>
          
          <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden">
            <img src={homeImage} alt="Clinic showcase" className="h-full w-full object-contain" />
          </div>
        </div>
      </div>

      {/* Three-picture panel */}
      <div className="mx-auto max-w-6xl px-4 pb-16">
        {/* Navigation dots */}
        <div className="flex justify-center gap-3 mb-8">
          {panels.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Show panel ${i + 1}`}
              className={`h-3.5 w-3.5 rounded-full transition
                ${active === i ? 'bg-[#6ec1af]' : 'bg-slate-300 hover:bg-slate-400'}`}
            />
          ))}
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {order.map((idx, col) => {
            const isCenter = idx === active
            return (
              <div
                key={idx}
                onClick={() => setActive(idx)}
                className={`rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ease-in-out
                  ${isCenter
                    ? 'scale-105 border-2 border-emerald-300 shadow-2xl z-10'
                    : 'scale-90 border border-slate-300 shadow-md opacity-90 hover:scale-95'}
                `}
              >
                <img src={panels[idx]} alt={`Service ${idx + 1}`}
                     className="w-full h-60 object-cover" />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
