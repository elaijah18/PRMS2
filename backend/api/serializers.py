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
    
    def validate_patient_pin(self, value):  # CHANGED: pin -> patient_pin
        # Don't validate if PIN is already hashed
        if value and value.startswith('pbkdf2_'):
            return value
            
        if not re.match(r'^\d{4}$', value): 
            raise serializers.ValidationError("PIN must be exactly 4 digits.")
        return value
    
    def update(self, instance, validated_data):
        """Only re-hash the PIN when a new raw 4-digit PIN is provided."""
        new_pin = validated_data.get('patient_pin', None)  # CHANGED: pin -> patient_pin

        if new_pin:
            # Only hash if it's a raw PIN (not already hashed)
            if not new_pin.startswith('pbkdf2_'):
                # Enforce 4-digit rule for raw PINs
                if not new_pin.isdigit() or len(new_pin) != 4:
                    raise serializers.ValidationError({"patient_pin": "PIN must be 4 digits"})
                validated_data['patient_pin'] = make_password(new_pin)
        else:
            # If PIN not in update data, preserve existing PIN
            validated_data.pop('patient_pin', None)

        return super().update(instance, validated_data)
    
class VitalSignsSerializer(serializers.ModelSerializer): 
    bmi = serializers.FloatField(read_only=True)  # ADDED: Include BMI property
    
    class Meta:
        model = VitalSigns
        fields = '__all__'

class QueueEntrySerializer(serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    latest_vitals = serializers.SerializerMethodField()
    
    class Meta:
        model = QueueEntry
        fields = [
            'queue_id',  # CHANGED: id -> queue_id (matches model primary key)
            'patient', 
            'priority_status', 
            'entered_at', 
            'queue_number', 
            'status',
            'served_at',
            'latest_vitals'
        ] 
    
    def get_latest_vitals(self, obj):
        """Get the latest vital signs for the patient (most recent, any date)"""
        latest_vital = VitalSigns.objects.filter(
            patient=obj.patient
        ).order_by('-date_time_recorded').first()
        
        if not latest_vital:
            return None
        
        return {
            'pulse_rate': latest_vital.pulse_rate,
            'temperature': latest_vital.temperature,
            'oxygen_saturation': latest_vital.oxygen_saturation,
            'blood_pressure': latest_vital.blood_pressure,
            'height': latest_vital.height,
            'weight': latest_vital.weight,
            'bmi': latest_vital.bmi
        }