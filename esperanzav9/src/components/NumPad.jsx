// This component renders a numeric keypad with buttons for digits 0-9, backspace, and enter.
// It accepts an onKeyPress prop, which is a function that gets called with the value of the key pressed.

import React from 'react'
import { MdBackspace } from 'react-icons/md'

export default function NumPad({ onKeyPress, onKey }){
  const keys = ['1','2','3','4','5','6','7','8','9','0','⌫','Enter']
  const handler = onKeyPress || onKey
  
  const handleKey = (k) => {
    if (!handler) return
    if (k === '⌫') {
      handler('BACKSPACE')
    } else if (k === 'Enter') {
      handler('ENTER')
    } else {
      handler(k)
    }
  }
  
  return (
    <div className="grid grid-cols-3 gap-2 w-64">
      {keys.map((k) => (
        <button key={k} 
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey(k)}
          className="rounded-xl text-[#426F66] border border-slate-200 bg-[#DCEBE8] px-4 py-3 text-lg font-semibold shadow-sm hover:shadow transition active:scale-[.98]">
          {k === '⌫' ? <MdBackspace className="text-xl mx-auto" /> : k}
        </button>
      ))}
    </div>
  )
}
