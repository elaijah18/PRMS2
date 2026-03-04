// Services.jsx
// This page lists the various medical services offered by the clinic,
// providing descriptions and relevant icons for each service.

import React from 'react'
import abc from '../assets/vectorsyringe.png'
import genmed from '../assets/stethoscope1.png'
import pedia from '../assets/shield2.png'
import dentistry from '../assets/toothoutline.png'
import childImmunization from '../assets/uilkid.png'
import obgyne from '../assets/pregnantwomen.png'

const items = [
  { title: 'General Medicine', icon: genmed,
    desc: 'Provides primary healthcare services, including consultations, diagnosis, treatment, and preventive care.' },
  { title: 'Pediatrics', icon: pedia,
    desc: 'Offers healthcare services focused on the growth, development, and medical needs of infants, children, and adolescents.' },
  { title: 'Dentistry', icon: dentistry,
    desc: 'Offers healthcare services focused on oral health and preventive dental care.' },
  { title: 'Animal Bite Center', icon: abc,
    desc: 'Provides immediate care, vaccination, and treatment for individuals exposed to animal bites to prevent infections and rabies.' },
  { title: 'Obgyne', icon: obgyne,
    desc: 'Provides women’s health services, including prenatal care, maternal check-ups, family planning, and reproductive health support.' },
  { title: 'Child Immunization', icon: childImmunization,
    desc: 'Ensures the protection of children against preventable diseases through safe and timely vaccinations.' },
]

export default function Services() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      
      <div className="text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide bg-gradient-to-r  from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
          MEDICAL SERVICES
        </h2>
      </div>

      {/* Cards */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ title, desc, icon }) => (
          <div
            key={title}
            className="rounded-3xl bg-white/90 backdrop-blur border border-emerald-600 shadow-[0_8px_24px_rgba(16,185,129,.15)] hover:shadow-[0_12px_28px_rgba(15,23,42,.22)] transition-shadow p-6"
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 grid place-items-center h-16 w-16 rounded-2xl bg-emerald-50 border border-emerald-600">
                <img src={icon} alt="" className="h-9 w-9 object-contain opacity-90" />
              </div>

              <h3 className="text-xl font-semibold text-slate-800">{title}</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">
                {desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
