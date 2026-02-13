#!/usr/bin/env python
"""
Django backend auto-starter for kiosk mode
Starts Django development server on port 8000
"""
import os
import sys
from pathlib import Path

# Change to the backend directory (where manage.py is)
backend_dir = Path(__file__).parent
os.chdir(backend_dir)
sys.path.insert(0, str(backend_dir))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Import Django management after setup
from django.core.management import execute_from_command_line

if __name__ == '__main__':
    # Run the development server on all interfaces, port 8000
    # Change 0.0.0.0 to 127.0.0.1 if you want local-only access
    sys.argv = [
        'manage.py',
        'runserver',
        '0.0.0.0:8000',
        '--nothreading'
    ]
    try:
        execute_from_command_line(sys.argv)
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)
