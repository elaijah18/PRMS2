// About.jsx
// This component provides information about the Esperanza Health Center.

import React from 'react'
import aboutImage from '../assets/maskgroup.png'

export default function About(){
  return (  
    <section className="page flex flex-col items-center text-center ">
      <div className="mt-8">
       <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
        Esperanza Health Center
        </h2>
      </div>

      <img
        src={aboutImage}
        alt="Esperanza Health Center"
        className="w-60 h-60 object-contain rounded-2xl mt-8 mb-6"
      />
    
      <div className="mt-4 mb-8 max-w-3xl space-y-4 text-lg text-slate-700">
        <p className="mb-10">
          The Esperanza Health Center in Teresa, Sta.Mesa, Manila has long served as a vital community healthcare
          facility, providing essential medical services to residents. It plays a key role in delivering primary care,
          maternal and child health services, immunizations, and health education programs that promote overall well-being.
          Over the years, the center has become a trusted institution for the community, offering accessible and reliable
          healthcare while supporting public health initiatives. Its continued presence reflects the commitment to serving
          the medical needs of the people in Teresa and nearby areas.
        </p>
      </div>
    </section>
  )
}
