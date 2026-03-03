import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  MdBackspace,
  MdKeyboardReturn,
  MdNorth,
  MdLanguage,
  MdKeyboardHide,
} from "react-icons/md";

const LETTER_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "BACKSPACE"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "ENTER2"],
  ["SHIFT1", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "SHIFT2"],
  ["123_1", "GLOBE", "SPACE", "123_2", "KEYBOARD"],
];

const NUMBER_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "BACKSPACE"],
  ["-", "/", ":", ";", "(", ")", "_", "&", "@", "\"", "ENTER2"],
  ["SHIFT1", ".", ",", "?", "!", "'", "SHIFT2"],
  ["ABC", "GLOBE", "SPACE", "123_2", "KEYBOARD"],
];

const PIN_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["0", "BACKSPACE", "ENTER2"],
];

const SPECIAL_LABELS = {
  BACKSPACE: "",
  ENTER2: "",
  SHIFT1: "",
  SHIFT2: "",
  "123_1": "123",
  "123_2": "123",
  ABC: "ABC",
  GLOBE: "",
  SPACE: "",
  KEYBOARD: "",
};

const KEY_FLEX = {
  BACKSPACE: "flex-[1.35]",
  ENTER2: "flex-[1.35]",
  SHIFT1: "flex-[1.2]",
  SHIFT2: "flex-[1.2]",
  SPACE: "flex-[5]",
  KEYBOARD: "flex-[1.4]",
  "123_1": "flex-[1.3]",
  "123_2": "flex-[1.3]",
  ABC: "flex-[1.3]",
  "0": "flex-[2]",
};

function isSpecialKey(key) {
  return [
    "BACKSPACE",
    "ENTER2",
    "SHIFT1",
    "SHIFT2",
    "123_1",
    "123_2",
    "ABC",
    "GLOBE",
    "SPACE",
    "KEYBOARD",
  ].includes(key);
}

function renderKeyContent(key, label) {
  if (key === "BACKSPACE") {
    return (
      <span className="flex flex-col items-center justify-center leading-none">
        <MdBackspace className="text-[18px]" />
      </span>
    );
  }

  if (key === "ENTER2") {
    return (
      <span className="flex flex-col items-center justify-center leading-none">
        <MdKeyboardReturn className="text-[18px]" />
      </span>
    );
  }

  if (key === "SHIFT1" || key === "SHIFT2") {
    return (
      <span className="flex flex-col items-center justify-center leading-none">
        <MdNorth className="text-[18px]" />
      </span>
    );
  }

  if (key === "GLOBE") {
    return (
        <span className="flex flex-col items-center justify-center leading-none">
        <MdLanguage className="text-[22px]" />
        </span>);
  }

  if (key === "KEYBOARD") {
    return (
      <span className="flex flex-col items-center justify-center leading-none">
        <MdKeyboardHide className="text-[18px]" />
      </span>
    );
  }

  if (key === "SPACE") {
    return <span className="flex flex-col text-sm tracking-wide"> </span>;
  }

  return label;
}

export default function Keyboard({ pressedKeys = new Set(), onKeyPress, labels = {}, mode = 'letters' }) {
  const [shiftOn, setShiftOn] = useState(false);
  const [numberMode, setNumberMode] = useState(false);

  const rows = useMemo(() => {
    if (mode === 'pin') return PIN_ROWS;
    return numberMode ? NUMBER_ROWS : LETTER_ROWS;
  }, [numberMode, mode]);

  const resolveLabel = (key) => {
    if (labels[key]) return labels[key];
    if (SPECIAL_LABELS[key] !== undefined) return SPECIAL_LABELS[key];
    return shiftOn ? key.toUpperCase() : key.toLowerCase();
  };

  const emitKey = (key) => {
    if (key === "SHIFT1" || key === "SHIFT2") {
      setShiftOn((prev) => !prev);
      if (onKeyPress) onKeyPress(key);
      return;
    }

    if (key === "123_1" || key === "123_2") {
      setNumberMode(true);
      if (onKeyPress) onKeyPress(key);
      return;
    }

    if (key === "ABC") {
      setNumberMode(false);
      if (onKeyPress) onKeyPress(key);
      return;
    }

    if (/^[A-Z]$/.test(key)) {
      const out = shiftOn ? key.toUpperCase() : key.toLowerCase();
      if (onKeyPress) onKeyPress(out);
      if (shiftOn) setShiftOn(false);
      return;
    }

    // Punctuation and special keys are emitted as-is
    if (onKeyPress) onKeyPress(key);
  };

  const isPressed = (key) => pressedKeys.has(key);

  return (
    <div className="rounded-[16px] bg-white p-1.5 md:p-2 shadow-inner">
      <div className="space-y-1.5">
        {rows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex items-stretch gap-1.5">
            {row.map((key) => {
              const label = resolveLabel(key);
              const special = isSpecialKey(key);
              const flexSize = KEY_FLEX[key] || "flex-1";

              return (
                <button
                  key={`${rowIndex}-${key}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => emitKey(key)}
                  className={clsx(
                    "h-11 md:h-12 min-w-0 rounded-md transition-colors",
                    "font-medium text-[18px] leading-none",
                    flexSize,
                    isPressed(key)
                      ? "bg-[#426f66] text-white"
                      : "bg-[#dcebe8] text-[#426f66] hover:bg-[#cfe3de]",
                    special && "text-sm"
                  )}
                >
                  {renderKeyContent(key, label)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
