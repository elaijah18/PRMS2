from django.db import models, IntegrityError, transaction
from django.utils import timezone
from datetime import date
from .utils import compute_patient_priority
from django.contrib.auth.hashers import make_password, check_password

class HCStaff(models.Model):
    name = models.CharField(max_length=50)
    staff_pin = models.CharField(max_length=255, unique=True)
    
    def set_pin(self, raw_pin):
        """Hashes and sets the staff PIN."""
        self.staff_pin = make_password(raw_pin)

    def check_pin(self, raw_pin):
        """Verifies a raw PIN against the stored hash."""
        return check_password(raw_pin, self.staff_pin)

    def save(self, *args, **kwargs):
        # Hash the PIN if it’s not already hashed
        if self.staff_pin and not self.staff_pin.startswith('pbkdf2_'):
            self.staff_pin = make_password(self.staff_pin)
        super().save(*args, **kwargs)

class Patient(models.Model):    
    patient_id = models.CharField(max_length=15, unique=True, primary_key=True)
    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, null=True, blank=True)
    last_name = models.CharField(max_length=50)
    sex = models.CharField(max_length=6, choices=[('Male', 'Male'), ('Female', 'Female')])
    contact = models.CharField(max_length=11, default='N/A')
    address = models.TextField(max_length=300)
    username = models.CharField(max_length=20, null=True, blank=True, unique=True)
    birthdate = models.DateField(null=True, blank=True)
    pin = models.CharField(max_length=255)
    fingerprint_id = models.CharField(max_length=4, null=True, blank=True, unique=True)
    last_visit = models.DateTimeField(null=True, blank=True)
        
    def set_pin(self, raw_pin):
        self.pin = make_password(raw_pin)

    def check_pin(self, raw_pin):
        return check_password(raw_pin, self.pin)
    
    @property
    def age(self):
        """Calculates age based on birthdate and today's date."""
        if self.birthdate:
            today = date.today()
            # Calculate the age: today.year - birthdate.year
            # Subtract 1 if the current date is before the birthday this year
            return today.year - self.birthdate.year - ((today.month, today.day) < (self.birthdate.month, self.birthdate.day))
        return None

    def save(self, *args, **kwargs):
        if not self.patient_id:
            today = timezone.now().date()
            yyyymmdd = today.strftime("%Y%m%d")

            # Keep trying until unique ID found
            for i in range(1, 1000):  # allows up to 999 per day
                candidate_id = f"P-{yyyymmdd}-{i:03d}"
                if not Patient.objects.filter(patient_id=candidate_id).exists():
                    self.patient_id = candidate_id
                    break
            
        # Hash the PIN if it's not already hashed
        if self.pin and not self.pin.startswith('pbkdf2_'):
            self.pin = make_password(self.pin)
            
          # set last_visit on first creation
        if not self.last_visit:
            self.last_visit = timezone.now()

        super().save(*args, **kwargs)

    def is_senior(self):
        """Helper: Check if patient is senior (age >= 65)."""
        return self.age is not None and self.age >= 65

class VitalSigns(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='vital_signs')
    device_id = models.CharField(max_length=50, null=True, blank=True)
    date_time_recorded = models.DateTimeField(auto_now_add=True)
    heart_rate = models.IntegerField(null=True, blank=True)  # bpm
    temperature = models.FloatField(null=True, blank=True)  # °C
    oxygen_saturation = models.FloatField(null=True, blank=True)  # %
    blood_pressure = models.CharField(null=True, blank=True, max_length=7)  # mmHg
    height = models.FloatField(null=True, blank=True)  # cm (centimeters)
    weight = models.FloatField(null=True, blank=True)  # kg
    bmi = models.FloatField(null=True, blank=True)
    
    def save(self, *args, **kwargs):
        """Auto-compute BMI if height and weight are provided"""
        # Compute BMI if height (in cm) and weight (in kg) are provided
        if self.height and self.weight and self.height > 0:
            # Convert height from cm to meters
            height_m = self.height / 100
            # Calculate BMI: weight (kg) / (height in meters)²
            self.bmi = round(self.weight / (height_m ** 2), 1)
        
        super().save(*args, **kwargs)

from django.db import models
from django.utils import timezone

