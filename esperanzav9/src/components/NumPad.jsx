// This component renders a numeric keypad with buttons for digits 0-9, backspace, and enter.
// It accepts an onKeyPress prop, which is a function that gets called with the value of the key pressed.

import React from 'react'
import { MdBackspace, MdKeyboardReturn } from 'react-icons/md'

export default function NumPad({ onKeyPress, onKey }){
  const keys = ['1','2','3','4','5','6','7','8','9','0','⌫','Enter']
  const handler = onKeyPress || onKey
  
  const handleKey = (k) => {
    if (!handler) return
    if (k === '⌫') {
      handler('⌫')
    } else if (k === 'Enter') {
      handler('Enter')
    } else {
      handler(k)
    }
  }
  
  return (
    <div className="grid grid-cols-3 gap-3 w-[18rem] md:w-[21rem] shrink-0">
      {keys.map((k) => (
        <button key={k} 
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleKey(k)}
          className="h-[4.2rem] md:h-[4.8rem] rounded-xl text-[#426F66] border border-slate-200 bg-[#DCEBE8] px-4 text-[30px] font-semibold shadow-sm hover:shadow transition active:scale-[.98] shrink-0">
          {k === '⌫' ? <MdBackspace className="text-[30px] mx-auto" /> : k === 'Enter' ? <MdKeyboardReturn className="text-[30px] mx-auto" /> : k}
        </button>
      ))}
    </div>
  )
}
