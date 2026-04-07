from .models import Patient, QueueEntry, VitalSigns, HCStaff
from rest_framework import serializers
import re 
from datetime import date
from django.contrib.auth.hashers import make_password
from django.utils import timezone

class PatientSerializer(serializers.ModelSerializer):
    age = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    
    class Meta:
        model = Patient
        fields = [
            'patient_id', 'first_name', 'middle_name', 'last_name',
            'sex', 'contact', 'street', 'barangay', 'address',
            'username', 'birthdate', 'pin', 'fingerprint_id',
            'last_visit', 'age',
        ]
        read_only_fields = ('patient_id', 'age')
    
    # Address (may be street + barangay, can be changed)
    def get_age(self, obj):
        return obj.age  # calls the @property on the model
    
    def get_address(self, obj):
        """Compose address from street and barangay"""
        parts = []
        if obj.barangay:
            parts.append(obj.barangay.strip())
        if obj.street:
            parts.append(obj.street.strip())
        return ' '.join(parts) if parts else ''
    
    def to_internal_value(self, data):
        """Handle the address field when updating"""
        # If address is provided, try to split it into street and barangay
        if 'address' in data:
            address = data.pop('address', '').strip()
            if address:
                # Split the address: assume last word is street, rest is barangay
                parts = address.split()
                if len(parts) > 1:
                    data['street'] = ' '.join(parts[1:])
                    data['barangay'] = parts[0]
                else:
                    data['street'] = address
                    data['barangay'] = ''
            else:
                data['street'] = ''
                data['barangay'] = ''
        
        return super().to_internal_value(data)
    
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

# SERIALIZER FOR HC STAFF, ADDED DAHIL NEED DAW
class HCStaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = HCStaff
        fields = "__all__"
        extra_kwargs = {
            "staff_pin": {"write_only": True},
        }

    def validate_staff_pin(self, value):
        if value.startswith("pbkdf2_"):
            return value

        if not value.isdigit() or len(value) != 4:
            raise serializers.ValidationError("PIN must be exactly 4 digits.")

        return make_password(value)


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
        try:
            latest = VitalSigns.objects.filter(
                patient=obj.patient
            ).order_by('-date_time_recorded').first()
            if not latest:
                return None
            bmi = None
            if latest.height and latest.weight and latest.height > 0:
                h = latest.height / 100
                bmi = round(latest.weight / (h * h), 1)
            return {
                'heart_rate':        latest.heart_rate,
                'temperature':       latest.temperature,
                'oxygen_saturation': latest.oxygen_saturation,
                'blood_pressure':    latest.blood_pressure,
                'height':            latest.height,
                'weight':            latest.weight,
                'bmi':               bmi,
            }
        except Exception:
            return None
    