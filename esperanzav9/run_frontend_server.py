#!/usr/bin/env python
"""
Simple HTTP server for serving the React frontend
Serves static files from esperanzav9/dist on port 8080
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

class MyHTTPRequestHandler(SimpleHTTPRequestHandler):
    """Custom handler that serves index.html for all routes (SPA support)"""
    
    def end_headers(self):
        """Add headers to prevent caching during kiosk operation"""
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def do_GET(self):
        """Override GET to support SPA routing"""
        # Check if the file exists
        path = self.translate_path(self.path)
        
        if os.path.isdir(path) or not os.path.exists(path):
            # If it's a directory or file doesn't exist, serve index.html
            if not self.path.endswith('/'):
                # Redirect directories to have trailing slash
                if os.path.isdir(path):
                    self.send_response(301)
                    self.send_header('Location', self.path + '/')
                    self.end_headers()
                    return
            
            # Serve index.html for SPA routing
            self.path = '/index.html'
        
        return super().do_GET()
    
    def log_message(self, format, *args):
        """Simple logging"""
        print(f"[Frontend Server] {format % args}")

def run_server(port=8080):
    """Start the HTTP server"""
    try:
        # Change to dist directory
        dist_dir = os.path.join(os.path.dirname(__file__), 'dist')
        if not os.path.exists(dist_dir):
            print(f"[Frontend Server] ERROR: {dist_dir} not found!")
            print("[Frontend Server] Please run: npm run build")
            sys.exit(1)
        
        os.chdir(dist_dir)
        
        server_address = ('', port)
        httpd = HTTPServer(server_address, MyHTTPRequestHandler)
        print(f"[Frontend Server] Starting on http://localhost:{port}")
        print(f"[Frontend Server] Serving files from: {os.getcwd()}")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Frontend Server] Shutting down...")
        sys.exit(0)
    except Exception as e:
        print(f"[Frontend Server] Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    run_server(port=8080)
