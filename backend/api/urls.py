from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (PatientViewSet, VitalSignsViewSet, QueueViewSet, login, 
                    get_vitals, receive_vital_signs, update_vitals, get_all_patients, 
                    test_rpi_connection, logout, get_patient_profile, get_patient_vitals,
                    get_patient_vitals_by_id, archive_patient_view, restore_patient_view,
                    get_archived_patients, store_fingerprint, verify_fingerprint)

router = DefaultRouter()
router.register(r'patients', PatientViewSet)
router.register(r'vitals', VitalSignsViewSet)
router.register(r'queue', QueueViewSet)

urlpatterns = [ # endpoints
    path('login/', login, name="login"),
    path('logout/', logout, name="logout"),
    path('patient/profile/', get_patient_profile, name='patient_profile'),
    path('patient/vitals/', get_patient_vitals, name='patient_vitals'), 
    path('patient/vitals/<str:patient_id>/', get_patient_vitals_by_id, name='patient_vitals_by_id'),
    path('', include(router.urls)), # includes the viewsets for patients and vitals
    path('all-patients/', get_all_patients, name='all_patients'),
    path('receive-vitals/', receive_vital_signs, name='receive_vitals'),
    path('update-vitals/<str:patient_id>', update_vitals, name='update_vitals'),
    path('get-vitals/', get_vitals, name='get_vitals'),
    path('test-connection/', test_rpi_connection, name='test_connection'),
    path('archive-patient/<str:patient_id>/', archive_patient_view, name='archive_patient'),
    path('restore-patient/<str:patient_id>/', restore_patient_view, name='restore_patient'),
    path('archived-patients/', get_archived_patients, name='archived_patients'),
    path('store-fingerprint/', store_fingerprint, name='store_fingerprint'),
    path('verify-fingerprint/', verify_fingerprint, name='verify_fingerprint'),

    # path('rpi/data/', receive_vital_signs, name='receive_vital_signs'),
    
]
