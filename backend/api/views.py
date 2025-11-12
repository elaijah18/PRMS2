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
from django.http import HttpResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from io import BytesIO
import json


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
    # Check if patient is already in queue TODAY with active status
        today = timezone.now().date()
        existing_queue = QueueEntry.objects.filter(
            patient=patient,
            entered_at__date=today,
            status__in=['WAITING', 'SERVING']
        ).first()
        
        if not existing_queue:
            # Compute priority based on vitals
            priority = compute_patient_priority(patient)
            
            # Add to queue
            QueueEntry.objects.create(
                patient=patient,
                priority_status=priority,
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
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['get'])
    def current_queue(self, request):
        """Get sorted queue: Only WAITING patients, prioritized by priority level, then entered_at."""
        queue = QueueEntry.objects.filter(
            status='WAITING'  # Only show waiting patients
        ).select_related('patient').annotate(
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
    
    @action(detail=False, methods=['get'])
    def all_today(self, request):
        """Get all queue entries for today (including completed)"""
        from django.utils import timezone
        today = timezone.now().date()
        
        queue = QueueEntry.objects.filter(
            entered_at__date=today
        ).select_related('patient').order_by('-entered_at')
        
        serializer = self.get_serializer(queue, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def completed_today(self, request):
        """Get completed queue entries for today"""
        from django.utils import timezone
        today = timezone.now().date()
        
        queue = QueueEntry.objects.filter(
            status='COMPLETED',
            entered_at__date=today
        ).select_related('patient').order_by('-served_at')
        
        serializer = self.get_serializer(queue, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_complete(self, request, pk=None):
        """Mark a queue entry as complete/served"""
        try:
            queue_entry = self.get_object()
            queue_entry.mark_completed()  # Use the model method
            return Response({
                "message": "Patient marked as served",
                "queue_number": queue_entry.queue_number,
                "served_at": queue_entry.served_at
            }, status=status.HTTP_200_OK)
        except QueueEntry.DoesNotExist:
            return Response(
                {"error": "Queue entry not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def mark_serving(self, request, pk=None):
        """Mark a queue entry as currently being served"""
        try:
            queue_entry = self.get_object()
            queue_entry.mark_serving()
            return Response({
                "message": "Patient marked as being served",
                "queue_number": queue_entry.queue_number
            }, status=status.HTTP_200_OK)
        except QueueEntry.DoesNotExist:
            return Response(
                {"error": "Queue entry not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a queue entry"""
        try:
            queue_entry = self.get_object()
            queue_entry.status = 'CANCELLED'
            queue_entry.save()
            return Response({
                "message": "Queue entry cancelled",
                "queue_number": queue_entry.queue_number
            }, status=status.HTTP_200_OK)
        except QueueEntry.DoesNotExist:
            return Response(
                {"error": "Queue entry not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )

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
        
"""
Add these functions to your views.py file
"""

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
                "printed_at": timezone.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "patient_info": {
                "patient_id": patient.patient_id,
                "name": f"{patient.first_name} {patient.middle_name or ''} {patient.last_name}".strip(),
                "age": None,
                "contact": patient.contact
            },
            "measurements": {
                "weight": f"{latest_vital.weight} kg" if latest_vital.weight else "—",
                "height": f"{latest_vital.height} cm" if latest_vital.height else "—",
                "bmi": f"{bmi_value} kg/m²" if bmi_value else "—",
                "heart_rate": f"{latest_vital.heart_rate} bpm" if latest_vital.heart_rate else "—",
                "temperature": f"{latest_vital.temperature} °C" if latest_vital.temperature else "—",
                "oxygen_saturation": f"{latest_vital.oxygen_saturation} %" if latest_vital.oxygen_saturation else "—",
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
                "recorded_at": latest_vital.date_time_recorded.strftime("%Y-%m-%d %H:%M:%S")
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
    y = draw_lr("Pulse Rate", measurements["heart_rate"], y)
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
                "printed_at": timezone.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "queue": {
                "number": str(queue_entry.queue_number).zfill(3),
                "priority": queue_entry.priority_status,
                "priority_code": get_priority_code(queue_entry.priority_status),
                "entered_at": queue_entry.entered_at.strftime("%H:%M:%S")
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