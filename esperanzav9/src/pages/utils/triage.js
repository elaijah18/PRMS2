// triage.js

// Parse blood pressure string "120/80" into systolic and diastolic numbers
export function parseBp(bpStr) {
  if (!bpStr || typeof bpStr !== 'string') return { sys: null, dia: null }
  const m = bpStr.match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return { sys: null, dia: null }
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

// Triage vital signs and return structured abnormality results
// Severity tiers mirror backend: 'critical' | 'high' | 'medium'
export function triageAbnormal({ hr, bp, spo2, temp, bmi }) {
  const results = []
  const { sys, dia } = parseBp(bp)

  // Temperature (Normal: 36.0–37.5°C)
  if (typeof temp === 'number') {
    if (temp >= 39.0 || temp <= 35.0)
      results.push({ severity: 'critical', reason: `Temperature CRITICAL: ${temp}°C` })
    else if (temp >= 38.0)
      results.push({ severity: 'high', reason: `Temperature HIGH: ${temp}°C` })
    else if (temp > 37.5 || temp < 36.0)
      results.push({ severity: 'medium', reason: `Temperature elevated/low: ${temp}°C` })
  }

  // Heart Rate (Normal: 60–100 bpm)
  if (typeof hr === 'number') {
    if (hr >= 120 || hr <= 55)
      results.push({ severity: 'critical', reason: `Heart Rate CRITICAL: ${hr} bpm` })
    else if (hr >= 110)
      results.push({ severity: 'high', reason: `Heart Rate HIGH: ${hr} bpm` })
    else if (hr > 100 || hr < 60)
      results.push({ severity: 'medium', reason: `Heart Rate abnormal: ${hr} bpm` })
  }

  // SpO₂ (Normal: 95–100%)
  if (typeof spo2 === 'number') {
    if (spo2 <= 90)
      results.push({ severity: 'critical', reason: `SpO₂ CRITICAL: ${spo2}%` })
    else if (spo2 <= 93)
      results.push({ severity: 'high', reason: `SpO₂ HIGH: ${spo2}%` })
    else if (spo2 < 95)
      results.push({ severity: 'medium', reason: `SpO₂ low: ${spo2}%` })
  }

  // Blood Pressure (Normal: systolic 90–120, diastolic 60–80)
  if (sys != null && dia != null) {
    if (sys >= 180 || sys < 90 || dia >= 120 || dia < 60)
      results.push({ severity: 'critical', reason: `Blood Pressure CRITICAL: ${sys}/${dia}` })
    else if (sys >= 160 || dia >= 100)
      results.push({ severity: 'high', reason: `Blood Pressure HIGH: ${sys}/${dia}` })
    else if (sys > 140 || dia > 90)
      results.push({ severity: 'medium', reason: `Blood Pressure elevated: ${sys}/${dia}` })
  }

  // BMI (Normal: 18.5–24.9)
  if (typeof bmi === 'number') {
    if (bmi < 16.0 || bmi >= 35.0)
      results.push({ severity: 'critical', reason: `BMI CRITICAL: ${bmi}` })
    else if (bmi >= 30.0)
      results.push({ severity: 'high', reason: `BMI HIGH: ${bmi}` })
  }

  return {
    abnormal: results.length > 0,
    reasons: results.map(r => r.reason),   // flat string list for backward compat
    results,                                // full objects for severity-aware UI
    criticalCount: results.filter(r => r.severity === 'critical').length,
    highCount:     results.filter(r => r.severity === 'high').length,
  }
}

// Generate next priority code like "E01", "E02", ..., "E99", cycling
export function nextPriorityCode() {
  const key = 'priorityCounter'
  const raw = Number(sessionStorage.getItem(key) || '0')
  const next = (raw % 99) + 1  // 1..99
  sessionStorage.setItem(key, String(next))
  return `E${String(next).padStart(2, '0')}`
}