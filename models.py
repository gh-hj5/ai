import json
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), nullable=True)
    school = db.Column(db.String(160), nullable=True)
    degree = db.Column(db.String(80), nullable=True)
    major = db.Column(db.String(120), nullable=True)
    graduation_year = db.Column(db.String(20), nullable=True)
    target_city = db.Column(db.String(120), nullable=True)
    target_industry = db.Column(db.String(120), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    resumes = db.relationship('Resume', backref='user', lazy=True, cascade='all, delete-orphan')
    interview_sessions = db.relationship(
        'InterviewSession',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan'
    )
    optimization_versions = db.relationship(
        'ResumeOptimizationVersion',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ResumeOptimizationVersion.created_at.desc()'
    )
    export_records = db.relationship(
        'ExportRecord',
        backref='user',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ExportRecord.created_at.desc()'
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'school': self.school,
            'degree': self.degree,
            'major': self.major,
            'graduation_year': self.graduation_year,
            'target_city': self.target_city,
            'target_industry': self.target_industry,
            'bio': self.bio,
            'created_at': self.created_at.isoformat()
        }


class Resume(db.Model):
    __tablename__ = 'resumes'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    content_text = db.Column(db.Text, nullable=True)
    analysis_result = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = db.relationship(
        'InterviewQuestion',
        backref='resume',
        lazy=True,
        cascade='all, delete-orphan'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'filename': self.filename,
            'content_text': self.content_text[:500] if self.content_text else None,
            'analysis_result': self.analysis_result,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class InterviewQuestion(db.Model):
    __tablename__ = 'interview_questions'

    id = db.Column(db.Integer, primary_key=True)
    resume_id = db.Column(db.Integer, db.ForeignKey('resumes.id'), nullable=False)
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'resume_id': self.resume_id,
            'question': self.question,
            'answer': self.answer,
            'category': self.category,
            'created_at': self.created_at.isoformat()
        }


class InterviewSession(db.Model):
    __tablename__ = 'interview_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False, default='问诊式求职分析')
    status = db.Column(db.String(30), nullable=False, default='in_progress')
    current_step = db.Column(db.Integer, nullable=False, default=0)
    profile_json = db.Column(db.Text, nullable=False, default='{}')
    summary = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    messages = db.relationship(
        'InterviewMessage',
        backref='session',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='InterviewMessage.created_at.asc()'
    )
    job_matches = db.relationship(
        'JobMatchAnalysis',
        backref='session',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='JobMatchAnalysis.created_at.desc()'
    )

    @property
    def profile(self):
        try:
            return json.loads(self.profile_json or '{}')
        except json.JSONDecodeError:
            return {}

    def set_profile(self, profile):
        self.profile_json = json.dumps(profile, ensure_ascii=False)

    def to_dict(self, include_messages=False):
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'status': self.status,
            'current_step': self.current_step,
            'profile': self.profile,
            'summary': self.summary,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }
        if include_messages:
            data['messages'] = [message.to_dict() for message in self.messages]
        return data


class InterviewMessage(db.Model):
    __tablename__ = 'interview_messages'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('interview_sessions.id'), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    question_key = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'question_key': self.question_key,
            'created_at': self.created_at.isoformat()
        }


