"""
Patient Queue Priority System for utils.py
Prioritizes patients based on:
1. Senior citizens (60+)
2. Abnormal vital signs (Temperature, Heart Rate, SpO2, Blood Pressure, BMI)
3. Time of arrival (entered_at)
"""

from datetime import date
from typing import Dict, Tuple

def check_vital_abnormalities(vitals: Dict) -> Tuple[str, list]:
    """
    Check if vital signs are abnormal and return priority level
    
    Returns:
        Tuple of (priority_level, list_of_abnormalities)
        priority_level: 'CRITICAL', 'HIGH', 'MEDIUM', or 'NORMAL'
    """
    abnormalities = []
    critical_count = 0
    high_count = 0
    
    # Temperature (Normal: 36.1°C - 37.2°C)
    if vitals.get('temperature'):
        temp = float(vitals['temperature'])
        if temp >= 39.0 or temp <= 35.0:  # Critical
            abnormalities.append(f"Temperature CRITICAL: {temp}°C")
            critical_count += 1
        elif temp >= 38.0 or temp <= 35.5:  # High
            abnormalities.append(f"Temperature HIGH: {temp}°C")
            high_count += 1
        elif temp > 37.5 or temp < 36.0:  # Medium
            abnormalities.append(f"Temperature elevated/low: {temp}°C")
    
    # Heart Rate/Pulse (Normal: 60-100 bpm)
    if vitals.get('pulse_rate'):
        hr = int(vitals['pulse_rate'])
        if hr >= 120 or hr <= 50:  # Critical
            abnormalities.append(f"Heart Rate CRITICAL: {hr} bpm")
            critical_count += 1
        elif hr >= 110 or hr <= 55:  # High
            abnormalities.append(f"Heart Rate HIGH: {hr} bpm")
            high_count += 1
        elif hr > 100 or hr < 60:  # Medium
            abnormalities.append(f"Heart Rate abnormal: {hr} bpm")
    
    # Oxygen Saturation (Normal: 95-100%)
    if vitals.get('oxygen_saturation'):
        spo2 = int(vitals['oxygen_saturation'])
        if spo2 <= 90:  # Critical
            abnormalities.append(f"SpO2 CRITICAL: {spo2}%")
            critical_count += 1
        elif spo2 <= 93:  # High
            abnormalities.append(f"SpO2 HIGH: {spo2}%")
            high_count += 1
        elif spo2 < 95:  # Medium
            abnormalities.append(f"SpO2 low: {spo2}%")
    
    # Blood Pressure (Normal: Systolic 90-120, Diastolic 60-80)
    if vitals.get('blood_pressure'):
        bp = vitals['blood_pressure']
        if '/' in str(bp):
            systolic, diastolic = map(int, str(bp).split('/'))
            
            # Critical
            if systolic >= 180 or systolic < 90 or diastolic >= 120 or diastolic < 60:
                abnormalities.append(f"Blood Pressure CRITICAL: {bp}")
                critical_count += 1
            # High
            elif systolic >= 160 or diastolic >= 100:
                abnormalities.append(f"Blood Pressure HIGH: {bp}")
                high_count += 1
            # Medium
            elif systolic > 140 or diastolic > 90:
                abnormalities.append(f"Blood Pressure elevated: {bp}")
    
    # BMI (Normal: 18.5-24.9)
    if vitals.get('bmi'):
        bmi = float(vitals['bmi'])
        if bmi < 16.0 or bmi >= 35.0:  # Critical
            abnormalities.append(f"BMI CRITICAL: {bmi}")
            critical_count += 1
        elif bmi < 17.0 or bmi >= 30.0:  # High
            abnormalities.append(f"BMI HIGH: {bmi}")
            high_count += 1
    
    # Determine overall priority
    if critical_count > 0:
        return 'CRITICAL', abnormalities
    elif high_count > 0:
        return 'HIGH', abnormalities
    elif abnormalities:
        return 'MEDIUM', abnormalities
    else:
        return 'NORMAL', []


def compute_patient_priority(patient) -> str:
    """
    Main function to compute patient priority
    
    Priority Levels (from highest to lowest):
    1. CRITICAL - Critical vital signs OR Senior (60+) with abnormal vitals
    2. HIGH - High-risk vital signs OR Senior (60+) with normal vitals
    3. MEDIUM - Medium-risk vital signs OR abnormalities detected
    4. NORMAL - No abnormalities, not senior
    
    Args:
        patient: Patient object with vital_signs relationship
    
    Returns:
        str: Priority level ('CRITICAL', 'HIGH', 'MEDIUM', 'NORMAL')
    """
    
    # Check if patient is senior (uses existing is_senior() method from Patient model)
    is_senior = patient.is_senior() if hasattr(patient, 'is_senior') else False
    
    # Get latest vital signs
    latest_vital = patient.vital_signs.order_by('-date_time_recorded').first()
    
    if not latest_vital:
        # No vitals recorded
        if is_senior:
            return 'HIGH'  # Senior without vitals = HIGH priority
        return 'NORMAL'
    
    # Prepare vitals dictionary
    vitals_data = {
        'temperature': latest_vital.temperature,
        'pulse_rate': latest_vital.pulse_rate,
        'oxygen_saturation': latest_vital.oxygen_saturation,
        'blood_pressure': latest_vital.blood_pressure,
        'bmi': latest_vital.bmi if hasattr(latest_vital, 'bmi') else None
    }
    
    # Calculate BMI if not stored
    if not vitals_data['bmi'] and latest_vital.height and latest_vital.weight:
        height_m = latest_vital.height / 100
        vitals_data['bmi'] = round(latest_vital.weight / (height_m * height_m), 1)
    
    # Check vital abnormalities
    vital_priority, abnormalities = check_vital_abnormalities(vitals_data)
    
    # Priority matrix
    if vital_priority == 'CRITICAL':
        return 'CRITICAL'
    
    if is_senior:
        if vital_priority in ['HIGH', 'MEDIUM']:
            return 'CRITICAL'  # Senior + abnormal vitals = CRITICAL
        else:
            return 'HIGH'  # Senior + normal vitals = HIGH
    
    # Non-senior priority based on vitals only
    return vital_priority


# Helper function for backward compatibility
def is_abnormal_vital(vital_type, value):
    """
    Legacy function - kept for backward compatibility
    Check if a vital is abnormal using standard adult thresholds.
    """
    if value is None:
        return False
    
    if vital_type == 'pulse_rate':
        return value < 50 or value > 110
    elif vital_type == 'temperature':
        return value < 35.5 or value > 38.5
    elif vital_type == 'oxygen_saturation':
        return value < 92
    elif vital_type == 'blood_pressure':
        return False  # Handled by check_vital_abnormalities
    return False