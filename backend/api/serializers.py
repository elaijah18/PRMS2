from .models import Patient, QueueEntry, VitalSigns
from rest_framework import serializers
import re 
from datetime import date
from django.contrib.auth.hashers import make_password
from django.utils import timezone

class PatientSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(read_only=True)
    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = ('patient_id',)
    
    def validate_contact(self, value):
        if not re.match(r'^\d{11}$', value):
            raise serializers.ValidationError("Contact number must be exactly 11 digits.")
        return value
    
    def validate_birthdate(self, value):
        if value > date.today():
            raise serializers.ValidationError("Birthdate cannot be in the future.")
        return value
    
    def validate_pin(self, value):
        # Don't validate if PIN is already hashed
        if value and value.startswith('pbkdf2_'):
            return value
            
        if not re.match(r'^\d{4}$', value): 
            raise serializers.ValidationError("PIN must be exactly 4 digits.")
        return value
    
    def update(self, instance, validated_data):
        """Only re-hash the PIN when a new raw 4-digit PIN is provided."""
        new_pin = validated_data.get('pin', None)

        if new_pin:
            # Only hash if it's a raw PIN (not already hashed)
            if not new_pin.startswith('pbkdf2_'):
                # Enforce 4-digit rule for raw PINs
                if not new_pin.isdigit() or len(new_pin) != 4:
                    raise serializers.ValidationError({"pin": "PIN must be 4 digits"})
                validated_data['pin'] = make_password(new_pin)
        else:
            # If PIN not in update data, preserve existing PIN
            validated_data.pop('pin', None)

        return super().update(instance, validated_data)
    
class VitalSignsSerializer(serializers.ModelSerializer): 
    class Meta:
        model = VitalSigns
        fields = '__all__'

class QueueEntrySerializer(serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    latest_vitals = serializers.SerializerMethodField()
    
    class Meta:
        model = QueueEntry
        fields = [
            'id', 
            'patient', 
            'priority_status', 
            'entered_at', 
            'queue_number', 
            'status',  # Include status
            'served_at',  # Include served_at
            'latest_vitals'
        ] 
    
    def get_latest_vitals(self, obj):
        """Get the latest vital signs for the patient in this queue entry"""
        from django.db.models import Max
        
        # Get today's date range
        today = timezone.now().date()
        today_start = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.min.time())
        )
        today_end = timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.max.time())
        )
        
        # Get latest vitals from today
        latest_vital = VitalSigns.objects.filter(
            patient=obj.patient,
            date_time_recorded__range=(today_start, today_end)
        ).order_by('-date_time_recorded').first()
        
        if not latest_vital:
            return None
        
        # Calculate BMI
        bmi_value = None
        if latest_vital.height and latest_vital.weight:
            height_m = latest_vital.height / 100
            bmi_value = round(latest_vital.weight / (height_m * height_m), 1)
        
        return {
            'heart_rate': latest_vital.heart_rate,
            'temperature': latest_vital.temperature,
            'oxygen_saturation': latest_vital.oxygen_saturation,
            'blood_pressure': latest_vital.blood_pressure,
            'height': latest_vital.height,
            'weight': latest_vital.weight,
            'bmi': bmi_value
        }