class JobMatchAnalysis(db.Model):
    __tablename__ = 'job_match_analyses'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('interview_sessions.id'), nullable=False, index=True)
    job_title = db.Column(db.String(255), nullable=False)
    jd_text = db.Column(db.Text, nullable=False)
    match_score = db.Column(db.Integer, nullable=False, default=0)
    summary = db.Column(db.Text, nullable=True)
    strengths_json = db.Column(db.Text, nullable=False, default='[]')
    gaps_json = db.Column(db.Text, nullable=False, default='[]')
    suggestions_json = db.Column(db.Text, nullable=False, default='[]')
    keywords_json = db.Column(db.Text, nullable=False, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def _loads_list(raw_value):
        try:
            value = json.loads(raw_value or '[]')
        except json.JSONDecodeError:
            return []
        return value if isinstance(value, list) else []

    @staticmethod
    def _dumps_list(value):
        return json.dumps(value or [], ensure_ascii=False)

    @property
    def strengths(self):
        return self._loads_list(self.strengths_json)

    @property
    def gaps(self):
        return self._loads_list(self.gaps_json)

    @property
    def suggestions(self):
        return self._loads_list(self.suggestions_json)

    @property
    def keywords(self):
        return self._loads_list(self.keywords_json)

    def set_analysis(self, analysis):
        self.match_score = int(analysis.get('match_score', 0) or 0)
        self.summary = analysis.get('summary')
        self.strengths_json = self._dumps_list(analysis.get('strengths'))
        self.gaps_json = self._dumps_list(analysis.get('gaps'))
        self.suggestions_json = self._dumps_list(analysis.get('suggestions'))
        self.keywords_json = self._dumps_list(analysis.get('keywords'))

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'job_title': self.job_title,
            'jd_text': self.jd_text,
            'match_score': self.match_score,
            'summary': self.summary,
            'strengths': self.strengths,
            'gaps': self.gaps,
            'suggestions': self.suggestions,
            'keywords': self.keywords,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class ResumeOptimizationVersion(db.Model):
    __tablename__ = 'resume_optimization_versions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    resume_id = db.Column(db.Integer, db.ForeignKey('resumes.id'), nullable=False, index=True)
    session_id = db.Column(db.Integer, db.ForeignKey('interview_sessions.id'), nullable=True, index=True)
    job_match_id = db.Column(db.Integer, db.ForeignKey('job_match_analyses.id'), nullable=True, index=True)
    version_type = db.Column(db.String(50), nullable=False, default='general')
    title = db.Column(db.String(255), nullable=False)
    target_job_title = db.Column(db.String(255), nullable=True)
    content = db.Column(db.Text, nullable=False)
    summary = db.Column(db.Text, nullable=True)
    highlights_json = db.Column(db.Text, nullable=False, default='[]')
    status = db.Column(db.String(30), nullable=False, default='generated')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    resume = db.relationship('Resume', backref=db.backref(
        'optimization_versions',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ResumeOptimizationVersion.created_at.desc()'
    ))
    session = db.relationship('InterviewSession', backref=db.backref(
        'optimization_versions',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ResumeOptimizationVersion.created_at.desc()'
    ))
    job_match = db.relationship('JobMatchAnalysis', backref=db.backref(
        'optimization_versions',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ResumeOptimizationVersion.created_at.desc()'
    ))

    @property
    def highlights(self):
        return JobMatchAnalysis._loads_list(self.highlights_json)

    def set_highlights(self, highlights):
        self.highlights_json = JobMatchAnalysis._dumps_list(highlights)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'resume_id': self.resume_id,
            'session_id': self.session_id,
            'job_match_id': self.job_match_id,
            'version_type': self.version_type,
            'title': self.title,
            'target_job_title': self.target_job_title,
            'content': self.content,
            'summary': self.summary,
            'highlights': self.highlights,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class ExportRecord(db.Model):
    __tablename__ = 'export_records'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    optimization_version_id = db.Column(
        db.Integer,
        db.ForeignKey('resume_optimization_versions.id'),
        nullable=False,
        index=True
    )
    export_format = db.Column(db.String(20), nullable=False, default='txt')
    file_path = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    optimization_version = db.relationship('ResumeOptimizationVersion', backref=db.backref(
        'export_records',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ExportRecord.created_at.desc()'
    ))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'optimization_version_id': self.optimization_version_id,
            'export_format': self.export_format,
            'file_path': self.file_path,
            'created_at': self.created_at.isoformat()
        }


def run_schema_updates():
    inspector = inspect(db.engine)
    if 'users' not in inspector.get_table_names():
        return

    existing_user_columns = {column['name'] for column in inspector.get_columns('users')}
    required_user_columns = {
        'full_name': 'ALTER TABLE users ADD COLUMN full_name VARCHAR(120)',
        'school': 'ALTER TABLE users ADD COLUMN school VARCHAR(160)',
        'degree': 'ALTER TABLE users ADD COLUMN degree VARCHAR(80)',
        'major': 'ALTER TABLE users ADD COLUMN major VARCHAR(120)',
        'graduation_year': 'ALTER TABLE users ADD COLUMN graduation_year VARCHAR(20)',
        'target_city': 'ALTER TABLE users ADD COLUMN target_city VARCHAR(120)',
        'target_industry': 'ALTER TABLE users ADD COLUMN target_industry VARCHAR(120)',
        'bio': 'ALTER TABLE users ADD COLUMN bio TEXT',
    }

    with db.engine.begin() as connection:
        for column_name, ddl in required_user_columns.items():
            if column_name not in existing_user_columns:
                connection.execute(text(ddl))
