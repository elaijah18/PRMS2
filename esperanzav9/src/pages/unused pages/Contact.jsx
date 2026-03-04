import React from 'react'
import locationIcon from '../assets/mapmarker.png'
import phoneIcon from '../assets/vectorphone.png'
import emailIcon from '../assets/envelope.png'
import hoursIcon from '../assets/uilclock.png'

export default function Contact() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      
      <h2 className="text-3xl md:text-5xl font-extrabold tracking-wide bg-gradient-to-r from-slate-800 via-teal-700 to-emerald-700 bg-clip-text text-transparent">
        Contact Us
      </h2>

      <div className="mt-10 grid md:grid-cols-2 gap-10 items-start">
        
        <div className="space-y-5">
          <div>
            <h3 className="text-2xl font-regular text-slate-900">Esperanza Health Center</h3>
            <p className="text-slate-600">Sta. Mesa, Manila</p>
          </div>

          <div className="flex items-start gap-4">
            <img src={locationIcon} alt="Location" className="h-8 w-8 mt-1" />
            <div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">Location</h4>
              <p className="text-slate-700">
                286 Teresa Street, Old Sta. Mesa, Manila
              </p>
            </div>
          </div>

          
          <div className="flex items-start gap-4">
            <img src={phoneIcon} alt="Phone" className="h-8 w-8 mt-1" />
            <div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">Contact Number</h4>
              <p className="text-slate-700">(02) 8715 7028</p>
            </div>
          </div>

          
          <div className="flex items-start gap-4">
            <img src={emailIcon} alt="Email" className="h-8 w-8 mt-1" />
            <div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">Email</h4>
              <a
                href="mailto:esperanzahc@gmail.com"
                className="text-slate-700 underline"
              >
                esperanzahc@gmail.com
              </a>
            </div>
          </div>

          
          <div className="flex items-start gap-4">
            <img src={hoursIcon} alt="Operating Hours" className="h-7 w-7 mt-1" />
            <div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-teal-700 to-emerald-500 bg-clip-text text-transparent">Operating Hours</h4>
              <p className="text-slate-700">
                Monday - Friday, 6:00 AM - 5:00 PM
              </p>
            </div>
          </div>
        </div>

        
        <div className="rounded-2xl overflow-hidden shadow-lg border border-emerald-200">
          <iframe
            title="Esperanza Health Center Location"
            src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d965.2437413538171!2d121.01286600000002!3d14.600502000000002!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c9ddd732a75d%3A0x833a3e8b650d15e6!2sEsperanza%20Health%20Center%20and%20Lying%20in%20Clinic!5e0!3m2!1sen!2sph!4v1758119475960!5m2!1sen!2sph"
            width="100%"
            height="400"
            style={{ border: 0 }}
            allowFullScreen=""
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>
      </div>
    </section>
  )
}
