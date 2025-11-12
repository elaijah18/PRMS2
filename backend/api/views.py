import base64
from django.shortcuts import render  # Unused but kept if needed elsewhere
from rest_framework import viewsets, status
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from .models import Patient, VitalSigns, HCStaff, QueueEntry, ArchivedPatient, ArchivedVitalSigns, ArchivedQueueEntry
from .models import archive_patient, restore_patient
from .serializers import PatientSerializer, VitalSignsSerializer, QueueEntrySerializer 
from django.db.models import Q, Case, When, IntegerField, Max  # For queue sorting
from django.utils import timezone  
from .utils import compute_patient_priority
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from django.contrib.auth.hashers import check_password
import serial, json, time, threading


SERIAL_PORT = '/dev/ttyACM0'  # Adjust if using ACM1
BAUD_RATE = 9600
# active_serial = None
# active_serial_lock = threading.Lock()

# def get_next_fingerprint_id():
#     """Get the next available fingerprint ID (1-127)"""
#     # Get all used fingerprint IDs
#     used_ids = set(Patient.objects.filter(
#         fingerprint_id__isnull=False
#     ).values_list('fingerprint_id', flat=True))
    
#     # Find first available ID
#     for i in range(1, 128):
#         if str(i) not in used_ids:
#             return str(i)
    
#     return None  # All IDs are used

# # Simpler approach: Keep serial connection open globally
# # Add at module level (after imports)



# @api_view(['POST'])
# def start_fingerprint_scan(request):
#     """
#     Start fingerprint scanning mode for login
#     Arduino will continuously scan until a match is found
#     """
#     ser = get_or_create_serial()
#     if ser is None:
#         return Response(
#             {"error": "Arduino connection error"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )
    
#     try:
#         with active_serial_lock:
#             # Clear buffer
#             ser.reset_input_buffer()
            
#             # Send scan command to Arduino
#             ser.write(b"SCAN\n")
#             ser.flush()
        
#         return Response({
#             "status": "scanning",
#             "message": "Place finger on sensor"
#         })
        
#     except Exception as e:
#         return Response(
#             {"error": f"Communication error: {str(e)}"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )


# @api_view(['GET'])
# def check_fingerprint_match(request):
#     """
#     Poll for fingerprint match results
#     Returns patient data if match found
#     """
#     ser = get_or_create_serial()
#     if ser is None:
#         return Response(
#             {"error": "Arduino connection error"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )
    
#     try:
#         with active_serial_lock:
#             if ser.in_waiting > 0:
#                 line = ser.readline().decode('utf-8').strip()
                
#                 if line:
#                     print(f"[DEBUG] Raw Arduino response: {line}")  # ← ADD THIS
                    
#                     try:
#                         data = json.loads(line)
#                         print(f"[DEBUG] Parsed JSON: {data}")  # ← ADD THIS
                        
#                         # If match found, get patient info
#                         if data.get('status') == 'match':
#                             fingerprint_id = str(data.get('id'))
#                             print(f"[DEBUG] Looking for fingerprint_id: '{fingerprint_id}' (type: {type(fingerprint_id)})")  # ← ADD THIS
                            
#                             # DEBUG: Show all stored fingerprint IDs
#                             all_fps = Patient.objects.filter(fingerprint_id__isnull=False).values_list('patient_id', 'fingerprint_id')
#                             print(f"[DEBUG] All stored fingerprint IDs: {list(all_fps)}")  # ← ADD THIS
                            
#                             try:
#                                 patient = Patient.objects.get(fingerprint_id=fingerprint_id)
#                                 print(f"[DEBUG] Patient found: {patient.first_name} {patient.last_name}")  # ← ADD THIS
                                
#                                 # Create session (auto-login)
#                                 request.session['user_type'] = 'patient'
#                                 request.session['patient_id'] = patient.patient_id
                                
#                                 # Update last visit
#                                 patient.last_visit = timezone.now()
#                                 patient.save()
                                
#                                 return Response({
#                                     "status": "success",
#                                     "patient_id": patient.patient_id,
#                                     "name": f"{patient.first_name} {patient.last_name}",
#                                     "fingerprint_id": fingerprint_id,
#                                     "confidence": data.get('confidence', 0)
#                                 })
                                
