import React from 'react'

export default function RetryButton({ onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-[#6ec1af] px-6 py-3 font-semibold text-[#00674F] hover:bg-[#6ec1af] disabled:cursor-not-allowed"
    >
      Retry
    </button>
  )
}
