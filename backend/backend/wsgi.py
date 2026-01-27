# """
# WSGI config for backend project.

# It exposes the WSGI callable as a module-level variable named ``application``.

# For more information, see:
# https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
# """

# import os
# from django.core.wsgi import get_wsgi_application
# from dotenv import load_dotenv

# # Load environment variables from .env file
# load_dotenv()

# # Determine environment (default = development)
# app_env = os.getenv("APP_ENV", "development").lower()

# if app_env == "production":
#     settings_module = "backend.settings.prod"
# else:
#     settings_module = "backend.settings.dev"

# os.environ.setdefault("DJANGO_SETTINGS_MODULE", settings_module)

# application = get_wsgi_application()

"""
WSGI config for backend project.
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

application = get_wsgi_application()