export default function Popup({ message, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80 text-center">
        <p className="text-slate-800 font-semibold mb-4">{message}</p>
        <button
          onClick={onClose}
          className="bg-[#6ec1af] hover:bg-emerald-800/70 text-white font-bold px-6 py-2 rounded-xl"
        >
          OK
        </button>
      </div>
    </div>
  )
}
