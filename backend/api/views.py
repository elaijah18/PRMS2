import base64
from django.shortcuts import render  # Unused but kept if needed elsewhere
from rest_framework import viewsets, status
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from .models import Patient, VitalSigns, HCStaff, QueueEntry, ArchivedPatient, ArchivedVitalSigns, ArchivedQueueEntry
from .models import archive_patient, restore_patient
from .serializers import PatientSerializer, VitalSignsSerializer, QueueEntrySerializer, HCStaffSerializer
from django.db.models import Q, Case, When, IntegerField, Max  
from django.utils import timezone  
from .utils import compute_patient_priority
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from django.contrib.auth.hashers import check_password
from django.http import HttpResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from io import BytesIO
import serial, json, time, threading
import atexit
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.http import JsonResponse
import time
import threading
from django.db import transaction, close_old_connections

_serial_connection = None
_serial_lock = threading.RLock()  # <-- Upgraded to RLock (Re-entrant)
_serial_busy = threading.Event()
_enrollment_active = threading.Event()

_btn_next_event = threading.Event()

scan_start_times = {
    "patient": None,
    "staff": None
}
SCAN_TIMEOUT = 20
# Add these near your other locks
_pending_ui_advance = False
_ui_advance_lock = threading.Lock()                                 
SERIAL_PORT = '/dev/ttyUSB0'                                                                 
BAUD_RATE = 115200
IS_SCANNING = False 


_display_connection = None
_display_lock = threading.RLock() # <-- Upgraded to RLock
_serial_busy = threading.Event()
_enrollment_active = threading.Event()
_btn_next_event = threading.Event()

def _claim_serial():
    """Mark serial port as busy."""
    _serial_busy.set()

def _release_serial():
    """Release serial port."""
    _serial_busy.clear()
    
@api_view(['POST'])
def measure_pulse(request):
    """
    Sends PULSE to Arduino to start MAX30100 streaming.
    Returns immediately — frontend polls /live_pulse/ for live updates,
    then calls /get_pulse_final/ when the patient is ready.
    """
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=500)

    try:
        _claim_serial()
        with _serial_lock:
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            ser.write(b'PULSE\n')
            ser.flush()

        # Clear stale cached values so live_pulse starts fresh
        latest_vitals['heart_rate'] = None
        latest_vitals['spo2']       = None

        return Response({"status": "started", "message": "MAX30100 started."})

    except Exception as e:
        _release_serial()
        import traceback
        traceback.print_exc()
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def live_pulse(request):
    """
    Reads Arduino's streaming text logs from the MAX30100.
    Arduino prints every second: "Heart rate:75bpm / SpO2:98%"
    Frontend polls this every 1s to show live values.
    """
    ser = get_serial()
    if ser is None:
        return Response({"status": "waiting", "heart_rate": None, "spo2": None}, status=204)

    try:
        with _serial_lock:
            lines_read = 0
            while ser.in_waiting > 0 and lines_read < 10:
                raw  = ser.readline()
                line = raw.decode(errors='ignore').strip()
                lines_read += 1

                if not line:
                    continue

                print(f"[live_pulse] Arduino → {repr(line)}")

                # Arduino streams: "Heart rate:75bpm / SpO2:98%"
                if 'Heart rate:' in line and 'SpO2:' in line:
                    try:
                        hr_part   = line.split('Heart rate:')[1].split('bpm')[0].strip()
                        spo2_part = line.split('SpO2:')[1].split('%')[0].strip()

                        hr   = float(hr_part)
                        spo2 = float(spo2_part)

                        if hr > 0 and spo2 > 0:
                            latest_vitals['heart_rate'] = hr
                            latest_vitals['spo2']       = spo2
                            return Response({
                                "heart_rate": hr,
                                "spo2":       spo2,
                                "raw":        line,
                            })
                    except (ValueError, IndexError) as parse_err:
                        print(f"[live_pulse] parse error: {parse_err} | line: {repr(line)}")
                        continue

        # Nothing useful in buffer yet — tell frontend to keep polling
        return Response({"status": "waiting", "heart_rate": None, "spo2": None}, status=204)

    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(['POST'])
def get_pulse_final(request):
    """
    Sends GET to Arduino → returns final {"heart_rate", "oxygen_saturation"},
    shuts down MAX30100, and releases the serial claim.
    """
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=500)

    try:
        with _serial_lock:
            ser.reset_input_buffer()
            ser.write(b'GET\n')
            ser.flush()

        deadline = time.time() + 10

        while time.time() < deadline:
            try:
                with _serial_lock:
                    ser.timeout = 2
                    raw = ser.readline()
            except Exception:
                time.sleep(0.1)
                continue

            line = raw.decode(errors='ignore').strip()
            if not line:
                continue

            print(f"[get_pulse_final] Arduino → {repr(line)}")

            if line.startswith('{'):
                try:
                    parsed = json.loads(line)

                    if 'error' in parsed:
                        return Response({"error": parsed['error']}, status=400)

                    hr   = parsed.get('heart_rate')
                    spo2 = parsed.get('oxygen_saturation')

                    if hr is not None and spo2 is not None:
                        latest_vitals['heart_rate'] = hr
                        latest_vitals['spo2']       = spo2
                        return Response({
                            "heart_rate":        hr,
                            "oxygen_saturation": spo2,
                        })

                except json.JSONDecodeError:
                    pass

        return Response(
            {"error": "Timeout — Arduino did not respond to GET within 10s."},
            status=500,
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": str(e)}, status=500)

    finally:
        _release_serial()  # always release after GET, success or timeout

@api_view(['POST'])
def tare_weight(request):
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=500)

    try:
        with _serial_lock:
            ser.reset_input_buffer()
            ser.write(b'TARE\n')
            ser.flush()

        # tareNoDelay on Arduino takes ~2s to complete internally
        time.sleep(5.5)

        return Response({"status": "tared", "message": "Scale zeroed successfully"})

    except Exception as e:
        return Response({"error": str(e)}, status=500)
    
def get_serial(serial_port=SERIAL_PORT):
    """Get (or re-open) persistent serial connection."""
    global _serial_connection

    with _serial_lock:
        target_port = serial_port or SERIAL_PORT

        if _serial_connection and _serial_connection.is_open:
            current_port = getattr(_serial_connection, 'port', None)
            if current_port != target_port:
                try:
                    _serial_connection.close()
                except Exception:
                    pass
                _serial_connection = None

        if _serial_connection is None or not _serial_connection.is_open:
            try:
                _serial_connection = serial.Serial(
                    target_port,
                    BAUD_RATE,
                    timeout=1          # 1-second per readline — loop handles total timeout
                )
                time.sleep(2)          # wait for Arduino boot / reset
                print(f"Serial connected to {target_port} @ {BAUD_RATE} baud")
            except Exception as e:
                print(f"Serial open error: {e}")
                _serial_connection = None
                return None
        return _serial_connection

# Clean up on exit
def cleanup_serial():
    global _serial_connection
    if _serial_connection and _serial_connection.is_open:
        _serial_connection.close()
        
atexit.register(cleanup_serial)

# views.py - Replace your existing get_next_fingerprint_id()

def get_next_fingerprint_id():
    """Get the next available fingerprint ID (1-127) for BOTH patients and staff"""
    # Get all used fingerprint IDs from BOTH models
    patient_ids = set(Patient.objects.filter(
        fingerprint_id__isnull=False
    ).exclude(fingerprint_id='').values_list('fingerprint_id', flat=True))
    
    staff_ids = set(HCStaff.objects.filter(
        fingerprint_id__isnull=False
    ).exclude(fingerprint_id='').values_list('fingerprint_id', flat=True))
    
    # Combine used IDs
    used_ids = patient_ids | staff_ids  # Union of both sets
    
    # Find first available ID
    for i in range(1, 999):
        if str(i) not in used_ids:
            return str(i)
    
    return None  # All IDs are used

@api_view(['POST'])
def start_fingerprint_scan(request):
    global IS_SCANNING
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=503)
    try:
        with _serial_lock:
            if IS_SCANNING:
                return Response({"status": "scanning", "message": "Already scanning"})
            ser.reset_input_buffer()
            ser.write(b"SCAN\n")
            ser.flush()
            IS_SCANNING = True
            _claim_serial()   # ← add this
        return Response({"status": "scanning", "message": "Place finger on sensor"})
    except Exception as e:
        return Response({"error": str(e)}, status=503)

@api_view(['GET'])
def check_fingerprint_match(request):
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=503)
    
    try:
        with _serial_lock:
            # Non-blocking read
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                if line:
                    try:
                        data = json.loads(line)
                        
                        if data.get('status') == 'match':
                            fingerprint_id = str(data.get('id'))
                            
                            try:
                                patient = Patient.objects.get(fingerprint_id=fingerprint_id)
                                
                                # Auto-login
                                request.session['user_type'] = 'patient'
                                request.session['patient_id'] = patient.patient_id
                                patient.last_visit = timezone.now()
                                patient.save()
                                
                                return Response({
                                    "status": "success",
                                    "patient_id": patient.patient_id,
                                    "name": f"{patient.first_name} {patient.last_name}",
                                    "confidence": data.get('confidence', 0)
                                })
                                
                            except Patient.DoesNotExist:
                                return Response({
                                    "status": "error",
                                    "message": f"Fingerprint not registered"
                                })
                        
                        return Response(data)
                        
                    except json.JSONDecodeError:
                        return Response({"status": "scanning", "message": line})
            
            return Response({"status": "scanning", "message": "Waiting..."})
             
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
def stop_fingerprint_scan(request):
    global IS_SCANNING
    ser = get_serial()

    # Always drop scanning state and release serial
    IS_SCANNING = False
    _release_serial()

    if ser:
        try:
            with _serial_lock:
                ser.write(b"STOP\n")
                ser.flush()
        except Exception as e:
            pass

    return Response({"status": "stopped"})
