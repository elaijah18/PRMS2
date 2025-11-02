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
    for field in ['heart_rate', 'temperature', 'oxygen_saturation', 'weight', 'height']:
        if field in data and data[field] is not None:
            setattr(vital_signs, field, data[field])

    vital_signs.date_time_recorded = timezone.now()
    vital_signs.save()
    
    all_vitals_complete = all([
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
    """
    patients_queryset = Patient.objects.all().order_by('id')
    
    # 1. Efficiently find the ID of the LATEST VitalSigns record for each patient
    latest_vitals_map = VitalSigns.objects.filter(
        patient__in=patients_queryset
    ).values('patient').annotate(
        latest_id=Max('id')
    ).values_list('latest_id', flat=True)

    # 2. Fetch the actual latest VitalSigns objects using their IDs
    latest_vitals = VitalSigns.objects.filter(id__in=latest_vitals_map)
    # Map them by patient_id (database ID) for easy lookup
    vitals_dict = {v.patient_id: v for v in latest_vitals}

    # 3. Serialize patients
    serializer = PatientSerializer(patients_queryset, many=True)
    
    data = serializer.data
    
    # 4. Inject latest_vitals data into the serialized output
    for patient_data in data:
        patient_db_id = patient_data['id'] 
        vital = vitals_dict.get(patient_db_id)
        
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

 