from django.urls import path, include
from . import views
from rest_framework.routers import DefaultRouter
from .views import (PatientViewSet, VitalSignsViewSet, QueueViewSet, login, 
                    get_vitals, receive_vital_signs, update_vitals, get_all_patients, 
                    test_rpi_connection, logout, get_patient_profile, get_patient_vitals,
                    get_patient_vitals_by_id, archive_patient_view, restore_patient_view,
                    get_archived_patients, store_fingerprint, verify_fingerprint, 
                    start_fingerprint_enrollment,
                    check_enrollment_status, delete_fingerprint,
                    start_fingerprint_scan, check_fingerprint_match, stop_fingerprint_scan,
                    print_patient_vitals, print_queue_ticket, print_to_pos58, print_vitals_and_queue_pos58,
                    update_queue_display, get_current_queue_for_display
                )

router = DefaultRouter()
router.register(r'patients', PatientViewSet)
router.register(r'vitals', VitalSignsViewSet)
router.register(r'queue', QueueViewSet)

urlpatterns = [ 
    path('', include(router.urls)),    
    path('login/', login, name="login"),
    path('logout/', logout, name="logout"),
    path('patient/profile/', get_patient_profile, name='patient_profile'),
    path('patient/vitals/', get_patient_vitals, name='patient_vitals'), 
    path('patient/vitals/<str:patient_id>/', get_patient_vitals_by_id, name='patient_vitals_by_id'),
    path('all-patients/', get_all_patients, name='all_patients'),
    path('receive-vitals/', receive_vital_signs, name='receive_vitals'),
    path('update-vitals/<str:patient_id>', update_vitals, name='update_vitals'),
    
    path('test-connection/', test_rpi_connection, name='test_connection'),
    path('archive-patient/<str:patient_id>/', archive_patient_view, name='archive_patient'),
    path('restore-patient/<str:patient_id>/', restore_patient_view, name='restore_patient'),
    path('archived-patients/', get_archived_patients, name='archived_patients'),
    path('store-fingerprint/', store_fingerprint, name='store_fingerprint'),
    path('verify-fingerprint/', verify_fingerprint, name='verify_fingerprint'),
    
    path('start_vitals/', views.start_vitals, name='start_vitals'),
    path('fetch_temperature/', views.fetch_temperature, name='fetch_temperature'),
    path('fetch_heart_rate/', views.fetch_pulse_rate, name='fetch_heart_rate'),
    path('fetch_spo2/', views.fetch_spo2, name='fetch_spo2'),
    path('fetch_height/', views.fetch_height, name='fetch_height'),
    path('fetch_weight/', views.fetch_weight, name='fetch_weight'),
    
    path('fingerprint/enroll/', start_fingerprint_enrollment, name='start_fingerprint_enrollment'),
    path('fingerprint/status/', check_enrollment_status, name='check_enrollment_status'),
    path('fingerprint/delete/<str:patient_id>/', delete_fingerprint, name='delete_fingerprint'),
    path('fingerprint/scan/', start_fingerprint_scan, name='start_fingerprint_scan'),
    path('fingerprint/match/', check_fingerprint_match, name='check_fingerprint_match'),
    path('fingerprint/stop/', stop_fingerprint_scan, name='stop_fingerprint_scan'),
    path('fingerprint/match/notify/', views.fingerprint_match_notification, name='fingerprint_match_notification'),
    
    path('print/vitals/<str:patient_id>/', views.print_patient_vitals, name='print_patient_vitals'),
    path('print/queue-ticket/', views.print_queue_ticket, name='print_queue_ticket'),
    path('print-vitals/<str:patient_id>/', print_patient_vitals, name='print_vitals'),
    path('print-vitals/', print_patient_vitals, name='print_vitals_post'),  
    path('print-queue-ticket/', print_queue_ticket, name='print_queue_ticket'),
    path("print-pos58/", print_to_pos58, name='print_to_pos58'),
    path("print-vitals-and-queue/", print_vitals_and_queue_pos58),
    
    path('update-display/', update_queue_display, name='update_queue_display'),
    path('current-display/', get_current_queue_for_display, name='get_current_queue_display')
]