#                             except Patient.DoesNotExist:
#                                 print(f"[DEBUG] No patient found with fingerprint_id='{fingerprint_id}'")  # ← ADD THIS
#                                 return Response({
#                                     "status": "error",
#                                     "message": f"Fingerprint ID {fingerprint_id} not registered"
#                                 })
                        
#                         # Return Arduino status (scanning, no_match, etc)
#                         return Response(data)
                        
#                     except json.JSONDecodeError as e:
#                         print(f"[DEBUG] JSON decode error: {e}")  # ← ADD THIS
#                         return Response({
#                             "status": "scanning", 
#                             "message": line
#                         })
            
#             # No data yet
#             return Response({
#                 "status": "scanning", 
#                 "message": "Waiting for finger"
#             })
                
#     except Exception as e:
#         print(f"[DEBUG] Exception: {e}")  # ← ADD THIS
#         return Response(
#             {"error": f"Error: {str(e)}"}, 
#             status=status.HTTP_500_INTERNAL_SERVER_ERROR
#         )


# @api_view(['POST'])
# def stop_fingerprint_scan(request):
#     """
#     Stop fingerprint scanning mode
#     """
#     ser = get_or_create_serial()
#     if ser is None:
#         return Response(
#             {"error": "Arduino connection error"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )
    
#     try:
#         with active_serial_lock:
#             # Send stop command
#             ser.write(b"STOP\n")
#             ser.flush()
        
#         return Response({
#             "status": "stopped",
#             "message": "Scanning stopped"
#         })
        
#     except Exception as e:
#         return Response(
#             {"error": f"Communication error: {str(e)}"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )

# def get_or_create_serial():
#     """Get or create a persistent serial connection"""
#     global active_serial
    
#     with active_serial_lock:
#         if active_serial is None or not active_serial.is_open:
#             try:
#                 active_serial = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
#                 time.sleep(2)  # Let Arduino initialize
#             except serial.SerialException as e:
#                 print(f"Failed to open serial: {e}")
#                 return None
#         return active_serial

# @api_view(['POST'])
# def start_fingerprint_enrollment(request):
#     """Start fingerprint enrollment process"""
#     patient_id = request.data.get('patient_id')
    
#     if not patient_id:
#         return Response(
#             {"error": "patient_id is required"}, 
#             status=status.HTTP_400_BAD_REQUEST
#         )
    
#     try:
#         patient = Patient.objects.get(patient_id=patient_id)
        
#         if patient.fingerprint_id:
#             return Response(
#                 {"error": f"Patient already has fingerprint ID {patient.fingerprint_id}"}, 
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         fingerprint_id = get_next_fingerprint_id()
        
#         if not fingerprint_id:
#             return Response(
#                 {"error": "No available fingerprint slots (maximum 127 reached)"}, 
#                 status=status.HTTP_507_INSUFFICIENT_STORAGE
#             )
        
#         # Get persistent serial connection
#         ser = get_or_create_serial()
#         if ser is None:
#             return Response(
#                 {"error": "Arduino connection error"}, 
#                 status=status.HTTP_503_SERVICE_UNAVAILABLE
#             )
        
#         try:
#             with active_serial_lock:
#                 # Clear any old data
#                 ser.reset_input_buffer()
                
#                 # Send enrollment command
#                 command = f"E:{fingerprint_id}\n"
#                 ser.write(command.encode())
#                 ser.flush()
            
#             return Response({
#                 "status": "started",
#                 "fingerprint_id": fingerprint_id,
#                 "patient_id": patient_id,
#                 "message": "Enrollment started - place finger on sensor"
#             })
                
#         except Exception as e:
#             return Response(
#                 {"error": f"Communication error: {str(e)}"}, 
#                 status=status.HTTP_503_SERVICE_UNAVAILABLE
#             )
        
#     except Patient.DoesNotExist:
#         return Response(
#             {"error": "Patient not found"}, 
#             status=status.HTTP_404_NOT_FOUND
#         )


# @api_view(['GET'])
# def check_enrollment_status(request):
#     """Poll Arduino for enrollment status updates"""
#     fingerprint_id = request.query_params.get('fingerprint_id')
#     patient_id = request.query_params.get('patient_id')
    
#     if not fingerprint_id or not patient_id:
#         return Response(
#             {"error": "fingerprint_id and patient_id are required"}, 
#             status=status.HTTP_400_BAD_REQUEST
#         )
    
#     ser = get_or_create_serial()
#     if ser is None:
#         return Response(
#             {"error": "Arduino connection error"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )
    
