#!/usr/bin/env python3
"""
Simple HTTP server to serve the built Vite frontend from the dist/ folder.
Runs on port 8080 by default.
"""

import http.server
import socketserver
import os
import sys

PORT = 8080
DIST_DIR = "dist"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for API requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

if __name__ == "__main__":
    # Check if dist directory exists
    if not os.path.exists(DIST_DIR):
        print(f"ERROR: {DIST_DIR}/ directory not found!")
        print(f"Please run 'npm run build' first to create the production build.")
        sys.exit(1)
    
    # Change to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"Frontend server started on http://localhost:{PORT}")
        print(f"Serving files from: {os.path.abspath(DIST_DIR)}/")
        print("Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down frontend server...")
            sys.exit(0)
