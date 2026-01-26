#!/bin/bash
# Entrypoint script for Railway deployment
# Handles PORT environment variable properly

# Use PORT environment variable if set, otherwise default to 5000
PORT=${PORT:-5000}

# Start Gunicorn
exec gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app:app