#     try:
#         with active_serial_lock:
#             # Check if there's data waiting
#             if ser.in_waiting > 0:
#                 line = ser.readline().decode('utf-8').strip()
                
#                 if line:
#                     try:
#                         data = json.loads(line)
                        
#                         # If enrollment successful, save to database
#                         if data.get('status') == 'success':
#                             try:
#                                 patient = Patient.objects.get(patient_id=patient_id)
#                                 patient.fingerprint_id = fingerprint_id
#                                 patient.save()
                                
#                                 return Response({
#                                     "status": "success",
#                                     "fingerprint_id": fingerprint_id,
#                                     "message": "Fingerprint enrolled and saved to database"
#                                 })
#                             except Patient.DoesNotExist:
#                                 return Response(
#                                     {"error": "Patient not found"}, 
#                                     status=status.HTTP_404_NOT_FOUND
#                                 )
                        
#                         # Return current status from Arduino
#                         return Response(data)
                        
#                     except json.JSONDecodeError:
#                         # Return the raw message if not JSON
#                         return Response({
#                             "status": "waiting", 
#                             "message": line
#                         })
            
#             # No data available yet
#             return Response({
#                 "status": "waiting", 
#                 "message": "No update from sensor"
#             })
                
#     except Exception as e:
#         print(f"Error reading status: {e}")
#         return Response(
#             {"error": f"Error: {str(e)}"}, 
#             status=status.HTTP_500_INTERNAL_SERVER_ERROR
#         )

# @api_view(['DELETE'])
# def delete_fingerprint(request, patient_id):
#     """
#     Delete a patient's fingerprint from both database and sensor
#     """
#     try:
#         patient = Patient.objects.get(patient_id=patient_id)
        
#         if not patient.fingerprint_id:
#             return Response(
#                 {"error": "Patient has no fingerprint enrolled"}, 
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         fingerprint_id = patient.fingerprint_id
        
#         # Delete from sensor
#         try:
#             with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
#                 time.sleep(2)
                
#                 command = f"DELETE:{fingerprint_id}\n"
#                 ser.write(command.encode())
                
#                 time.sleep(1)
#                 if ser.in_waiting:
#                     response = ser.readline().decode('utf-8').strip()
#                     print(f"Arduino response: {response}")
        
#         except serial.SerialException as e:
#             print(f"Warning: Could not delete from sensor: {e}")
        
#         # Delete from database
#         patient.fingerprint_id = None
#         patient.save()
        
#         return Response({
#             "message": f"Fingerprint {fingerprint_id} deleted successfully",
#             "patient_id": patient_id
#         })
        
#     except Patient.DoesNotExist:
#         return Response(
#             {"error": "Patient not found"}, 
#             status=status.HTTP_404_NOT_FOUND
#         )


# @api_view(['GET'])
# def get_fingerprint_count(request):
#     """Get total number of enrolled fingerprints from sensor"""
#     try:
#         with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
#             time.sleep(2)
            
#             ser.write(b"COUNT\n")
#             time.sleep(1)
            
#             if ser.in_waiting:
#                 response = ser.readline().decode('utf-8').strip()
#                 try:
#                     data = json.loads(response)
#                     return Response(data)
#                 except json.JSONDecodeError:
#                     return Response({"error": "Invalid response from sensor"})
            
#             return Response({"error": "No response from sensor"})
            
#     except serial.SerialException as e:
#         return Response(
#             {"error": f"Arduino connection error: {str(e)}"}, 
#             status=status.HTTP_503_SERVICE_UNAVAILABLE
#         )

latest_vitals = {
    "temperature": None,
    "heart_rate": None,
    "spo2": None,
    "height": None,
}