class QueueEntry(models.Model):
    STATUS_CHOICES = [
        ('WAITING', 'Waiting'),
        ('SERVING', 'Currently Being Served'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    PRIORITY_CHOICES = [
        ('CRITICAL', 'Critical'),
        ('HIGH', 'High'),
        ('MEDIUM', 'Medium'),
        ('NORMAL', 'Normal'),
    ]
    
    patient = models.ForeignKey('Patient', on_delete=models.CASCADE, related_name='queue_entries')
    priority_status = models.CharField(max_length=10, choices=PRIORITY_CHOICES, null=True, blank=True)
    entered_at = models.DateTimeField(default=timezone.now)
    queue_number = models.CharField(max_length=10, null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='WAITING')
    served_at = models.DateTimeField(null=True, blank=True)  # Track when completed
    
    class Meta:
        ordering = ['-entered_at']
    
    def save(self, *args, **kwargs):
        # UPDATE LAST VISIT when entering queue
        self.patient.last_visit = timezone.now()
        self.patient.save()
        
        # Auto-compute priority on save (if not set)
        if not self.priority:
            from .utils import compute_patient_priority
            self.priority = compute_patient_priority(self.patient)
        
        # Assign queue number based on priority
        if not self.queue_number:
            today = timezone.now().date()
            
            # Determine if this is a priority patient
            is_priority = self.priority in ['CRITICAL', 'HIGH', 'MEDIUM']
            
            if is_priority:
                # Priority patients: 300-999
                # Find the highest priority queue number today (including completed ones)
                highest_priority = QueueEntry.objects.filter(
                    entered_at__date=today,
                    queue_number__gte='300',
                    queue_number__lte='999'
                ).order_by('-queue_number').first()
                
                if highest_priority and highest_priority.queue_number:
                    try:
                        next_num = int(highest_priority.queue_number) + 1
                        # If we've exceeded 999, wrap to 300
                        if next_num > 999:
                            next_num = 300
                    except ValueError:
                        next_num = 300
                else:
                    next_num = 300
                
                self.queue_number = str(next_num)
            else:
                # Normal patients: 001-299
                # Find the highest normal queue number today (including completed ones)
                highest_normal = QueueEntry.objects.filter(
                    entered_at__date=today,
                    queue_number__gte='001',
                    queue_number__lte='299'
                ).order_by('-queue_number').first()
                
                if highest_normal and highest_normal.queue_number:
                    try:
                        next_num = int(highest_normal.queue_number) + 1
                        # If we've exceeded 299, wrap to 001
                        if next_num > 299:
                            next_num = 1
                    except ValueError:
                        next_num = 1
                else:
                    next_num = 1
                
                self.queue_number = f"{next_num:03d}"
        
        super().save(*args, **kwargs)
    
    def mark_completed(self):
        """Mark this queue entry as completed"""
        self.status = 'COMPLETED'
        self.served_at = timezone.now()
        self.save()
    
    def mark_serving(self):
        """Mark this queue entry as currently being served"""
        self.status = 'SERVING'
        self.save()

        
              
class ArchivedPatient(models.Model):
    patient_id = models.CharField(max_length=15, primary_key=True)
    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, null=True, blank=True)
    last_name = models.CharField(max_length=50)
    sex = models.CharField(max_length=6)
    contact = models.CharField(max_length=11)
    address = models.TextField(max_length=300)
    username = models.CharField(max_length=20, null=True, blank=True)
    birthdate = models.DateField(null=True, blank=True)
    pin = models.CharField(max_length=255)
    fingerprint_id = models.CharField(max_length=4, null=True, blank=True)
    fingerprint_template = models.BinaryField(null=True, blank=True)
    last_visit = models.DateTimeField(null=True, blank=True)
    
    # Archive metadata
    archived_at = models.DateTimeField(auto_now_add=True)
    archived_by = models.ForeignKey(HCStaff, on_delete=models.SET_NULL, null=True)
    archive_reason = models.TextField(null=True, blank=True)
    original_created_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'archived_patient'
        verbose_name = 'Archived Patient'

class ArchivedVitalSigns(models.Model):
    # Link to archived patient
    patient = models.ForeignKey(ArchivedPatient, on_delete=models.CASCADE, related_name='vital_signs')
    
    # Copy all VitalSigns fields
    device_id = models.CharField(max_length=50, null=True, blank=True)
    date_time_recorded = models.DateTimeField()
    heart_rate = models.IntegerField(null=True, blank=True)
    temperature = models.FloatField(null=True, blank=True)
    oxygen_saturation = models.FloatField(null=True, blank=True)
    blood_pressure = models.IntegerField(null=True, blank=True)
    height = models.FloatField(null=True, blank=True)
    weight = models.FloatField(null=True, blank=True)
    bmi = models.FloatField(null=True, blank=True)
    
    # Archive metadata
    archived_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'archived_vital_signs'

class ArchivedQueueEntry(models.Model):
    patient = models.ForeignKey(ArchivedPatient, on_delete=models.CASCADE, related_name='queue_entries')
    
    priority_status = models.CharField(max_length=10)
    entered_at = models.DateTimeField()
    queue_number = models.CharField(max_length=10)
    
    # Archive metadata
    archived_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'archived_queue_entry'

# In models.py or utils.py
from django.db import transaction

@transaction.atomic
def archive_patient(patient_id, staff=None, reason=None):
    """
    Archive a patient and all their related records.
    This moves data from active tables to archive tables.
    """
    try:
        # Check if patient is already archived
        if ArchivedPatient.objects.filter(patient_id=patient_id).exists():
            return False, f"Patient {patient_id} is already archived"
        
        # Get the patient
        patient = Patient.objects.get(patient_id=patient_id)
        
        # Create archived patient record
        archived_patient = ArchivedPatient.objects.create(
            patient_id=patient.patient_id,
            first_name=patient.first_name,
            middle_name=patient.middle_name,
            last_name=patient.last_name,
            sex=patient.sex,
            contact=patient.contact,
            address=patient.address,
            username=patient.username,
            birthdate=patient.birthdate,
            pin=patient.pin,
            fingerprint_id=patient.fingerprint_id,
            last_visit=patient.last_visit,
            archived_by=staff,
            archive_reason=reason,
            original_created_at=timezone.now(),
        )
        
        # Archive all vital signs
        vitals = VitalSigns.objects.filter(patient=patient)
        for vital in vitals:
            ArchivedVitalSigns.objects.create(
                patient=archived_patient,
                device_id=vital.device_id,
                date_time_recorded=vital.date_time_recorded,
                heart_rate=vital.heart_rate,
                temperature=vital.temperature,
                oxygen_saturation=vital.oxygen_saturation,
                blood_pressure=vital.blood_pressure,
                height=vital.height,
                weight=vital.weight,
                bmi=vital.bmi,
            )
        
        # Archive queue entries
        queue_entries = QueueEntry.objects.filter(patient=patient)
        for entry in queue_entries:
            ArchivedQueueEntry.objects.create(
                patient=archived_patient,
                priority=entry.priority,
                entered_at=entry.entered_at,
                queue_number=entry.queue_number,
            )
        
        # Delete from active tables (CASCADE will delete related records)
        patient.delete()
        
        return True, f"Patient {patient_id} archived successfully"
        
    except Patient.DoesNotExist:
        return False, f"Patient {patient_id} not found"
    except Exception as e:
        return False, f"Error archiving patient: {str(e)}"


@transaction.atomic
def restore_patient(patient_id):
    """
    Restore an archived patient back to active tables.
    """
    try:
        # Get archived patient
        archived_patient = ArchivedPatient.objects.get(patient_id=patient_id)
        
        # Check if patient already exists in active table
        if Patient.objects.filter(patient_id=patient_id).exists():
            return False, f"Patient {patient_id} already exists in active records"
        
        # Restore to Patient table
        patient = Patient.objects.create(
            patient_id=archived_patient.patient_id,
            first_name=archived_patient.first_name,
            middle_name=archived_patient.middle_name,
            last_name=archived_patient.last_name,
            sex=archived_patient.sex,
            contact=archived_patient.contact,
            address=archived_patient.address,
            username=archived_patient.username,
            birthdate=archived_patient.birthdate,
            pin=archived_patient.pin,
            fingerprint_id=archived_patient.fingerprint_id,
            last_visit=archived_patient.last_visit,
        )
        
        # Restore vital signs
        archived_vitals = ArchivedVitalSigns.objects.filter(patient=archived_patient)
        for vital in archived_vitals:
            VitalSigns.objects.create(
                patient=patient,
                device_id=vital.device_id,
                date_time_recorded=vital.date_time_recorded,
                heart_rate=vital.heart_rate,
                temperature=vital.temperature,
                oxygen_saturation=vital.oxygen_saturation,
                blood_pressure=vital.blood_pressure,
                height=vital.height,
                weight=vital.weight,
                bmi=vital.bmi,
            )
        
        # Delete from archive
        archived_patient.delete()
        
        return True, f"Patient {patient_id} restored successfully"
        
    except ArchivedPatient.DoesNotExist:
        return False, f"Archived patient {patient_id} not found"
    except Exception as e:
        return False, f"Error restoring patient: {str(e)}"