import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / '.env.local', override=False)


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///resume_assistant.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = 'uploads'
    EXPORT_FOLDER = 'exports'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'pdf', 'docx'}

    LLM_PROVIDER = os.environ.get('LLM_PROVIDER', 'openrouter').strip().lower()
    LLM_API_KEY = os.environ.get('LLM_API_KEY', '').strip()
    LLM_CHAT_MODEL = os.environ.get('LLM_CHAT_MODEL', 'openrouter/free').strip()
    LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'https://openrouter.ai/api/v1').rstrip('/')
    LLM_REFERER = os.environ.get('LLM_REFERER', 'http://localhost:5000').strip()
    LLM_APP_NAME = os.environ.get('LLM_APP_NAME', 'AI Resume Assistant').strip()

    INTERVIEW_MAX_FOLLOW_UPS = int(os.environ.get('INTERVIEW_MAX_FOLLOW_UPS', '2'))
    INTERVIEW_USE_LLM = os.environ.get('INTERVIEW_USE_LLM', 'true').lower() == 'true'

    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-in-production'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