@api_view(['POST'])
def start_vitals(request):
    """Trigger Arduino to measure temperature, heart rate, SpO2, height"""
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=3) as ser:
            time.sleep(2)  # Give Arduino time to reset
            ser.flushInput()
            ser.flushOutput()
            ser.write(b'START\n')
            time.sleep(1.5)

            line = ser.readline().decode('utf-8').strip()
            print("Raw serial data:", line)

            if not line:
                raise Exception("No data received from Arduino.")

            data = json.loads(line)
            latest_vitals["temperature"] = data.get("temperature")
            latest_vitals["heart_rate"] = data.get("heart_rate")
            latest_vitals["spo2"] = data.get("spo2")
            latest_vitals["height"] = data.get("height")

            return Response(latest_vitals)

    except Exception as e:
        print("Error reading vitals:", e)
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def fetch_temperature(request):
    """Fetch latest temperature from Arduino"""
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            line = ser.readline().decode('utf-8').strip()
            if not line:
                return Response({"error": "No data"}, status=404)

            data = json.loads(line)
            temperature = data.get("temperature")
            if temperature is not None:
                latest_vitals["temperature"] = float(temperature)
                print(f"🌡️ Temperature: {temperature}°C")
                return Response({"temperature": temperature})
            else:
                return Response({"error": "No temperature key"}, status=400)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def fetch_heart_rate(request):
    """Fetch latest heart rate from Arduino"""
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            line = ser.readline().decode('utf-8').strip()
            if not line:
                return Response({"error": "No data"}, status=404)

            data = json.loads(line)
            heart_rate = data.get("heart_rate")
            if heart_rate is not None:
                latest_vitals["heart_rate"] = int(heart_rate)
                print(f"❤️ Heart Rate: {heart_rate} bpm")
                return Response({"heart_rate": heart_rate})
            else:
                return Response({"error": "No heart_rate key"}, status=400)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def fetch_spo2(request):
    """Fetch latest oxygen saturation from Arduino"""
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            line = ser.readline().decode('utf-8').strip()
            if not line:
                return Response({"error": "No data"}, status=404)

            data = json.loads(line)
            spo2 = data.get("spo2")
            if spo2 is not None:
                latest_vitals["spo2"] = int(spo2)
                print(f"🫁 SpO2: {spo2}%")
                return Response({"spo2": spo2})
            else:
                return Response({"error": "No spo2 key"}, status=400)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
    

@api_view(['GET'])
def fetch_height(request):
    """Fetch latest height from Arduino"""
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            line = ser.readline().decode('utf-8').strip()
            if not line:
                return Response({"error": "No data"}, status=404)

            data = json.loads(line)
            height = data.get("height")
            if height is not None:
                latest_vitals["height"] = int(height)
                print(f"🫁 Height: {height}%")
                return Response({"height": height})
            else:
                return Response({"error": "No height key"}, status=400)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


# Create your views here.