# Add this new Event specifically for enrollment — stronger than _serial_busy
@api_view(['POST'])
def start_fingerprint_enrollment(request):
    patient_id = request.data.get('patient_id')

    if not patient_id:
        return Response({"error": "patient_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        patient = Patient.objects.get(patient_id=patient_id)

        if patient.fingerprint_id:
            return Response(
                {"error": f"Patient already has fingerprint ID {patient.fingerprint_id}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        fingerprint_id = get_next_fingerprint_id()
        if not fingerprint_id:
            return Response({"error": "No available fingerprint slots"}, status=status.HTTP_507_INSUFFICIENT_STORAGE)

        ser = get_serial()
        if ser is None:
            return Response({"error": "Arduino connection error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        _claim_serial()
        _enrollment_active.set()  # ← STOP the monitor thread from reading

        try:
            with _serial_lock:
                ser.reset_input_buffer()
                ser.write(f"E:{fingerprint_id}\n".encode())
                ser.flush()

            return Response({
                "status": "started",
                "fingerprint_id": fingerprint_id,
                "patient_id": patient_id,
                "message": "Enrollment started"
            })

        except Exception as e:
            _enrollment_active.clear()
            _release_serial()
            return Response({"error": f"Communication error: {str(e)}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def check_enrollment_status(request):
    fingerprint_id = request.query_params.get('fingerprint_id')
    patient_id = request.query_params.get('patient_id')

    if not fingerprint_id or not patient_id:
        return Response({"error": "fingerprint_id and patient_id are required"}, status=status.HTTP_400_BAD_REQUEST)

    ser = get_serial()
    if ser is None:
        _enrollment_active.clear()
        _release_serial()
        return Response({"error": "Arduino connection error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        with _serial_lock:
            last_data = None
            time.sleep(0.05)

            while ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                    last_data = parsed
                    
                    if parsed.get('status') in ('enrolled', 'error', 'cancelled'):
                        break
                except json.JSONDecodeError:
                    continue        

            if last_data is None:
                return Response({"status": "waiting", "message": "No update from sensor"})

            data = last_data

            if data.get('status') == 'enrolled':
                try:
                    patient = Patient.objects.get(patient_id=patient_id)
                    patient.fingerprint_id = fingerprint_id
                    patient.save()
                except Patient.DoesNotExist:
                    pass
                _enrollment_active.clear()  
                _release_serial()
                return Response({
                    "status": "enrolled",
                    "fingerprint_id": fingerprint_id,
                    "message": "Fingerprint enrolled and saved"
                })

            if data.get('status') in ('error', 'cancelled'):
                _enrollment_active.clear()  
                _release_serial()
                return Response(data)

            return Response(data) 

    except Exception as e:
        _enrollment_active.clear()
        _release_serial()
        return Response({"error": f"Error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
# Do the same for staff enrollment
@api_view(['POST'])
def start_staff_fingerprint_enrollment(request):
    staff_id = request.data.get('staff_id')

    if not staff_id:
        return Response({"error": "staff_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        staff = HCStaff.objects.get(staff_id=staff_id)

        if staff.fingerprint_id:
            return Response(
                {"error": f"Staff member already has fingerprint ID {staff.fingerprint_id}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        fingerprint_id = get_next_fingerprint_id()
        if not fingerprint_id:
            return Response({"error": "No available fingerprint slots."}, status=status.HTTP_507_INSUFFICIENT_STORAGE)

        ser = get_serial()
        if ser is None:
            return Response({"error": "Arduino fingerprint sensor connection error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        _claim_serial()
        _enrollment_active.set()  # ← STOP the monitor thread

        try:
            with _serial_lock:
                ser.reset_input_buffer()
                ser.write(f"E:{fingerprint_id}\n".encode())
                ser.flush()

            return Response({
                "status": "started",
                "fingerprint_id": fingerprint_id,
                "staff_id": staff_id,
                "message": "Staff enrollment started"
            })

        except Exception as e:
            _enrollment_active.clear()
            _release_serial()
            return Response({"error": f"Communication error: {str(e)}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    except HCStaff.DoesNotExist:
        return Response({"error": "Staff member not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def check_staff_enrollment_status(request):
    fingerprint_id = request.query_params.get('fingerprint_id')
    staff_id = request.query_params.get('staff_id')

    if not fingerprint_id or not staff_id:
        return Response({"error": "fingerprint_id and staff_id are required"}, status=status.HTTP_400_BAD_REQUEST)

    ser = get_serial()
    if ser is None:
        _enrollment_active.clear()
        _release_serial()
        return Response({"error": "Fingerprint sensor connection error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        with _serial_lock:
            last_data = None
            time.sleep(0.05)

            while ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)

                    last_data = parsed
                    if parsed.get('status') in ('enrolled', 'error', 'cancelled'):
                        break
                except json.JSONDecodeError:
                    continue

            if last_data is None:
                return Response({"status": "waiting", "message": "Waiting for fingerprint sensor..."})

            data = last_data

            if data.get('status') == 'enrolled':
                try:
                    staff = HCStaff.objects.get(staff_id=staff_id)
                    staff.fingerprint_id = fingerprint_id
                    staff.save()
                except HCStaff.DoesNotExist:
                    pass
                _enrollment_active.clear()  
                _release_serial()
                return Response({
                    "status": "enrolled",
                    "fingerprint_id": fingerprint_id,
                    "message": "Staff fingerprint enrolled successfully"
                })

            if data.get('status') in ('error', 'cancelled'):
                _enrollment_active.clear()  
                _release_serial()
                return Response(data)

            return Response(data)

    except Exception as e:
        _enrollment_active.clear()
        _release_serial()
        return Response({"error": f"Error reading enrollment status: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
@api_view(['DELETE'])
def delete_fingerprint(request, patient_id):
    """
    Delete a patient's fingerprint from both database and sensor
    """
    try:
        patient = Patient.objects.get(patient_id=patient_id)
        
        if not patient.fingerprint_id:
            return Response(
                {"error": "Patient has no fingerprint enrolled"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        fingerprint_id = patient.fingerprint_id
        
        # Delete from sensor
        try:
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
                time.sleep(2)
                
                command = f"DELETE:{fingerprint_id}\n"
                ser.write(command.encode())
                
                time.sleep(1)
                if ser.in_waiting:
                    response = ser.readline().decode('utf-8').strip()
                    print(f"Arduino response: {response}")
        
        except serial.SerialException as e:
            print(f"Warning: Could not delete from sensor: {e}")
        
        # Delete from database
        patient.fingerprint_id = None
        patient.save()
        
        return Response({
            "message": f"Fingerprint {fingerprint_id} deleted successfully",
            "patient_id": patient_id
        })
        
    except Patient.DoesNotExist:
        return Response(
            {"error": "Patient not found"}, 
            status=status.HTTP_404_NOT_FOUND
        )

latest_vitals = {
    "temperature": None,
    "heart_rate": None,
    "spo2": None,
    "height": None,
    "weight": None
}


@api_view(['POST'])
def cancel_vitals(request):
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=500)
    try:
        with _serial_lock:
            ser.write(b'FLUSH\n')
            ser.flush()
        time.sleep(2)  # give Arduino time to abort ← increase from 0.5
        with _serial_lock:
            ser.reset_input_buffer()
            ser.reset_output_buffer()
        return Response({"status": "flushed"})
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
def start_vitals(request):
    import traceback

    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=500)

    try:
        print("📡 Sending START command...")

        with _serial_lock:
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            ser.write(b'start\n')
            ser.flush()

        # Let Arduino process the command, then flush anything that drifted in
        time.sleep(1)
        with _serial_lock:
            ser.reset_input_buffer()

        print("⏳ Waiting for Arduino JSON response (60s cycle)...")

        VITAL_KEYS = {"temperature", "heart_rate", "spo2", "height", "weight"}
        deadline   = time.time() + 75
        data       = None

        while time.time() < deadline:
            try:
                with _serial_lock:
                    ser.timeout = 2
                    raw = ser.readline()
            except Exception as read_err:
                print(f"readline error: {read_err}")
                time.sleep(0.1)
                continue

            line = raw.decode(errors='ignore').strip()

            if not line:
                time.sleep(0.05)
                continue

            print(f"Arduino → {repr(line)}")

            if line.startswith('{'):
                try:
                    parsed = json.loads(line)

                    if 'debug' in parsed:
                        print(f"[DEBUG] {parsed}")
                        continue

                    if VITAL_KEYS & set(parsed.keys()):
                        if parsed.get('heart_rate', 0) == 0 and parsed.get('spo2', 0) == 0:
                            print(f"⚠️ Skipping zero vitals (stale): {parsed}")
                            continue

                        data = parsed
                        break

                except json.JSONDecodeError as je:
                    print(f"JSON error: {je} | raw: {repr(line)}")

        if data is None:
            return Response(
                {"error": "Timeout — no vitals JSON from Arduino after 75s."},
                status=500,
            )

        latest_vitals.update({
            "temperature": data.get("temperature"),
            "heart_rate":  data.get("heart_rate"),
            "spo2":        data.get("spo2"),
            "height":      data.get("height"),
            "weight":      data.get("weight"),
        })

        print("✅ Vitals received:", latest_vitals)
        return Response(latest_vitals)

    except Exception as e:
        traceback.print_exc()
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def fetch_heart_rate(request):
    """Fetch latest heart rate from Arduino"""
    ser = get_serial()
    if ser is None:
        return Response({"error": "Connection error"}, status=500)
    
    try:
        with _serial_lock:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    try:
                        data = json.loads(line)
                        heart_rate = data.get("heart_rate")
                        if heart_rate is not None:
                            latest_vitals["heart_rate"] = int(heart_rate)
                            print(f"Heart Rate: {heart_rate} bpm")
                            return Response({"heart_rate": heart_rate})
                    except json.JSONDecodeError:
                        pass
            
            return Response({"error": "No data available"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def fetch_spo2(request):
    """Fetch latest oxygen saturation from Arduino"""
    ser = get_serial()
    if ser is None:
        return Response({"error": "Connection error"}, status=500)
    
    try:
        with _serial_lock:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    try:
                        data = json.loads(line)
                        spo2 = data.get("spo2")
                        if spo2 is not None:
                            latest_vitals["spo2"] = int(spo2)
                            print(f"SpO2: {spo2}%")
                            return Response({"spo2": spo2})
                    except json.JSONDecodeError:
                        pass
            
            return Response({"error": "No data available"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

               

@api_view(['GET'])
def fetch_height(request):
    """Fetch latest height from Arduino"""
    ser = get_serial()
    if ser is None:
        return Response({"error": "Connection error"}, status=500)
    
    try:
        with _serial_lock:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    try:
                        data = json.loads(line)
                        height = data.get("height")
                        if height is not None:
                            latest_vitals["height"] = int(height)
                            print(f"Height: {height} cm")
                            return Response({"height": height})
                    except json.JSONDecodeError:
                        pass
            
            return Response({"error": "No data available"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['GET'])
def fetch_weight(request):
    """Fetch latest weight from Arduino"""
    ser = get_serial()
    if ser is None:
        return Response({"error": "Connection error"}, status=500)
    
    try:
        with _serial_lock:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    try:
                        data = json.loads(line)
                        weight = data.get("weight")
                        if weight is not None:
                            latest_vitals["weight"] = float(weight)
                            print(f"⚖️ Weight: {weight} kg")
                            return Response({"weight": weight})
                    except json.JSONDecodeError:
                        pass
            
            return Response({"error": "No data available"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

class PatientViewSet(viewsets.ModelViewSet):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [AllowAny] 
    
    @action(detail=False, methods=['get'])
    def by_pin(self, request):
        pin = request.query_params.get('pin')   
        if not pin:
            return Response({"error": "PIN is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            patient = Patient.objects.get(pin=pin)  # Fetch patient by PIN
            serializer = self.get_serializer(patient)  # Serialize the patient data
            return Response(serializer.data)  # Return serialized data
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)
        
    def get_queryset(self): 
        queryset = Patient.objects.all()

        # General search filter
        if self.request.query_params.get('search'):
            search_term = self.request.query_params.get('search')
            queryset = queryset.filter(
                Q(first_name__icontains=search_term) | 
                Q(last_name__icontains=search_term) | 
                Q(address__icontains=search_term) | 
                Q(patient_id__icontains=search_term) 
            )
        return queryset

class StaffViewSet(viewsets.ModelViewSet):
    queryset = HCStaff.objects.all()
    serializer_class = HCStaffSerializer
    permission_classes = [AllowAny] 
         
class VitalSignsViewSet(viewsets.ModelViewSet):
    queryset = VitalSigns.objects.all()
    serializer_class = VitalSignsSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):  # Filtering vital signs by patient_id and date range
        queryset = VitalSigns.objects.all()
        
        # Filter by patient_id
        patient_id = self.request.query_params.get('patient_id')
        if patient_id:
            queryset = queryset.filter(patient__patient_id=patient_id)
        
        # Filter by date range (fixed: use date_time_recorded)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(date_time_recorded__gte=date_from)
        if date_to:
            queryset = queryset.filter(date_time_recorded__lte=date_to)
            
        return queryset.select_related('patient').order_by('-date_time_recorded')  # Fixed: correct field
    
    @action(detail=False, methods=['get'])  # Simplified: Use query params
    def by_patient(self, request):
        patient_id = request.query_params.get('patient_id')  # GET /vitals/by_patient/?patient_id=ABC
        if not patient_id:
            return Response({"error": "patient_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        vitals = VitalSigns.objects.filter(patient__patient_id=patient_id)
        serializer = self.get_serializer(vitals, many=True)
        return Response(serializer.data)

@api_view(['PUT'])
def update_vitals(request, id):
    """
    Update the vitals for a given patient_id.
    """
    try:
        patient = Patient.objects.get(patient_id=id)
        vitals_instance = VitalSigns.objects.get(patient=patient)
    except VitalSigns.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = VitalSignsSerializer(vitals_instance, data=request.data, partial=True)  # partial=True allows updating some fields
    # serializer = VitalSignsSerializer(vitals_instance)
    if serializer.is_valid():
        serializer.save()
        return Response({"message": "Vitals updated successfully", "data": serializer.data}, status=status.HTTP_200_OK)
    else:
        return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    

@api_view(['POST'])
def receive_vital_signs(request):
    data = request.data
    patient_id = data.get('patient_id')
    vital_id   = data.get('id')  # None on first step, set on subsequent steps

    if not patient_id:
        return Response({"error": "Missing patient_id"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        patient = Patient.objects.get(patient_id=patient_id)
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)

    # Try to find the existing row for this session
    vital_signs = None
    if vital_id:
        vital_signs = VitalSigns.objects.filter(
            vitals_id=vital_id, patient=patient
        ).first()

    # First step of this session — always create a brand new row
    if vital_signs is None:
        vital_signs = VitalSigns.objects.create(patient=patient)

    field_map = {
        'heart_rate':        'heart_rate',
        'temperature':       'temperature',
        'spo2':              'oxygen_saturation',
        'oxygen_saturation': 'oxygen_saturation',
        'weight':            'weight',
        'height':            'height',
        'blood_pressure':    'blood_pressure',
    }

    for frontend_key, model_field in field_map.items():
        if frontend_key in data and data[frontend_key] is not None:
            setattr(vital_signs, model_field, data[frontend_key])

    vital_signs.save()

    # Only queue the patient once ALL 6 fields are present on this row
    all_vitals_complete = all([
        vital_signs.blood_pressure    is not None,
        vital_signs.heart_rate        is not None,
        vital_signs.temperature       is not None,
        vital_signs.oxygen_saturation is not None,
        vital_signs.weight            is not None,
        vital_signs.height            is not None,
    ])

    if all_vitals_complete:
        today = timezone.now().date()
        existing_queue = QueueEntry.objects.filter(
            patient=patient,
            entered_at__date=today,
            status__in=['WAITING', 'SERVING']
        ).first()

        if not existing_queue:
            priority = compute_patient_priority(patient)
            new_entry = QueueEntry.objects.create(
                patient=patient,
                priority_status=priority,
                entered_at=timezone.now()
            )
        # ── Clear the session vital ID so the next patient starts a fresh row ──
        # This prevents the next patient from accidentally appending to this row.
        if 'current_vital_id' in request.session:
            del request.session['current_vital_id']

    return Response({
        "message": "Vital signs saved successfully",
        "data": {
            "id":                vital_signs.vitals_id,
            "patient_id":        patient.patient_id,
            "heart_rate":        vital_signs.heart_rate,
            "temperature":       vital_signs.temperature,
            "oxygen_saturation": vital_signs.oxygen_saturation,
            "weight":            vital_signs.weight,
            "height":            vital_signs.height,
            "blood_pressure":    vital_signs.blood_pressure,
            "timestamp":         vital_signs.date_time_recorded,
        },
    }, status=status.HTTP_200_OK)

    
@api_view(['GET'])
def test_rpi_connection(request):
    """
    Simple test endpoint to verify RPi can connect to Django
    """
    return Response({
        "status": "connected",
        "message": "Django server is reachable from Raspberry Pi",
        "timestamp": timezone.now().isoformat()
    })


#ADDED STAFF USERNAME
@csrf_exempt
@api_view(['POST'])
def login(request):
    pin = request.data.get("pin")
    login_type = request.data.get("login_type")  # 'staff' or 'patient'
    username = request.data.get("username")  # For patient login

    if not username:
        return Response({"error": "Username required"}, status=status.HTTP_400_BAD_REQUEST)
    
    if not pin:
        return Response({"error": "PIN required"}, status=status.HTTP_400_BAD_REQUEST)

    pin = str(pin).strip()
    username = username.strip()
    
    if login_type == "staff":
        try:
            # Find staff by username
            try:
                staff_member = HCStaff.objects.get(username=username)
            except HCStaff.DoesNotExist:
                return Response({"error": "Invalid username"}, status=status.HTTP_401_UNAUTHORIZED)

            # Verify hashed PIN
            if not check_password(pin, staff_member.pin):
                return Response({"error": "Invalid PIN"}, status=status.HTTP_401_UNAUTHORIZED)

            # Create session
            request.session["user_id"] = staff_member.staff_id
            request.session["user_type"] = "staff"
            request.session["first_name"] = staff_member.first_name

            return Response({
                
                
                "role": "staff",
                "first_name": staff_member.first_name,
                "middle_name": staff_member.middle_name,
                "last_name": staff_member.last_name,
                "staff_id": staff_member.staff_id
            })

        except Exception as e:
            return Response({"error": f"Login failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        
    elif login_type == 'patient':
        if not username:
            return Response({"error": "Username required for patient login"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            patient = Patient.objects.get(username=username.strip())
            
            # Use the built-in check_pin() method (which calls Django's check_password)
            if patient.check_pin(pin):
                request.session['user_type'] = 'patient'
                request.session['patient_id'] = patient.patient_id

                return Response({
                    "role": "patient",
                    "patient_id": patient.patient_id,
                    "name": f"{patient.first_name} {patient.last_name}"
                })
            else:
                return Response({"error": "Invalid PIN"}, status=status.HTTP_401_UNAUTHORIZED)
        
        except Patient.DoesNotExist:
            return Response({"error": "Invalid username"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
def get_patient_profile(request):
    """Get current logged-in patient's profile"""
    user_type = request.session.get('user_type')
    
    if user_type != 'patient':
        return Response({"error": "Not authenticated as patient"}, status=status.HTTP_401_UNAUTHORIZED)
    
    patient_id = request.session.get('patient_id')
    
    try:
        patient = Patient.objects.get(patient_id=patient_id)
        serializer = PatientSerializer(patient)
        return Response(serializer.data)
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)
    
def _is_complete(vital):
    return all([
        vital.blood_pressure    is not None,
        vital.heart_rate        is not None,
        vital.temperature       is not None,
        vital.oxygen_saturation is not None,
        vital.weight            is not None,
        vital.height            is not None,
    ])


@api_view(['GET'])
def get_patient_vitals(request):
    if request.session.get('user_type') != 'patient':
        return Response({"error": "Not authenticated as patient"}, status=status.HTTP_401_UNAUTHORIZED)

    patient_id = request.session.get('patient_id')

    try:
        patient = Patient.objects.get(patient_id=patient_id)

        # Get ALL vitals ordered by most recent, filter to complete only
        all_vitals = VitalSigns.objects.filter(
            patient=patient
        ).order_by('-date_time_recorded')

        complete = [v for v in all_vitals if _is_complete(v)]

        # No complete sessions yet
        if not complete:
            return Response({'latest': None, 'history': []})

        # index 0 = latest, index 1 onwards = history
        # These are explicitly split so latest never appears in history
        latest_vital   = complete[0]
        history_vitals = complete[1:]  # ← slicing the COMPLETE list, not the raw queryset

        def build_row(v):
            height_m  = v.height / 100
            bmi_value = round(v.weight / (height_m * height_m), 1)
            return {
                'id':             v.vitals_id,
                'date':           v.date_time_recorded.strftime('%Y-%m-%d %I:%M %p'),
                'heart_rate':     v.heart_rate,
                'blood_pressure': v.blood_pressure,
                'temperature':    v.temperature,
                'spo2':           v.oxygen_saturation,
                'height':         v.height,
                'weight':         v.weight,
                'bmi':            bmi_value,
            }

        height_m  = latest_vital.height / 100
        bmi_value = round(latest_vital.weight / (height_m * height_m), 1)

        latest_data = {
            'id':             latest_vital.vitals_id,
            'heart_rate':     latest_vital.heart_rate,
            'temperature':    latest_vital.temperature,
            'spo2':           latest_vital.oxygen_saturation,
            'blood_pressure': latest_vital.blood_pressure,
            'height':         latest_vital.height,
            'weight':         latest_vital.weight,
            'bmi':            bmi_value,
        }

        return Response({
            'latest':  latest_data,
            'history': [build_row(v) for v in history_vitals],
        })

    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def get_patient_vitals_by_id(request, patient_id):
    try:
        patient = Patient.objects.get(patient_id=patient_id)

        all_vitals = VitalSigns.objects.filter(
            patient=patient
        ).order_by('-date_time_recorded')

        complete = [v for v in all_vitals if _is_complete(v)]

        if not complete:
            return Response({'latest': None, 'history': []})

        latest_vital   = complete[0]
        history_vitals = complete[1:]

        def build_row(v):
            height_m  = v.height / 100
            bmi_value = round(v.weight / (height_m * height_m), 1)
            return {
                'id':             v.vitals_id,
                'date':           v.date_time_recorded.strftime('%Y-%m-%d %I:%M %p'),
                'heart_rate':     v.heart_rate,
                'blood_pressure': v.blood_pressure,
                'temperature':    v.temperature,
                'spo2':           v.oxygen_saturation,
                'height':         v.height,
                'weight':         v.weight,
                'bmi':            bmi_value,
            }

        height_m  = latest_vital.height / 100
        bmi_value = round(latest_vital.weight / (height_m * height_m), 1)

        latest_data = {
            'id':             latest_vital.vitals_id,
            'heart_rate':     latest_vital.heart_rate,
            'temperature':    latest_vital.temperature,
            'spo2':           latest_vital.oxygen_saturation,
            'blood_pressure': latest_vital.blood_pressure,
            'height':         latest_vital.height,
            'weight':         latest_vital.weight,
            'bmi':            bmi_value,
        }

        return Response({
            'latest':  latest_data,
            'history': [build_row(v) for v in history_vitals],
        })

    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)
    
class QueueViewSet(viewsets.ModelViewSet):
    queryset = QueueEntry.objects.all()
    serializer_class = QueueEntrySerializer
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['get'])
    def current_queue(self, request):
        queue = (
            QueueEntry.objects
            .filter(status__in=['WAITING', 'SERVING'])
            .select_related('patient')
            .annotate(
                status_order=Case(
                    When(status='SERVING', then=0),
                    default=1,
                    output_field=IntegerField(),
                ),
                priority_order=Case(
                    When(priority_status='CRITICAL', then=1),
                    When(priority_status='HIGH',     then=2),
                    When(priority_status='MEDIUM',   then=3),
                    default=4,
                    output_field=IntegerField(),
                ),
            )
            .order_by('status_order', 'priority_order', 'entered_at')
        )
        serializer = self.get_serializer(queue, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def all_today(self, request):
        today = timezone.now().date()
        queue = QueueEntry.objects.filter(
            entered_at__date=today
        ).select_related('patient').order_by('-entered_at')
        serializer = self.get_serializer(queue, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def completed_today(self, request):
        today = timezone.now().date()
        queue = QueueEntry.objects.filter(
            status='COMPLETED',
            entered_at__date=today
        ).select_related('patient').order_by('-served_at')
        serializer = self.get_serializer(queue, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def mark_serving(self, request, pk=None):
        try:
            close_old_connections()
            QueueEntry.objects.filter(status='SERVING').update(
                status='COMPLETED',
                served_at=timezone.now()
            )
            QueueEntry.objects.filter(pk=pk).update(status='SERVING')
            queue_entry = QueueEntry.objects.get(pk=pk)
            return Response({
                "message": "Patient marked as being served",
                "queue_number": str(queue_entry.queue_number).zfill(3)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def mark_complete(self, request, pk=None):
        try:
            queue_entry = self.get_object()
            queue_entry.status = 'COMPLETED'
            queue_entry.served_at = timezone.now()
            queue_entry.save()
            return Response({"message": "Patient marked as served"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        try:
            queue_entry = self.get_object()
            queue_entry.status = 'CANCELLED'
            queue_entry.save()
            return Response({"message": "Queue entry cancelled"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

@api_view(['POST'])
def logout(request):
    """Clear session"""
    request.session.flush()
    return Response({"message": "Logged out successfully"})

@api_view(['GET'])
def get_vitals(request):
   # Add auth check if needed (e.g., permission_classes = [IsAuthenticated])
    patients = VitalSigns.objects.all()
    serializer = VitalSignsSerializer(patients, many=True)
    return Response(serializer.data)

@api_view(['GET'])
def get_all_patients(request):
    """
    Retrieves all patients and attaches the latest vital signs
    to each patient object under the 'latest_vitals' key.
    Supports search by name or patient_id.
    """
    patients_queryset = Patient.objects.all()
    
    # Add search filtering
    search_term = request.GET.get('search', '').strip()
    if search_term:
        patients_queryset = patients_queryset.filter(
            Q(first_name__icontains=search_term) | 
            Q(last_name__icontains=search_term) | 
            Q(street__icontains=search_term) | 
            Q(barangay__icontains=search_term) | 
            Q(patient_id__icontains=search_term)
        )
    
    patients_queryset = patients_queryset.order_by('patient_id')  # Changed from 'id' to 'patient_id'
    
    # Find the ID of the LATEST VitalSigns record for each patient
    # Note: VitalSigns still has an auto 'id' field, but links via 'patient' FK
    latest_vitals_map = VitalSigns.objects.filter(
        patient__in=patients_queryset
    ).values('patient').annotate(
        latest_id=Max('vitals_id')
    ).values_list('latest_id', flat=True)

    # Fetch the actual latest VitalSigns objects using their IDs
    latest_vitals = VitalSigns.objects.filter(vitals_id__in=latest_vitals_map)
    
    # Map them by patient.patient_id (the string ID) for easy lookup
    vitals_dict = {v.patient.patient_id: v for v in latest_vitals}

    # Serialize patients
    serializer = PatientSerializer(patients_queryset, many=True)
    
    data = serializer.data
    
    # Inject latest_vitals data into the serialized output
    for patient_data in data:
        # Use 'patient_id' instead of 'id' since that's the primary key
        patient_str_id = patient_data['patient_id']  # Changed from patient_data['id']
        vital = vitals_dict.get(patient_str_id)
        
        latest_vital_data = None
        if vital:
            # Calculate BMI
            bmi_value = None
            if vital.height and vital.weight:
                height_m = vital.height / 100
                bmi_value = round(vital.weight / (height_m * height_m), 1)

            latest_vital_data = {
                'heart_rate': vital.heart_rate,
                'temperature': vital.temperature,
                'oxygen_saturation': vital.oxygen_saturation,
                'blood_pressure': vital.blood_pressure,
                'height': vital.height,
                'weight': vital.weight,
                'bmi': bmi_value, 
            }
        
        # This key 'latest_vitals' is what the frontend expects
        patient_data['latest_vitals'] = latest_vital_data 

    return Response(data)

@api_view(['POST'])
def archive_patient_view(request, patient_id):
    """Archive a patient and all their records"""
    
    success, message = archive_patient(patient_id)
    
    if success:
        return Response({"message": message}, status=status.HTTP_200_OK)
    else:
        return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def restore_patient_view(request, patient_id):
    """Restore an archived patient"""
    success, message = restore_patient(patient_id)
    
    if success:
        return Response({"message": message}, status=status.HTTP_200_OK)
    else:
        return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def get_archived_patients(request):
    """Get list of archived patients"""
    archived = ArchivedPatient.objects.all().order_by('-archived_at')
    
    data = [{
        'patient_id': p.patient_id,
        'name': f"{p.first_name} {p.last_name}",
        'archived_at': p.archived_at,
    } for p in archived]
    
    return Response(data)

@api_view(['POST'])
def store_fingerprint(request):
    """
    Store fingerprint template sent from Raspberry Pi.
    Example JSON: {"patient_id": "P-20251107-001", "template": "<base64_string>"}
    """
    patient_id = request.data.get("patient_id")
    template_b64 = request.data.get("template")

    if not patient_id or not template_b64:
        return Response({"error": "Missing patient_id or template"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        patient = Patient.objects.get(patient_id=patient_id)
        # Decode the base64 template
        template_bytes = base64.b64decode(template_b64)
        patient.fingerprint_template = template_bytes
        patient.save()
        return Response({"message": "Fingerprint template stored successfully!"})
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
def verify_fingerprint(request):
    """
    Called by Raspberry Pi when a fingerprint is matched.
    Example data: {"user_id": "8", "score": "70"}
    """
    user_id = request.data.get("user_id")
    score = request.data.get("score")

    if not user_id or not score:
        return Response({"error": "Missing user_id or score"}, status=400)

    try:
        # Match the fingerprint ID with a patient
        patient = Patient.objects.get(fingerprint_id=user_id)
        patient.last_visit = timezone.now()
        patient.save()
        return Response({
            "message": f"Fingerprint match successful for {patient.first_name} {patient.last_name}",
            "patient_id": patient.patient_id,
            "score": score
        }, status=200)
    except Patient.DoesNotExist:
        return Response({"error": f"No patient found with fingerprint_id {user_id}"}, status=404)

@api_view(['POST'])
def fingerprint_match_notification(request):
    """
    Called by the fingerprint scanner management command
    when a match is found (optional - for real-time notifications)
    """
    fingerprint_id = request.data.get('fingerprint_id')
    confidence = request.data.get('confidence')
    
    try:
        patient = Patient.objects.get(fingerprint_id=fingerprint_id)
    
        return Response({
            'status': 'success',
            'patient_id': patient.patient_id,
            'name': f'{patient.first_name} {patient.last_name}'
        })
    except Patient.DoesNotExist:
        return Response({
            'status': 'unknown',
            'message': 'Fingerprint not registered'
        }, status=404)
        

@api_view(['GET', 'POST'])
def print_patient_vitals(request, patient_id=None):
    """
    Generate a printable receipt-style vital signs document.
    Can be called via GET with patient_id in URL, or POST with patient_id in body.
    
    Returns JSON data formatted for thermal/receipt printing.
    For PDF output, add ?format=pdf to the URL.
    """
    # Get patient_id from URL param or request body
    if request.method == 'POST':
        patient_id = request.data.get('patient_id', patient_id)
    
    if not patient_id:
        return Response(
            {"error": "patient_id is required"}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Fetch patient
        patient = Patient.objects.get(patient_id=patient_id)
        
        # Get latest vitals
        latest_vital = VitalSigns.objects.filter(
            patient=patient
        ).order_by('-date_time_recorded').first()
        
        if not latest_vital:
            return Response(
                {"error": "No vital signs found for this patient"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Calculate BMI
        bmi_value = None
        if latest_vital.height and latest_vital.weight:
            height_m = latest_vital.height / 100
            bmi_value = round(latest_vital.weight / (height_m * height_m), 1)
        
        # Get or calculate priority
        priority = compute_patient_priority(patient)
        
        # Check if patient is in queue today
        today = timezone.now().date()
        queue_entry = QueueEntry.objects.filter(
            patient=patient,
            entered_at__date=today
        ).first()
        
        queue_number = None
        if queue_entry:
            queue_number = queue_entry.queue_number
        
        # Prepare print data
        print_data = {
            "header": {
                "facility_name": "Esperanza Health Center",
                "document_type": "Vital Signs Result",
                "printed_at": timezone.now().strftime("%Y-%m-%d %I:%M:%S %p")
            },
            "patient_info": {
                "patient_id": patient.patient_id,
                "name": f"{patient.first_name} {patient.middle_name or ''} {patient.last_name}".strip(),
                "age": None,
                "contact": patient.contact
            },
            "measurements": {
                "weight": f"{latest_vital.weight} kg" if latest_vital.weight is not None else "—",
                "height": f"{latest_vital.height} cm" if latest_vital.height is not None else "—",
                "bmi": f"{bmi_value} kg/m²" if bmi_value is not None else "—",
                "heart_rate": f"{latest_vital.heart_rate} bpm" if latest_vital.heart_rate is not None else "—",
                "temperature": f"{latest_vital.temperature} °C" if latest_vital.temperature is not None else "—",
                "oxygen_saturation": f"{latest_vital.oxygen_saturation} %" if latest_vital.oxygen_saturation is not None else "—",
                "blood_pressure": f"{latest_vital.blood_pressure} mmHg" if latest_vital.blood_pressure else "—"
            },
            "triage": {
                "priority": priority,
                "priority_code": get_priority_code(priority),
                "reasons": get_priority_reasons(latest_vital)
            },
            "queue": {
                "number": str(queue_number).zfill(3) if queue_number else "—",
                "status": queue_entry.status if queue_entry else "NOT_IN_QUEUE"
            },
            "footer": {
                "disclaimer": "This is your most recent vital signs result for personal reference. Not an official medical record.",
                "recorded_at": latest_vital.date_time_recorded.strftime("%Y-%m-%d %I:%M:%S %p")
            }
        }
        
        # Calculate age if birthdate exists
        if patient.birthdate:
            today = timezone.now().date()
            age = today.year - patient.birthdate.year
            if today.month < patient.birthdate.month or (
                today.month == patient.birthdate.month and today.day < patient.birthdate.day
            ):
                age -= 1
            print_data["patient_info"]["age"] = age
        
        # Check if PDF format is requested
        if request.GET.get('format') == 'pdf':
            return generate_vitals_pdf(print_data)
        
        # Return JSON for thermal printer / frontend printing
        return Response(print_data, status=status.HTTP_200_OK)
        
    except Patient.DoesNotExist:
        return Response(
            {"error": "Patient not found"}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {"error": f"Failed to generate print data: {str(e)}"}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def get_priority_code(priority):
    """Get color code for priority level"""
    codes = {
        'CRITICAL': 'RED',
        'HIGH': 'ORANGE',
        'MEDIUM': 'YELLOW',
        'NORMAL': 'GREEN'
    }
    return codes.get(priority, 'GREEN')


def get_priority_reasons(vital_signs):
    """Determine reasons for priority classification"""
    reasons = []
    
    if vital_signs.temperature:
        if vital_signs.temperature >= 39:
            reasons.append("High fever")
        elif vital_signs.temperature <= 35:
            reasons.append("Hypothermia")
    
    if vital_signs.heart_rate:
        if vital_signs.heart_rate > 100:
            reasons.append("Elevated heart rate")
        elif vital_signs.heart_rate < 60:
            reasons.append("Low heart rate")
    
    if vital_signs.oxygen_saturation:
        if vital_signs.oxygen_saturation < 95:
            reasons.append("Low oxygen saturation")
    
    if vital_signs.blood_pressure:
        try:
            sys, dia = map(int, vital_signs.blood_pressure.split('/'))
            if sys >= 140 or dia >= 90:
                reasons.append("High blood pressure")
            elif sys < 90 or dia < 60:
                reasons.append("Low blood pressure")
        except:
            pass
    
    return reasons if reasons else ["Normal vitals"]


def generate_vitals_pdf(print_data):
    """
    Generate a PDF receipt for vital signs.
    Returns a PDF file response.
    """
    # Create a BytesIO buffer
    buffer = BytesIO()
    
    # Create PDF with receipt dimensions (48mm width)
    width = 48 * mm
    height = 200 * mm  # Auto-adjust based on content
    
    p = canvas.Canvas(buffer, pagesize=(width, height))
    p.setTitle("Vital Signs Receipt")
    
    # Starting position
    y = height - 10 * mm
    
    # Helper function to draw centered text
    def draw_centered(text, y_pos, font_size=8, bold=False):
        p.setFont("Helvetica-Bold" if bold else "Helvetica", font_size)
        text_width = p.stringWidth(text, "Helvetica-Bold" if bold else "Helvetica", font_size)
        x = (width - text_width) / 2
        p.drawString(x, y_pos, text)
        return y_pos - (font_size + 2)
    
    # Helper function for left-right aligned text
    def draw_lr(label, value, y_pos, font_size=7):
        margin = 2 * mm
        p.setFont("Helvetica", font_size)
        p.drawString(margin, y_pos, label)
        
        p.setFont("Helvetica-Bold", font_size)
        value_width = p.stringWidth(value, "Helvetica-Bold", font_size)
        p.drawString(width - margin - value_width, y_pos, value)
        return y_pos - (font_size + 1.5)
    
    # Draw header
    y = draw_centered("Esperanza Health Center", y, 10, bold=True)
    y = draw_centered("Vital Signs Result", y, 7)
    y = draw_centered(print_data["header"]["printed_at"], y - 1, 6)
    
    # Draw separator
    y -= 3
    p.line(2*mm, y, width-2*mm, y)
    y -= 4
    
    # Patient info
    patient = print_data["patient_info"]
    y = draw_lr("Patient ID", patient["patient_id"], y)
    y = draw_lr("Name", patient["name"][:25], y)  # Truncate if too long
    if patient["age"]:
        y = draw_lr("Age", f"{patient['age']} years", y)
    
    y -= 2
    p.line(2*mm, y, width-2*mm, y)
    y -= 4
    
    # Measurements header
    p.setFont("Helvetica-Bold", 7)
    p.drawString(2*mm, y, "MEASUREMENTS")
    y -= 9
    
    # Draw measurements
    measurements = print_data["measurements"]
    y = draw_lr("Weight", measurements["weight"], y)
    y = draw_lr("Height", measurements["height"], y)
    y = draw_lr("BMI", measurements["bmi"], y)
    y = draw_lr("Heart Rate", measurements["heart_rate"], y)
    y = draw_lr("SpO2", measurements["oxygen_saturation"], y)
    y = draw_lr("Temperature", measurements["temperature"], y)
    y = draw_lr("Blood Pressure", measurements["blood_pressure"], y)
    
    y -= 2
    p.line(2*mm, y, width-2*mm, y)
    y -= 4
    
    # Triage info
    triage = print_data["triage"]
    y = draw_lr("Priority", triage["priority"], y)
    
    if triage["reasons"]:
        y -= 2
        p.setFont("Helvetica", 6)
        p.drawString(2*mm, y, "Reasons:")
        y -= 7
        for reason in triage["reasons"]:
            p.drawString(4*mm, y, f"• {reason}")
            y -= 6
    
    # Queue info if available
    if print_data["queue"]["number"] != "—":
        y -= 2
        p.line(2*mm, y, width-2*mm, y)
        y -= 4
        y = draw_lr("Queue Number", print_data["queue"]["number"], y, 9)
    
    # Footer
    y -= 4
    p.line(2*mm, y, width-2*mm, y)
    y -= 4
    
    # Disclaimer (wrapped text)
    p.setFont("Helvetica", 5)
    disclaimer = print_data["footer"]["disclaimer"]
    words = disclaimer.split()
    line = ""
    for word in words:
        test_line = line + word + " "
        if p.stringWidth(test_line, "Helvetica", 5) < width - 4*mm:
            line = test_line
        else:
            p.drawString(2*mm, y, line)
            y -= 6
            line = word + " "
    if line:
        p.drawString(2*mm, y, line)
    
    # Save PDF
    p.showPage()
    p.save()
    
    # Get PDF data
    pdf_data = buffer.getvalue()
    buffer.close()
    
    # Return as downloadable PDF
    response = HttpResponse(pdf_data, content_type='application/pdf')
    filename = f"vitals_{print_data['patient_info']['patient_id']}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    return response


@api_view(['POST'])
def print_queue_ticket(request):
    """
    Generate a queue ticket for a patient.
    Expects: {"patient_id": "P-20251107-001"}
    """
    patient_id = request.data.get('patient_id')
    
    if not patient_id:
        return Response(
            {"error": "patient_id is required"}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        patient = Patient.objects.get(patient_id=patient_id)
        
        # Get today's queue entry
        today = timezone.now().date()
        queue_entry = QueueEntry.objects.filter(
            patient=patient,
            entered_at__date=today,
            status__in=['WAITING', 'SERVING']
        ).first()
        
        if not queue_entry:
            return Response(
                {"error": "No active queue entry found for today"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        ticket_data = {
            "header": {
                "facility_name": "Esperanza Health Center",
                "document_type": "Queue Ticket",
                "printed_at": timezone.now().strftime("%Y-%m-%d %I:%M:%S %p")
            },
            "queue": {
                "number": str(queue_entry.queue_number).zfill(3),
                "priority": queue_entry.priority_status,
                "priority_code": get_priority_code(queue_entry.priority_status),
                "entered_at": queue_entry.entered_at.strftime("%I:%M:%S %p")
            },
            "patient_info": {
                "patient_id": patient.patient_id,
                "name": f"{patient.first_name} {patient.last_name}"
            },
            "footer": {
                "message": "Please wait for your number to be called. Thank you for your patience."
            }
        }
        
        return Response(ticket_data, status=status.HTTP_200_OK)
        
    except Patient.DoesNotExist:
        return Response(
            {"error": "Patient not found"}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {"error": f"Failed to generate ticket: {str(e)}"}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def print_to_pos58(request):
    """
    Send simple receipt text directly to thermal printer (58mm).
    Expects: {"patient_id": "P-20251107-001"}
    """
    patient_id = request.data.get("patient_id")
    if not patient_id:
        return Response({"error": "patient_id required"}, status=400)

    try:
        patient = Patient.objects.get(patient_id=patient_id)
        latest_vital = VitalSigns.objects.filter(patient=patient).order_by('-date_time_recorded').first()

        if not latest_vital:
            return Response({"error": "No vitals found"}, status=404)

        # Calculate age safely
        age_str = "—"
        if patient.birthdate:
            today = timezone.now().date()
            age = today.year - patient.birthdate.year
            if today.month < patient.birthdate.month or (
                today.month == patient.birthdate.month and today.day < patient.birthdate.day
            ):
                age -= 1
            age_str = str(age)

        # Calculate BMI safely
        bmi_str = "—"
        if latest_vital.height and latest_vital.weight:
            height_m = latest_vital.height / 100
            bmi_value = round(latest_vital.weight / (height_m * height_m), 1)
            bmi_str = str(bmi_value)

        receipt = f"""
=============================
ESPERANZA HEALTH CENTER
=============================
Patient: {patient.first_name} {patient.last_name}
Age: {age_str}
ID: {patient.patient_id}

TEMP: {latest_vital.temperature if latest_vital.temperature is not None else '—'} °C
PULSE: {latest_vital.heart_rate if latest_vital.heart_rate is not None else '—'} bpm
SPO2: {latest_vital.oxygen_saturation if latest_vital.oxygen_saturation is not None else '—'} %
HEIGHT: {latest_vital.height if latest_vital.height is not None else '—'} cm
WEIGHT: {latest_vital.weight if latest_vital.weight is not None else '—'} kg
BMI: {bmi_str} kg/m²
BP: {latest_vital.blood_pressure if latest_vital.blood_pressure else '—'}
Recorded at: {latest_vital.date_time_recorded.strftime("%Y-%m-%d %I:%M %p")}

Thank you for visiting!
=============================

    """

        PRINTER_PATH = "/dev/usb/lp0"
        try:
            with open(PRINTER_PATH, "w") as printer:
                printer.write(receipt + "\n\n\n")
            return Response({"message": "Printed successfully!"}, status=200)
        except IOError as e:
            return Response({"error": f"Printer error: {str(e)}"}, status=500)

    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
    
''' REPLACED FUNCTION FOR COMBINED RECEIPT '''
@api_view(['POST'])
def print_vitals_and_queue_pos58(request):
    """
    Prints ONE combined receipt: queue ticket + vital signs.
    """
    patient_id = request.data.get("patient_id")
    if not patient_id:
        return Response({"error": "patient_id is required"}, status=400)
    
    try:
        patient = Patient.objects.get(patient_id=patient_id)
        vitals = VitalSigns.objects.filter(patient=patient).order_by('-date_time_recorded').first()

        if not vitals:
            return Response({"error": "No vitals found"}, status=404)

        # Get today's queue entry
        today = timezone.now().date()
        queue = QueueEntry.objects.filter(
            patient=patient,
            entered_at__date=today
        ).first()

        queue_num = queue.queue_number if queue else None
        priority = queue.priority_status if queue else "NORMAL"

        # Compute BMI
        bmi_str = "—"
        if vitals.height and vitals.weight:
            height_m = vitals.height / 100
            bmi_value = round(vitals.weight / (height_m * height_m), 1)
            bmi_str = str(bmi_value)

       # Prepare receipt text
        queue_num_display = str(queue_num).zfill(3) if queue_num else "—"

        big_queue = (
            "\x1B\x21\x30"  
            + f"{queue_num_display}\n"
            + "\x1B\x21\x00"  
        )

        receipt = f"""
    Esperanza Health Center
       Vital Signs Result
       {vitals.date_time_recorded.strftime("%m/%d/%Y %I:%M %p")}
--------------------------------
             Queue No.
               {big_queue}
Priority: [{priority} {get_priority_code(priority)}]
--------------------------------
Patient ID      {patient.patient_id}
Patient Name    {patient.first_name} {patient.last_name}
--------------------------------
Measurements
Weight          {vitals.weight if vitals.weight is not None else "—"} kg
Height          {vitals.height if vitals.height is not None else "—"} cm
BMI             {bmi_str} kg/m²
Heart Rate      {vitals.heart_rate if vitals.heart_rate is not None else "—"} bpm
SpO2            {vitals.oxygen_saturation if vitals.oxygen_saturation is not None else "—"} %
Temp            {vitals.temperature if vitals.temperature is not None else "—"} °C
BP              {vitals.blood_pressure if vitals.blood_pressure else "—"} mmHg
--------------------------------
Thank you for visiting!
For check-up and consultation,
please proceed to the clinic area.
"""

        # Send to thermal printer
        PRINTER_PATH = "/dev/usb/lp0"
        with open(PRINTER_PATH, "w") as printer:
            printer.write(receipt + "\n\n\n")

        return Response({"message": "Printed combined receipt!"}, status=200)

    except Exception as e:
        return Response({"error": str(e)}, status=500)

# Add this to your views.py




MASTER_PIN = '1111'

@csrf_exempt
def verify_pin(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            entered_pin = data.get('pin')
            print(f"Received pin: {repr(entered_pin)}, type: {type(entered_pin)}")  # debug

            # Direct comparison
            if entered_pin == MASTER_PIN:
                return JsonResponse({'verified': True})
            else:
                # 401 Unauthorized is appropriate for a wrong PIN
                return JsonResponse({'verified': False, 'error': 'Invalid PIN'}, status=401)
        
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid data format'}, status=400)

    return JsonResponse({'error': 'Method not allowed'}, status=405)


# Add these imports at the top if not already present
import json
import threading
from django.db import transaction

# Add these staff fingerprint views to your views.py
# STAFF FINGERPRINT VIEWS - For HCStaff/Employee Management
# These are SEPARATE from patient fingerprint views
# All endpoints prefixed with /staff/fingerprint/

@api_view(['POST'])
def start_staff_fingerprint_enrollment(request):
    """Start STAFF fingerprint enrollment"""
    staff_id = request.data.get('staff_id')

    if not staff_id:
        return Response(
            {"error": "staff_id is required for staff enrollment"},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        staff = HCStaff.objects.get(staff_id=staff_id)

        if staff.fingerprint_id:
            return Response(
                {"error": f"Staff member already has fingerprint ID {staff.fingerprint_id}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        fingerprint_id = get_next_fingerprint_id()

        if not fingerprint_id:
            return Response(
                {"error": "No available fingerprint slots."},
                status=status.HTTP_507_INSUFFICIENT_STORAGE
            )

        ser = get_serial()
        if ser is None:
            return Response(
                {"error": "Arduino fingerprint sensor connection error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        _claim_serial()   # held until check_staff_enrollment_status releases it

        try:
            with _serial_lock:
                ser.reset_input_buffer()
                ser.write(f"E:{fingerprint_id}\n".encode())
                ser.flush()

            return Response({
                "status": "started",
                "fingerprint_id": fingerprint_id,
                "staff_id": staff_id,
                "message": "Staff enrollment started - place finger on sensor"
            })

        except Exception as e:
            _release_serial()
            return Response(
                {"error": f"Fingerprint sensor communication error: {str(e)}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

    except HCStaff.DoesNotExist:
        return Response(
            {"error": "Staff member not found"},
            status=status.HTTP_404_NOT_FOUND
        )

@api_view(['GET'])
def check_staff_enrollment_status(request):
    """Check STAFF fingerprint enrollment status"""
    fingerprint_id = request.query_params.get('fingerprint_id')
    staff_id = request.query_params.get('staff_id')

    if not fingerprint_id or not staff_id:
        return Response(
            {"error": "fingerprint_id and staff_id are required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    ser = get_serial()
    if ser is None:
        _release_serial()
        return Response(
            {"error": "Fingerprint sensor connection error"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    try:
        with _serial_lock:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8').strip()

                if line:
                    try:
                        data = json.loads(line)

                        if data.get('status') == 'enrolled':
                            try:
                                staff = HCStaff.objects.get(staff_id=staff_id)
                                staff.fingerprint_id = fingerprint_id
                                staff.save()
                            except HCStaff.DoesNotExist:
                                pass
                            _release_serial()   # enrollment done — release
                            return Response({
                                "status": "enrolled",
                                "fingerprint_id": fingerprint_id,
                                "message": "Staff fingerprint enrolled successfully"
                            })

                        if data.get('status') == 'error':
                            _release_serial()   # enrollment failed — release
                            return Response(data)

                        return Response(data)   # still in progress, stay claimed

                    except json.JSONDecodeError:
                        return Response({
                            "status": "waiting",
                            "message": line
                        })

        return Response({
            "status": "waiting",
            "message": "Waiting for fingerprint sensor..."
        })

    except Exception as e:
        _release_serial()
        return Response(
            {"error": f"Error reading enrollment status: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['DELETE'])
def delete_staff_fingerprint(request, staff_id):
    """
    Delete STAFF fingerprint from sensor and database
    Endpoint: DELETE /staff/fingerprint/delete/<staff_id>/
    """
    try:
        # Get HCStaff record - NOT Patient
        staff = HCStaff.objects.get(staff_id=staff_id)
        
        if not staff.fingerprint_id:
            return Response(
                {"error": "Staff member has no fingerprint enrolled"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        fingerprint_id = staff.fingerprint_id
        
        # Delete from Arduino fingerprint sensor
        try:
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
                time.sleep(2)
                command = f"DELETE:{fingerprint_id}\n"
                ser.write(command.encode())
                time.sleep(1)
                if ser.in_waiting:
                    response = ser.readline().decode('utf-8').strip()
        
        except serial.SerialException as e:
            pass  # Continue even if sensor delete fails
        
        # Delete from HCStaff database record
        staff.fingerprint_id = None
        staff.save()
        
        return Response({
            "message": f"Staff fingerprint {fingerprint_id} deleted successfully",
            "staff_id": staff_id
        })
        
    except HCStaff.DoesNotExist:
        return Response(
            {"error": "Staff member not found"}, 
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
def verify_staff_fingerprint(request):
    """
    Verify STAFF fingerprint for login/authentication
    Returns staff member info if fingerprint matches
    Endpoint: POST /staff/fingerprint/verify/
    """
    user_id = request.data.get("user_id")  # fingerprint_id from sensor
    score = request.data.get("score")      # match confidence score

    if not user_id:
        return Response({"error": "Missing user_id (fingerprint_id)"}, status=400)

    try:
        # Find HCStaff by fingerprint_id - NOT Patient
        staff = HCStaff.objects.get(fingerprint_id=user_id)
        
        return Response({
            "status": "success",
            "user_type": "staff",           # Explicitly staff
            "staff_id": staff.staff_id,     # staff_id NOT patient_id
            "username": staff.username,
            "name": f"{staff.first_name} {staff.last_name}",
            "position": staff.position,
            "department": staff.department,
            "score": score
        }, status=200)
        
    except HCStaff.DoesNotExist:
        return Response(
            {"error": f"No staff member found with fingerprint_id {user_id}"}, 
            status=404
        )
    


@api_view(['GET'])
def check_staff_fingerprint_match(request):
    global IS_SCANNING
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=503)

    response_data = None
    should_stop = False

    try:
        with _serial_lock:
            if scan_start_times["staff"] is None:
                scan_start_times["staff"] = time.time()

            if time.time() - scan_start_times["staff"] > SCAN_TIMEOUT:
                scan_start_times["staff"] = None
                IS_SCANNING = False
                should_stop = True
                response_data = {
                    "status": "error",
                    "error_type": "UNKNOWN_FINGERPRINT",
                    "message": "Fingerprint scan timed out"
                }

            else:
                last_data = None
                time.sleep(0.05)
                
                while ser.in_waiting > 0:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if not line:
                        continue
                        
                    try:
                        if '}{' in line:
                            line = '{' + line.split('}{')[-1]
                            
                        data = json.loads(line)
                        last_data = data
                            
                        if data.get("status") in ("found", "not_found", "error", "cancelled"):
                            break
                            
                    except json.JSONDecodeError:
                        continue

                if last_data is None:
                    return Response({"status": "scanning", "message": "Waiting for finger..."})

                arduino_status = last_data.get("status", "")

                if arduino_status in ("scanning", "place_finger", "remove_finger"):
                    return Response({"status": arduino_status, "message": last_data.get("message", "")})

                elif arduino_status == "not_found":
                    scan_start_times["staff"] = None
                    IS_SCANNING = False
                    should_stop = True
                    response_data = {
                        "status": "error",
                        "error_type": "UNKNOWN_FINGERPRINT",
                        "message": "Fingerprint not registered"
                    }

                elif arduino_status == "found":
                    fingerprint_id = str(last_data.get("id"))
                    staff = HCStaff.objects.filter(fingerprint_id=fingerprint_id).first()

                    if staff:
                        scan_start_times["staff"] = None
                        IS_SCANNING = False
                        should_stop = True
                        request.session["user_id"] = staff.staff_id
                        request.session["user_type"] = "staff"
                        request.session["first_name"] = staff.first_name
                        response_data = {
                            "status": "success",
                            "user_type": "staff",
                            "staff_id": staff.staff_id,
                            "username": staff.username,
                            "name": f"{staff.first_name} {staff.last_name}",
                            "confidence": last_data.get("confidence", 0)
                        }
                    else:
                        patient = Patient.objects.filter(fingerprint_id=fingerprint_id).first()
                        if patient:
                            scan_start_times["staff"] = None
                            IS_SCANNING = False
                            should_stop = True
                            response_data = {
                                "status": "error",
                                "error_type": "WRONG_ROLE",
                                "found_role": "patient",
                                "patient_name": f"{patient.first_name} {patient.last_name}",
                                "message": "This fingerprint belongs to a Patient. Use Patient Login."
                            }
                        else:
                            scan_start_times["staff"] = None
                            IS_SCANNING = False
                            should_stop = True
                            response_data = {
                                "status": "error",
                                "error_type": "UNKNOWN_FINGERPRINT",
                                "message": "Fingerprint not registered"
                            }
                else:
                    return Response(last_data)

        if should_stop:
            try:
                with _serial_lock:
                    ser.write(b"STOP\n")
                    ser.flush()
            except Exception:
                pass
            finally:
                _release_serial()

        return Response(response_data)

    except Exception as e:
        scan_start_times["staff"] = None
        IS_SCANNING = False
        try:
            with _serial_lock:
                ser.write(b"STOP\n")
                ser.flush()
        except Exception:
            pass
        finally:
            _release_serial()
        return Response({"error": str(e)}, status=500)
    
@api_view(['POST'])
def stop_fingerprint_enrollment(request):
    """Called when user clicks Cancel Enrollment in React"""
    ser = get_serial()
    
    # Always clear the enrollment lock
    _enrollment_active.clear()
    _release_serial()

    if ser:
        try:
            with _serial_lock:
                ser.write(b'FLUSH\n')
                ser.flush()
        except Exception:
            pass

    return Response({"status": "stopped"})
# ── REPLACE the entire _read_single_vital function and all 4 measure_ views ──
# in your views.py with this block

def _read_single_vital(command: bytes, expected_keys, timeout: int = 15):
    """Only used for Arduino sensors (weight, height, temp). NOT for pulse."""
    if isinstance(expected_keys, str):
        expected_keys = [expected_keys]

    _claim_serial()
    ser = get_serial(serial_port=SERIAL_PORT)  # always Arduino, never ESP32
    if ser is None:
        _release_serial()
        return None, "Arduino connection error"

    try:
        with _serial_lock:
            ser.reset_input_buffer()
            ser.reset_output_buffer()
            ser.write(command)
            ser.flush()

        time.sleep(0.2)
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                with _serial_lock:
                    ser.timeout = 2
                    raw = ser.readline()
            except Exception:
                time.sleep(0.1)
                continue

            line = raw.decode(errors='ignore').strip()
            if not line:
                continue

            print(f"Arduino → {repr(line)}")

            if line.startswith('{'):
                try:
                    parsed = json.loads(line)
                    if 'debug' in parsed:
                        continue


                    if all(k in parsed for k in expected_keys):
                        return parsed, None
                except json.JSONDecodeError:
                    pass

        return None, (
            f"Timeout — Arduino did not return {expected_keys} within {timeout}s"
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return None, str(e)

    finally:
        _release_serial()

@api_view(['POST'])
def measure_weight(request):
    data, err = _read_single_vital(b'WEIGHT\n', 'weight', timeout=12)
    if err:
        return Response({"error": err}, status=500)
    weight = data.get('weight', 0)
    latest_vitals['weight'] = weight
    return Response({"weight": weight})


@api_view(['POST'])
def measure_height(request):
    try:
        data, err = _read_single_vital(b'HEIGHT\n', 'height', timeout=10)
        if err:
            return Response({"error": err}, status=500)
        height = data.get('height', 0)
        latest_vitals['height'] = height
        return Response({"height": height})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": str(e)}, status=500)

           

# ─────────────────────────────────────────────────────────────────────────────
# In views.py, DELETE both of these functions:
#   - fetch_temperature   (the @api_view(['GET']) one)
#   - measure_temperature (the @api_view(['POST']) one)
#
# Then paste this single combined replacement in their place.
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
def measure_temperature(request):
    if request.method == 'GET':
        cached = latest_vitals.get('temperature')
        if cached is not None:
            return Response({"temperature": cached})
        return Response({"error": "No temperature reading available yet."}, status=404)

    try:
        data, err = _read_single_vital(b'TEMP\n', 'temperature', timeout=12)  # ← 8 → 12
        if err:
            print(f"[measure_temperature] error: {err}")
            return Response({"error": err}, status=500)

        temp = round(float(data.get('temperature', 0)), 1)
        latest_vitals['temperature'] = temp
        print(f"[measure_temperature] ✅ temp={temp}")
        return Response({"temperature": temp})

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return Response({"error": str(exc)}, status=500)
    
# Global flag for hardware button
_btn_next_pressed = False




BTN_NEXT_DEBOUNCE = 3.0  # seconds

# ==============================================================================
# CORE QUEUE & HARDWARE LOGIC (Unbreakable Sequence)
# ==============================================================================
from django.db import transaction, close_old_connections
import time

# ==============================================================================
# CORE QUEUE & HARDWARE LOGIC (Strict Database Slaving & Polite Queuing)
# ==============================================================================
# ==============================================================================
# CORE QUEUE & HARDWARE LOGIC (DIRECT SQL OVERRIDE - NO LOCK COLLISIONS)
# ==============================================================================
# views.py

_btn_next_lock = threading.RLock()
_last_btn_next_time = 0
# views.py additions/replacements

_advance_lock = threading.Lock()
_last_advance_time = 0

def _advance_queue_on_button():
    """Event-triggered database update. NO TIMERS. NO SERIAL WRITES."""
    try:
        close_old_connections()
        with transaction.atomic():
            # 1. Complete whoever is CURRENTLY serving
            QueueEntry.objects.filter(status='SERVING').update(
                status='COMPLETED', 
                served_at=timezone.now()
            )
            
            # 2. Find the highest priority WAITING patient
            next_patient = QueueEntry.objects.filter(status='WAITING').annotate(
                p_order=Case(
                    When(priority_status='CRITICAL', then=1),
                    When(priority_status='HIGH', then=2),
                    When(priority_status='MEDIUM', then=3),
                    default=4, output_field=IntegerField()
                )
            ).order_by('p_order', 'entered_at').first()

            display_num = "000"
            if next_patient:
                next_patient.status = 'SERVING'
                next_patient.save()
                display_num = str(next_patient.queue_number).zfill(3)

        # Notice: No serial.write() here! The RPi handles it now.
        return True, display_num
        
    except Exception as e:
        print(f"Error advancing queue: {e}")
        return False, "000"


@api_view(['POST'])
def trigger_next_button(request):
    """Manual UI trigger from the Tablet OR physical RPi button"""
    success, display_num = _advance_queue_on_button()
    
    if success:
        _btn_next_event.set() # Tells the React UI to update
        # We return 'new_number' so the RPi script can read it
        return Response({"status": "success", "new_number": display_num})
        
    return Response({"status": "error", "message": "Failed to advance queue"}, status=500)


@api_view(['GET'])
def get_current_queue_for_display(request):
    """Source of truth for the frontend 'Now Serving' card."""

    # Prefer the patient who is actively SERVING
    entry = QueueEntry.objects.filter(status='SERVING').first()

    if entry:
        return Response({
            "queue_number": str(entry.queue_number).zfill(3),
            "patient_name": f"{entry.patient.first_name} {entry.patient.last_name}",
            "status": "SERVING",
        })

    # Nothing serving yet — show the next-up WAITING patient as a preview
    next_waiting = (
        QueueEntry.objects
        .filter(status='WAITING')
        .annotate(
            priority_order=Case(
                When(priority_status='CRITICAL', then=1),
                When(priority_status='HIGH',     then=2),
                When(priority_status='MEDIUM',   then=3),
                default=4,
                output_field=IntegerField(),
            )
        )
        .order_by('priority_order', 'entered_at')
        .first()
    )

    if next_waiting:
        return Response({
            "queue_number": str(next_waiting.queue_number).zfill(3),
            "patient_name": f"{next_waiting.patient.first_name} {next_waiting.patient.last_name}",
            "status": "WAITING",
        })

    return Response({"queue_number": "000", "patient_name": None, "status": "EMPTY"})

@api_view(['GET'])
def check_next_button(request):
    """React polls this to refresh UI when hardware button is pressed."""
    if _btn_next_event.is_set():
        _btn_next_event.clear()
        return Response({"pressed": True, "sensor_busy": False})
    
    busy = _serial_busy.is_set() or _enrollment_active.is_set() or IS_SCANNING
    return Response({"pressed": False, "sensor_busy": busy})


@api_view(['GET'])
def check_patient_fingerprint_match(request):
    global IS_SCANNING
    ser = get_serial()
    if ser is None:
        return Response({"error": "Arduino connection error"}, status=503)

    response_data = None
    should_stop = False

    try:
        with _serial_lock:
            if scan_start_times["patient"] is None:
                scan_start_times["patient"] = time.time()

            if time.time() - scan_start_times["patient"] > SCAN_TIMEOUT:
                scan_start_times["patient"] = None
                IS_SCANNING = False
                should_stop = True
                response_data = {
                    "status": "error",
                    "error_type": "UNKNOWN_FINGERPRINT",
                    "message": "Fingerprint scan timed out"
                }

            else:
                last_data = None
                time.sleep(0.05) 
                
                # --- FAST BUFFER DRAIN ---
                while ser.in_waiting > 0:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if not line:
                        continue
                        
                    try:
                        if '}{' in line:
                            line = '{' + line.split('}{')[-1]
                            
                        data = json.loads(line)
                        last_data = data
                            
                        # Only break if it is the TRUE final message sent after 5 seconds
                        if data.get("status") in ("found", "not_found", "error", "cancelled"):
                            break
                            
                    except json.JSONDecodeError:
                        continue
                # -------------------------

                if last_data is None:
                    return Response({"status": "scanning", "message": "Waiting for finger..."})

                arduino_status = last_data.get("status", "")

                if arduino_status in ("scanning", "place_finger", "remove_finger"):
                    return Response({"status": arduino_status, "message": last_data.get("message", "")})

                elif arduino_status == "not_found":
                    scan_start_times["patient"] = None
                    IS_SCANNING = False
                    should_stop = True
                    response_data = {
                        "status": "error",
                        "error_type": "UNKNOWN_FINGERPRINT",
                        "message": "Fingerprint not registered"
                    }

                elif arduino_status == "found":
                    fingerprint_id = str(last_data.get("id"))
                    patient = Patient.objects.filter(fingerprint_id=fingerprint_id).first()

                    if patient:
                        scan_start_times["patient"] = None
                        IS_SCANNING = False
                        should_stop = True
                        request.session["user_type"] = "patient"
                        request.session["patient_id"] = patient.patient_id
                        patient.last_visit = timezone.now()
                        patient.save()
                        response_data = {
                            "status": "success",
                            "user_type": "patient",
                            "patient_id": patient.patient_id,
                            "name": f"{patient.first_name} {patient.last_name}",
                            "confidence": last_data.get("confidence", 0)
                        }
                    else:
                        staff = HCStaff.objects.filter(fingerprint_id=fingerprint_id).first()
                        if staff:
                            scan_start_times["patient"] = None
                            IS_SCANNING = False
                            should_stop = True
                            response_data = {
                                "status": "error",
                                "error_type": "WRONG_ROLE",
                                "found_role": "staff",
                                "staff_name": f"{staff.first_name} {staff.last_name}",
                                "message": "This fingerprint belongs to Staff. Use Staff Login."
                            }
                        else:
                            scan_start_times["patient"] = None
                            IS_SCANNING = False
                            should_stop = True
                            response_data = {
                                "status": "error",
                                "error_type": "UNKNOWN_FINGERPRINT",
                                "message": "Fingerprint not registered"
                            }
                else:
                    return Response(last_data)

        if should_stop:
            try:
                with _serial_lock:
                    ser.write(b"STOP\n")
                    ser.flush()
            except Exception:
                pass
            finally:
                _release_serial()

        return Response(response_data)

    except Exception as e:
        scan_start_times["patient"] = None
        IS_SCANNING = False
        try:
            with _serial_lock:
                ser.write(b"STOP\n")
                ser.flush()
        except Exception:
            pass
        finally:
            _release_serial() 
        return Response({"error": str(e)}, status=500)