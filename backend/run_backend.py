#!/usr/bin/env python3
"""
Django backend server runner for Esperanza Kiosk.
Runs the Django development server on port 8000.
"""

import os
import sys
import subprocess

PORT = 8000

if __name__ == "__main__":
    # Change to the script's directory (backend folder)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    print(f"Starting Django backend server on http://localhost:{PORT}")
    print("Press Ctrl+C to stop the server")
    print("-" * 60)
    
    try:
        # Run Django development server
        subprocess.run([
            sys.executable,  # Use the current Python interpreter
            "manage.py",
            "runserver",
            f"0.0.0.0:{PORT}",
            "--noreload"  # Disable auto-reload for kiosk mode
        ])
    except KeyboardInterrupt:
        print("\nShutting down backend server...")
        sys.exit(0)