class PatientViewSet(viewsets.ModelViewSet):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [AllowAny] 
    
    @action(detail=False, methods=['get'])  # Custom action to get patient by PIN
    def by_pin(self, request):  # GET /patients/by_pin/?pin=1234
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
    """
    Handles vital sign data (weight, height, heart_rate, etc.)
    Updates existing record for today if incomplete, or creates new one.
    """
    data = request.data
    patient_id = data.get('patient_id')

    if not patient_id:
        return Response({"error": "Missing patient_id"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        patient = Patient.objects.get(patient_id=patient_id)
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)

    # Try to find an existing record by ID (sent by frontend)
    vital_id = data.get('id')
    vital_signs = None

    if vital_id:
        try:
            vital_signs = VitalSigns.objects.get(id=vital_id, patient=patient)
        except VitalSigns.DoesNotExist:
            vital_signs = None

    # If no ID given, find today's incomplete record
    if not vital_signs:
        today = timezone.now().date()
        today_start = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        today_end = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.max.time()))

        vital_signs = (
            VitalSigns.objects.filter(
                patient=patient,
                date_time_recorded__range=(today_start, today_end)
            )
            .order_by('-date_time_recorded')
            .first()
        )

        # If we found one but it's already complete, reset so we can create a new one
        if vital_signs:
            all_filled = all([
                vital_signs.weight,
                vital_signs.height,
                vital_signs.heart_rate,
                vital_signs.temperature,
                vital_signs.oxygen_saturation,
                vital_signs.blood_pressure,
                
            ])
            if all_filled:
                vital_signs = None

    # If still none, create a fresh record
    if not vital_signs:
        vital_signs = VitalSigns.objects.create(
            patient=patient,
            date_time_recorded=timezone.now()
        )

    # --- Update only the provided fields ---
    for field in ['heart_rate', 'temperature', 'oxygen_saturation', 'weight', 'height', 'blood_pressure']:
        if field in data and data[field] is not None:
            setattr(vital_signs, field, data[field])

    vital_signs.date_time_recorded = timezone.now()
    vital_signs.save()
    
    all_vitals_complete = all([
        vital_signs.blood_pressure,
        vital_signs.heart_rate,
        vital_signs.temperature,
        vital_signs.oxygen_saturation,
        vital_signs.weight,
        vital_signs.height,
    ])
    
    if all_vitals_complete:
        # Check if patient is already in queue
        existing_queue = QueueEntry.objects.filter(patient=patient).first()
        
        if not existing_queue:
            # Compute priority based on vitals
            priority = compute_patient_priority(patient)
            
            # Add to queue
            QueueEntry.objects.create(
                patient=patient,
                priority=priority,
                entered_at=timezone.now()
            )   

    return Response({
        "message": "Vital signs saved successfully",
        "data": {
            "id": vital_signs.id,
            "patient_id": patient.patient_id,
            "heart_rate": vital_signs.heart_rate,
            "temperature": vital_signs.temperature,
            "oxygen_saturation": vital_signs.oxygen_saturation,
            "weight": vital_signs.weight,
            "height": vital_signs.height,
            "blood_pressure": vital_signs.blood_pressure,
            "timestamp": vital_signs.date_time_recorded,
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

@csrf_exempt
@api_view(['POST'])
def login(request):
    pin = request.data.get("pin")
    login_type = request.data.get("login_type")  # 'staff' or 'patient'
    username = request.data.get("username")  # For patient login

    if not pin:
        return Response({"error": "PIN required"}, status=status.HTTP_400_BAD_REQUEST)

    pin = str(pin).strip()
    
    if login_type == "staff":
        try:
            # Get all staff and check hashed PINs one by one
            staff_member = None
            for s in HCStaff.objects.all():
                if s.staff_pin and check_password(pin, s.staff_pin):
                    staff_member = s
                    break

            if not staff_member:
                return Response({"error": "Invalid staff PIN"}, status=status.HTTP_401_UNAUTHORIZED)

            # CREATE SESSION (server-side)
            request.session["user_id"] = staff_member.id
            request.session["user_type"] = "staff"
            request.session["name"] = staff_member.name

            return Response({
                "role": "staff",
                "name": staff_member.name,
                "staff_id": staff_member.staff_id if hasattr(staff_member, 'staff_id') else staff_member.id
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
    
@api_view(['GET'])
def get_patient_vitals(request):
    """Get current logged-in patient's vitals history"""
    user_type = request.session.get('user_type')
    
    if user_type != 'patient':
        return Response({"error": "Not authenticated as patient"}, status=status.HTTP_401_UNAUTHORIZED)
    
    patient_id = request.session.get('patient_id')
    
    try:
        patient = Patient.objects.get(patient_id=patient_id)
        
        # Get all vitals for this patient, ordered by most recent first
        vitals_queryset = VitalSigns.objects.filter(patient=patient).order_by('-date_time_recorded')
        
        # Get latest vitals (most recent)
        latest_vital = vitals_queryset.first()
        
        latest_data = None
        if latest_vital:
            # Calculate BMI if height and weight exist
            bmi_value = None
            if latest_vital.height and latest_vital.weight:
                height_m = latest_vital.height / 100  # Convert cm to meters
                bmi_value = round(latest_vital.weight / (height_m * height_m), 1)
            
            latest_data = {
                'heart_rate': latest_vital.heart_rate,
                'temperature': latest_vital.temperature,
                'spo2': latest_vital.oxygen_saturation,
                'blood_pressure': None,  # Add blood pressure fields to your model if needed
                'height': latest_vital.height,
                'weight': latest_vital.weight,
                'bmi': bmi_value
            }
        
        # Get history (all records)
        history_data = []
        for vital in vitals_queryset:
            history_data.append({
                'id': vital.id,
                'date': vital.date_time_recorded.strftime('%Y-%m-%d %H:%M'),
                'heart_rate': vital.heart_rate,
                'blood_pressure': None,  # Add blood pressure fields to your model if needed
                'temperature': vital.temperature,
                'spo2': vital.oxygen_saturation,
                'height': vital.height,
                'weight': vital.weight,
                'bmi': vital.bmi
            })
        
        return Response({
            'latest': latest_data,
            'history': history_data
        })
        
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)
    
@api_view(['GET'])
def get_vitals(request):
   # Add auth check if needed (e.g., permission_classes = [IsAuthenticated])
    patients = VitalSigns.objects.all()
    serializer = VitalSignsSerializer(patients, many=True)
    return Response(serializer.data)

@api_view(['GET'])
def get_patient_vitals_by_id(request, patient_id): # <-- NEW FUNCTION
    """Get a patient's vitals history using patient_id (for staff view)"""
    try:
        # 1. Use the provided patient_id to find the Patient object
        patient = Patient.objects.get(patient_id=patient_id)
        
        # 2. Get all vitals for this patient, ordered by most recent first
        vitals_queryset = VitalSigns.objects.filter(patient=patient).order_by('-date_time_recorded')
        
        latest_vital = vitals_queryset.first()
        latest_data = None
        
        if latest_vital:
            # Calculate BMI if height and weight exist
            bmi_value = None
            if latest_vital.height and latest_vital.weight:
                height_m = latest_vital.height / 100
                bmi_value = round(latest_vital.weight / (height_m * height_m), 1)
            
            # Map latest vitals data
            latest_data = {
                'heart_rate': latest_vital.heart_rate,
                'temperature': latest_vital.temperature,
                'oxygen_saturation': latest_vital.oxygen_saturation,
                'blood_pressure': latest_vital.blood_pressure, # ADDED: Ensure BP is included
                'height': latest_vital.height,
                'weight': latest_vital.weight,
                'bmi': bmi_value
            }
        
        # 3. Get history (all records)
        history_data = []
        for vital in vitals_queryset:
            bmi_value = None
            if vital.height and vital.weight:
                height_m = vital.height / 100
                bmi_value = round(vital.weight / (height_m * height_m), 1)

            history_data.append({
                'id': vital.id,
                'date': vital.date_time_recorded.strftime('%Y-%m-%d %H:%M'), 
                'heart_rate': vital.heart_rate,
                'blood_pressure': vital.blood_pressure,
                'temperature': vital.temperature,
                'oxygen_saturation': vital.oxygen_saturation,
                'height': vital.height,
                'weight': vital.weight,
                'bmi': bmi_value 
            })
        
        return Response({
            'latest': latest_data,
            'history': history_data
        })
        
    except Patient.DoesNotExist:
        return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)
# Remove the DUPLICATE QueueViewSet class and keep only this one:

class QueueViewSet(viewsets.ModelViewSet):
    queryset = QueueEntry.objects.all()
    serializer_class = QueueEntrySerializer
    permission_classes = [AllowAny]  # Restrict in production
    
    @action(detail=False, methods=['get'])
    def current_queue(self, request):
        """Get sorted queue: Prioritize by priority level, then entered_at (earliest first)."""
        queue = QueueEntry.objects.all().select_related('patient').annotate(
            priority_order=Case(
                When(priority='CRITICAL', then=1),
                When(priority='HIGH', then=2),
                When(priority='MEDIUM', then=3),
                default=4,
                output_field=IntegerField()
            )
        ).order_by('priority_order', 'entered_at')
        
        serializer = self.get_serializer(queue, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_complete(self, request, pk=None):
        """Mark a queue entry as complete/served"""
        try:
            queue_entry = self.get_object()
            queue_entry.delete()  # Or you can add a 'completed' field instead
            return Response({"message": "Patient marked as served"}, status=status.HTTP_200_OK)
        except QueueEntry.DoesNotExist:
            return Response({"error": "Queue entry not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
def logout(request):
    """Clear session"""
    request.session.flush()
    return Response({"message": "Logged out successfully"})

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
            Q(address__icontains=search_term) | 
            Q(patient_id__icontains=search_term)
        )
    
    patients_queryset = patients_queryset.order_by('patient_id')  # Changed from 'id' to 'patient_id'
    
    # Find the ID of the LATEST VitalSigns record for each patient
    # Note: VitalSigns still has an auto 'id' field, but links via 'patient' FK
    latest_vitals_map = VitalSigns.objects.filter(
        patient__in=patients_queryset
    ).values('patient').annotate(
        latest_id=Max('id')
    ).values_list('latest_id', flat=True)

    # Fetch the actual latest VitalSigns objects using their IDs
    latest_vitals = VitalSigns.objects.filter(id__in=latest_vitals_map)
    
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
    staff = None  # Get from session if needed
    reason = request.data.get('reason', 'No reason provided')
    
    success, message = archive_patient(patient_id, staff, reason)
    
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
        'archived_by': p.archived_by.name if p.archived_by else None,
        'archive_reason': p.archive_reason,
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

# Add this to your views.py
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
        
        # You could trigger websocket notifications here
        # or update a cache for frontend polling
        
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