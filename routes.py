import os
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file

from ai_service import analyze_resume, generate_interview_questions
from config import Config
from export_service import export_optimization
from interview_ai_service import evaluate_answer
from job_match_service import analyze_job_match
from interview_service import (
    PROFILE_FIELDS,
    QUESTION_FLOW,
    advance_to_next_step,
    build_completion_message,
    build_completion_summary,
    build_continue_message,
    build_follow_up_message,
    build_opening_message,
    build_question_message,
    build_transition_message,
    can_trigger_follow_up,
    get_active_question,
    initialize_profile,
    merge_answer,
    merge_profile_updates,
    set_follow_up_question,
    stay_on_current_step,
)
from llm_client import llm_enabled, test_llm_connection
from models import (
    ExportRecord,
    InterviewMessage,
    InterviewQuestion,
    InterviewSession,
    JobMatchAnalysis,
    Resume,
    ResumeOptimizationVersion,
    User,
    db,
)
from resume_optimization_service import VERSION_TYPES, generate_resume_optimization
from utils import allowed_file, extract_text_from_file, save_uploaded_file

api = Blueprint('api', __name__)


def error_response(message, status_code=400):
    return jsonify({'error': message}), status_code


def get_user_or_error(user_id):
    user = User.query.get(user_id)
    if not user:
        return None, error_response('用户不存在', 404)
    return user, None


def get_session_or_error(session_id):
    session = InterviewSession.query.get(session_id)
    if not session:
        return None, error_response('问诊任务不存在', 404)
    return session, None


def get_resume_or_error(resume_id):
    resume = Resume.query.get(resume_id)
    if not resume:
        return None, error_response('简历不存在', 404)
    return resume, None


def get_job_match_or_error(job_match_id):
    job_match = JobMatchAnalysis.query.get(job_match_id)
    if not job_match:
        return None, error_response('岗位匹配结果不存在', 404)
    return job_match, None


def get_optimization_or_error(version_id):
    version = ResumeOptimizationVersion.query.get(version_id)
    if not version:
        return None, error_response('优化版本不存在', 404)
    return version, None


def get_export_record_or_error(record_id):
    record = ExportRecord.query.get(record_id)
    if not record:
        return None, error_response('导出记录不存在', 404)
    return record, None


def session_payload(session):
    next_question = get_active_question(session.profile) if session.status == 'in_progress' else None
    return {
        'session': session.to_dict(include_messages=True),
        'next_question': next_question,
        'profile_fields': PROFILE_FIELDS,
        'job_matches': [match.to_dict() for match in session.job_matches]
    }


def ensure_resume_owner(resume, user_id):
    if resume.user_id != user_id:
        return error_response('无权操作这份简历', 403)
    return None


def ensure_session_owner(session, user_id):
    if session.user_id != user_id:
        return error_response('无权操作这个问诊任务', 403)
    return None


def ensure_resume_has_text(resume):
    if (resume.content_text or '').strip():
        return resume.content_text
    if not resume.file_path or not os.path.exists(resume.file_path):
        return ''

    extracted = extract_text_from_file(resume.file_path)
    resume.content_text = extracted
    db.session.commit()
    return extracted


@api.route('/llm-status', methods=['GET'])
def get_llm_status():
    return jsonify({
        'enabled': llm_enabled(),
        'provider': Config.LLM_PROVIDER,
        'model': Config.LLM_CHAT_MODEL
    }), 200


@api.route('/llm-test', methods=['POST'])
def run_llm_test():
    try:
        if not llm_enabled():
            return error_response('当前未配置可用的大模型 API Key，请先检查 .env.local 中的 LLM_API_KEY')
        return jsonify({
            'message': '大模型连接测试成功',
            **test_llm_connection()
        }), 200
    except Exception as exc:
        return error_response(f'大模型连接测试失败: {exc}', 500)


@api.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        if not data:
            return error_response('请求数据不能为空')

        username = data.get('username')
        email = data.get('email')
        password = data.get('password')

        if not username or not email or not password:
            return error_response('用户名、邮箱和密码都是必填项')

        if User.query.filter_by(username=username).first():
            return error_response('用户名已存在')

        if User.query.filter_by(email=email).first():
            return error_response('邮箱已被注册')

        user = User(username=username, email=email)
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        return jsonify({'message': '注册成功', 'user': user.to_dict()}), 201
    except Exception as exc:
        db.session.rollback()
        return error_response(f'注册失败: {exc}', 500)


@api.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return error_response('请求数据不能为空')

        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return error_response('用户名和密码都是必填项')

        user = User.query.filter((User.username == username) | (User.email == username)).first()
        if not user or not user.check_password(password):
            return error_response('用户名或密码错误', 401)

        return jsonify({'message': '登录成功', 'user': user.to_dict()}), 200
    except Exception as exc:
        return error_response(f'登录失败: {exc}', 500)


@api.route('/profile/<int:user_id>', methods=['GET'])
def get_user_profile(user_id):
    try:
        user, error = get_user_or_error(user_id)
        if error:
            return error
        return jsonify({'user': user.to_dict()}), 200
    except Exception as exc:
        return error_response(f'获取用户资料失败: {exc}', 500)


@api.route('/profile/<int:user_id>', methods=['PATCH'])
def update_user_profile(user_id):
    try:
        user, error = get_user_or_error(user_id)
        if error:
            return error

        data = request.get_json() or {}
        for field in ['full_name', 'school', 'degree', 'major', 'graduation_year', 'target_city', 'target_industry', 'bio']:
            if field in data:
                setattr(user, field, (data.get(field) or '').strip() or None)

        db.session.commit()
        return jsonify({'message': '用户资料已更新', 'user': user.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'更新用户资料失败: {exc}', 500)


@api.route('/upload-resume', methods=['POST'])
def upload_resume():
    try:
        if 'file' not in request.files:
            return error_response('没有上传文件')

        file = request.files['file']
        user_id = request.form.get('user_id', type=int)

        if not user_id:
            return error_response('用户 ID 不能为空')
        if file.filename == '':
            return error_response('文件名不能为空')
        if not allowed_file(file.filename):
            return error_response('只支持 PDF 格式文件')

        user, error = get_user_or_error(user_id)
        if error:
            return error

        filename, file_path = save_uploaded_file(file, Config.UPLOAD_FOLDER)

        try:
            content_text = extract_text_from_file(file_path)
        except Exception as exc:
            if os.path.exists(file_path):
                os.remove(file_path)
            return error_response(f'PDF 解析失败: {exc}')

        resume = Resume(user_id=user.id, filename=filename, file_path=file_path, content_text=content_text)
        db.session.add(resume)
        db.session.commit()

        return jsonify({'message': '简历上传成功', 'resume': resume.to_dict()}), 201
    except Exception as exc:
        db.session.rollback()
        return error_response(f'上传失败: {exc}', 500)


@api.route('/resumes/<int:user_id>', methods=['GET'])
def get_user_resumes(user_id):
    try:
        _, error = get_user_or_error(user_id)
        if error:
            return error

        resumes = Resume.query.filter_by(user_id=user_id).order_by(Resume.created_at.desc()).all()
        return jsonify({'resumes': [resume.to_dict() for resume in resumes]}), 200
    except Exception as exc:
        return error_response(f'获取简历列表失败: {exc}', 500)


@api.route('/resume/<int:resume_id>', methods=['DELETE'])
def delete_resume(resume_id):
    try:
        data = request.get_json(silent=True) or {}
        raw_user_id = data.get('user_id') if isinstance(data, dict) else None
        user_id = int(raw_user_id) if raw_user_id is not None else None
        if not user_id:
            return error_response('用户 ID 不能为空')

        resume = Resume.query.get(resume_id)
        if not resume:
            return error_response('简历不存在', 404)

        ownership_error = ensure_resume_owner(resume, int(user_id))
        if ownership_error:
            return ownership_error

        file_path = resume.file_path
        db.session.delete(resume)
        db.session.commit()

        if file_path and os.path.exists(file_path):
            os.remove(file_path)

        return jsonify({'message': '简历已删除', 'resume_id': resume_id}), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'删除简历失败: {exc}', 500)


@api.route('/analyze-resume/<int:resume_id>', methods=['POST'])
def analyze_resume_endpoint(resume_id):
    try:
        resume = Resume.query.get(resume_id)
        if not resume:
            return error_response('简历不存在', 404)
        if not (resume.content_text or ensure_resume_has_text(resume)):
            return error_response('简历内容为空，无法分析')

        resume_text = resume.content_text or ensure_resume_has_text(resume)
        analysis_result = analyze_resume(resume_text)
        resume.analysis_result = analysis_result
        db.session.commit()

        return jsonify({
            'message': '分析完成',
            'analysis': analysis_result,
            'resume_id': resume_id
        }), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'分析失败: {exc}', 500)


@api.route('/generate-questions/<int:resume_id>', methods=['POST'])
def generate_questions_endpoint(resume_id):
    try:
        resume = Resume.query.get(resume_id)
        if not resume:
            return error_response('简历不存在', 404)
        if not (resume.content_text or ensure_resume_has_text(resume)):
            return error_response('简历内容为空，无法生成题目')

        data = request.get_json() or {}
        num_questions = data.get('num_questions', 10)
        resume_text = resume.content_text or ensure_resume_has_text(resume)
        questions_list = generate_interview_questions(resume_text, resume.analysis_result, num_questions)

        saved_questions = []
        for item in questions_list:
            question = InterviewQuestion(
                resume_id=resume_id,
                question=item['question'],
                answer=item.get('answer', '暂无参考答案'),
                category=item.get('category', '其他')
            )
            db.session.add(question)
            saved_questions.append(question)

        db.session.commit()

        return jsonify({
            'message': '题目生成成功',
            'questions': [question.to_dict() for question in saved_questions],
            'resume_id': resume_id
        }), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'生成题目失败: {exc}', 500)


@api.route('/questions/<int:resume_id>', methods=['GET'])
def get_resume_questions(resume_id):
    try:
        resume = Resume.query.get(resume_id)
        if not resume:
            return error_response('简历不存在', 404)

        questions = InterviewQuestion.query.filter_by(resume_id=resume_id).order_by(
            InterviewQuestion.created_at.desc()
        ).all()
        return jsonify({'questions': [item.to_dict() for item in questions]}), 200
    except Exception as exc:
        return error_response(f'获取题目列表失败: {exc}', 500)


@api.route('/interviews', methods=['POST'])
def create_interview_session():
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        title = data.get('title') or '问诊式求职分析'

        if not user_id:
            return error_response('用户 ID 不能为空')

        user, error = get_user_or_error(user_id)
        if error:
            return error

        profile = initialize_profile()
        session = InterviewSession(user_id=user.id, title=title)
        session.set_profile(profile)

        db.session.add(session)
        db.session.flush()

        first_question = get_active_question(profile)
        db.session.add(InterviewMessage(session_id=session.id, role='assistant', content=build_opening_message()))
        db.session.add(InterviewMessage(
            session_id=session.id,
            role='assistant',
            content=build_question_message(first_question, include_intro=True),
            question_key=first_question['key']
        ))
        db.session.commit()

        payload = session_payload(session)
        payload['message'] = '问诊任务已创建'
        return jsonify(payload), 201
    except Exception as exc:
        db.session.rollback()
        return error_response(f'创建问诊任务失败: {exc}', 500)


@api.route('/interviews/<int:user_id>', methods=['GET'])
def list_interview_sessions(user_id):
    try:
        _, error = get_user_or_error(user_id)
        if error:
            return error

        sessions = InterviewSession.query.filter_by(user_id=user_id).order_by(InterviewSession.updated_at.desc()).all()
        return jsonify({'sessions': [session.to_dict() for session in sessions]}), 200
    except Exception as exc:
        return error_response(f'获取问诊任务失败: {exc}', 500)


@api.route('/interview-session/<int:session_id>', methods=['GET'])
def get_interview_session(session_id):
    try:
        session, error = get_session_or_error(session_id)
        if error:
            return error
        return jsonify(session_payload(session)), 200
    except Exception as exc:
        return error_response(f'获取问诊详情失败: {exc}', 500)


@api.route('/interview-session/<int:session_id>', methods=['DELETE'])
def delete_interview_session(session_id):
    try:
        data = request.get_json(silent=True) or {}
        raw_user_id = data.get('user_id') if isinstance(data, dict) else None
        user_id = int(raw_user_id) if raw_user_id is not None else None
        if not user_id:
            return error_response('用户 ID 不能为空')

        session, error = get_session_or_error(session_id)
        if error:
            return error

        ownership_error = ensure_session_owner(session, int(user_id))
        if ownership_error:
            return ownership_error

        db.session.delete(session)
        db.session.commit()

        return jsonify({'message': '问诊任务已删除', 'session_id': session_id}), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'删除问诊任务失败: {exc}', 500)


@api.route('/interview-session/<int:session_id>/answer', methods=['POST'])
def answer_interview_question(session_id):
    try:
        session, error = get_session_or_error(session_id)
        if error:
            return error
        if session.status != 'in_progress':
            return error_response('当前问诊任务已进入确认阶段，不能继续追加回答')

        data = request.get_json() or {}
        answer = (data.get('answer') or '').strip()
        if not answer:
            return error_response('回答内容不能为空')

        profile = session.profile
        active_question = get_active_question(profile)
        if not active_question:
            return error_response('当前问诊步骤无效', 400)

        profile = merge_answer(profile, active_question['key'], answer)
        db.session.add(InterviewMessage(
            session_id=session.id,
            role='user',
            content=answer,
            question_key=active_question['key']
        ))

        evaluation = evaluate_answer(
            active_question,
            profile.get(active_question['key'], ''),
            build_completion_summary(profile)
        )
        should_follow_up = (
            active_question.get('mode') != 'follow_up'
            and can_trigger_follow_up(profile)
            and not evaluation.get('is_sufficient', True)
            and evaluation.get('follow_up_prompt')
        )

        if should_follow_up:
            follow_up_question = {
                'prompt': evaluation['follow_up_prompt'],
                'tip': evaluation.get('follow_up_tip') or active_question['tip'],
                'placeholder': active_question['placeholder'],
                'suggestions': evaluation.get('suggestions') or active_question.get('suggestions', [])
            }
            profile = set_follow_up_question(profile, follow_up_question)
            db.session.add(InterviewMessage(
                session_id=session.id,
                role='assistant',
                content=build_follow_up_message(active_question, follow_up_question),
                question_key=active_question['key']
            ))
        else:
            profile = stay_on_current_step(profile)
            db.session.add(InterviewMessage(
                session_id=session.id,
                role='assistant',
                content=build_continue_message(active_question, evaluation.get('reason', '')),
                question_key=active_question['key']
            ))

        session.set_profile(profile)
        session.current_step = min(profile.get('_meta', {}).get('active_step', len(QUESTION_FLOW)), len(QUESTION_FLOW))
        session.updated_at = datetime.utcnow()
        session.summary = build_completion_summary(profile)

        db.session.commit()

        payload = session_payload(session)
        payload['message'] = '回答已保存'
        return jsonify(payload), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'保存回答失败: {exc}', 500)


@api.route('/interview-session/<int:session_id>/next-step', methods=['POST'])
def move_to_next_interview_step(session_id):
    try:
        session, error = get_session_or_error(session_id)
        if error:
            return error
        if session.status != 'in_progress':
            return error_response('当前问诊任务已进入确认阶段，不能继续推进')

        profile = session.profile
        current_question = get_active_question(profile)
        if not current_question:
            return error_response('当前问诊步骤无效', 400)

        profile = advance_to_next_step(profile)
        next_question = get_active_question(profile)

        if next_question:
            db.session.add(InterviewMessage(
                session_id=session.id,
                role='assistant',
                content=build_transition_message(current_question, next_question),
                question_key=next_question['key']
            ))
        else:
            session.status = 'completed'
            session.completed_at = datetime.utcnow()
            db.session.add(InterviewMessage(
                session_id=session.id,
                role='assistant',
                content=build_completion_message(profile)
            ))

        session.set_profile(profile)
        session.current_step = min(profile.get('_meta', {}).get('active_step', len(QUESTION_FLOW)), len(QUESTION_FLOW))
        session.updated_at = datetime.utcnow()
        session.summary = build_completion_summary(profile)

        db.session.commit()

        payload = session_payload(session)
        payload['message'] = '已进入下一个方面'
        return jsonify(payload), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'推进问诊失败: {exc}', 500)


@api.route('/interview-session/<int:session_id>/job-matches', methods=['POST'])
def create_job_match(session_id):
    try:
        session, error = get_session_or_error(session_id)
        if error:
            return error

        data = request.get_json() or {}
        raw_user_id = data.get('user_id')
        user_id = int(raw_user_id) if raw_user_id is not None else None
        job_title = (data.get('job_title') or '').strip()
        jd_text = (data.get('jd_text') or '').strip()

        if not user_id:
            return error_response('用户 ID 不能为空')

        ownership_error = ensure_session_owner(session, user_id)
        if ownership_error:
            return ownership_error

        if not job_title:
            return error_response('请输入目标岗位名称')
        if len(jd_text) < 20:
            return error_response('请输入更完整的 JD 内容，至少 20 个字')

        analysis = analyze_job_match(session.profile, job_title, jd_text)
        job_match = JobMatchAnalysis(session_id=session.id, job_title=job_title, jd_text=jd_text)
        job_match.set_analysis(analysis)
        db.session.add(job_match)

        if session.status == 'confirmed':
            db.session.add(InterviewMessage(
                session_id=session.id,
                role='assistant',
                content=f'已完成“{job_title}”的岗位匹配分析，你可以根据结果继续优化简历。'
            ))

        db.session.commit()

        return jsonify({
            'message': '岗位匹配分析已完成',
            'job_match': job_match.to_dict(),
            'job_matches': [item.to_dict() for item in session.job_matches]
        }), 201
    except Exception as exc:
        db.session.rollback()
        return error_response(f'岗位匹配分析失败: {exc}', 500)


@api.route('/job-matches/<int:job_match_id>', methods=['DELETE'])
def delete_job_match(job_match_id):
    try:
        data = request.get_json(silent=True) or {}
        raw_user_id = data.get('user_id') if isinstance(data, dict) else None
        user_id = int(raw_user_id) if raw_user_id is not None else None
        if not user_id:
            return error_response('用户 ID 不能为空')

        job_match, error = get_job_match_or_error(job_match_id)
        if error:
            return error
        if job_match.session.user_id != user_id:
            return error_response('无权操作这个岗位匹配结果', 403)

        db.session.delete(job_match)
        db.session.commit()
        return jsonify({'message': '岗位匹配结果已删除', 'job_match_id': job_match_id}), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'删除岗位匹配结果失败: {exc}', 500)


@api.route('/resume/<int:resume_id>/optimizations', methods=['GET'])
def list_resume_optimizations(resume_id):
    try:
        user_id = request.args.get('user_id', type=int)
        if not user_id:
            return error_response('用户 ID 不能为空')

        resume, error = get_resume_or_error(resume_id)
        if error:
            return error
        ownership_error = ensure_resume_owner(resume, user_id)
        if ownership_error:
            return ownership_error

        versions = ResumeOptimizationVersion.query.filter_by(resume_id=resume.id).order_by(
            ResumeOptimizationVersion.created_at.desc()
        ).all()
        return jsonify({'versions': [version.to_dict() for version in versions]}), 200
    except Exception as exc:
        return error_response(f'获取优化版本失败: {exc}', 500)


@api.route('/resume/<int:resume_id>/optimizations', methods=['POST'])
def create_resume_optimization(resume_id):
    try:
        data = request.get_json() or {}
        user_id = int(data.get('user_id')) if data.get('user_id') is not None else None
        session_id = int(data.get('session_id')) if data.get('session_id') is not None else None
        job_match_id = int(data.get('job_match_id')) if data.get('job_match_id') is not None else None
        version_type = (data.get('version_type') or 'general').strip()

        if not user_id:
            return error_response('用户 ID 不能为空')

        resume, error = get_resume_or_error(resume_id)
        if error:
            return error
        ownership_error = ensure_resume_owner(resume, user_id)
        if ownership_error:
            return ownership_error

        session = None
        if session_id:
            session, error = get_session_or_error(session_id)
            if error:
                return error
            session_error = ensure_session_owner(session, user_id)
            if session_error:
                return session_error

        job_match = None
        if job_match_id:
            job_match, error = get_job_match_or_error(job_match_id)
            if error:
                return error
            if job_match.session.user_id != user_id:
                return error_response('无权使用这个岗位匹配结果', 403)

        optimization = generate_resume_optimization(
            resume.content_text or '',
            version_type=version_type,
            interview_profile=session.profile if session else {},
            job_match=job_match.to_dict() if job_match else {},
            existing_analysis=resume.analysis_result,
        )

        target_job_title = optimization.get('target_job_title')
        version = ResumeOptimizationVersion(
            user_id=user_id,
            resume_id=resume.id,
            session_id=session.id if session else None,
            job_match_id=job_match.id if job_match else None,
            version_type=optimization.get('version_type', version_type),
            title=optimization['title'],
            target_job_title=target_job_title,
            content=optimization['content'],
            summary=optimization.get('summary'),
        )
        version.set_highlights(optimization.get('highlights', []))
        db.session.add(version)
        db.session.commit()

        return jsonify({
            'message': '优化版本已生成',
            'version': version.to_dict(),
        }), 201
    except Exception as exc:
        db.session.rollback()
        return error_response(f'生成优化版本失败: {exc}', 500)


@api.route('/optimizations/<int:version_id>', methods=['PATCH'])
def update_resume_optimization(version_id):
    try:
        version, error = get_optimization_or_error(version_id)
        if error:
            return error

        data = request.get_json() or {}
        user_id = int(data.get('user_id')) if data.get('user_id') is not None else None
        if not user_id:
            return error_response('用户 ID 不能为空')
        if version.user_id != user_id:
            return error_response('无权修改这个优化版本', 403)

        if 'title' in data:
            version.title = (data.get('title') or '').strip() or version.title
        if 'summary' in data:
            version.summary = (data.get('summary') or '').strip() or version.summary
        if 'content' in data:
            version.content = (data.get('content') or '').strip() or version.content
        if 'highlights' in data:
            version.set_highlights(data.get('highlights') or [])
        version.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'message': '优化版本已更新', 'version': version.to_dict()}), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'更新优化版本失败: {exc}', 500)


@api.route('/optimizations/<int:version_id>', methods=['DELETE'])
def delete_resume_optimization(version_id):
    try:
        data = request.get_json(silent=True) or {}
        raw_user_id = data.get('user_id') if isinstance(data, dict) else None
        user_id = int(raw_user_id) if raw_user_id is not None else None
        if not user_id:
            return error_response('用户 ID 不能为空')

        version, error = get_optimization_or_error(version_id)
        if error:
            return error
        if version.user_id != user_id:
            return error_response('无权删除这个优化版本', 403)

        db.session.delete(version)
        db.session.commit()
        return jsonify({'message': '优化版本已删除', 'version_id': version_id}), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'删除优化版本失败: {exc}', 500)


@api.route('/optimizations/<int:version_id>/export', methods=['POST'])
def export_resume_optimization(version_id):
    try:
        version, error = get_optimization_or_error(version_id)
        if error:
            return error

        data = request.get_json() or {}
        user_id = int(data.get('user_id')) if data.get('user_id') is not None else None
        export_format = (data.get('export_format') or 'txt').strip().lower()
        if not user_id:
            return error_response('用户 ID 不能为空')
        if version.user_id != user_id:
            return error_response('无权导出这个优化版本', 403)

        file_path = export_optimization(version, export_format, Config.EXPORT_FOLDER)
        record = ExportRecord(
            user_id=user_id,
            optimization_version_id=version.id,
            export_format=export_format,
            file_path=file_path,
        )
        db.session.add(record)
        db.session.commit()
        return jsonify({
            'message': '导出成功',
            'record': record.to_dict(),
        }), 201
    except Exception as exc:
        db.session.rollback()
        return error_response(f'导出优化版本失败: {exc}', 500)


@api.route('/exports/<int:user_id>', methods=['GET'])
def list_export_records(user_id):
    try:
        _, error = get_user_or_error(user_id)
        if error:
            return error
        records = ExportRecord.query.filter_by(user_id=user_id).order_by(ExportRecord.created_at.desc()).all()
        return jsonify({'records': [record.to_dict() for record in records]}), 200
    except Exception as exc:
        return error_response(f'获取导出记录失败: {exc}', 500)


@api.route('/exports/download/<int:record_id>', methods=['GET'])
def download_export_record(record_id):
    try:
        user_id = request.args.get('user_id', type=int)
        if not user_id:
            return error_response('用户 ID 不能为空')
        record, error = get_export_record_or_error(record_id)
        if error:
            return error
        if record.user_id != user_id:
            return error_response('无权下载这个导出文件', 403)
        if not os.path.exists(record.file_path):
            return error_response('导出文件不存在', 404)
        return send_file(record.file_path, as_attachment=True)
    except Exception as exc:
        return error_response(f'下载导出文件失败: {exc}', 500)


@api.route('/interview-session/<int:session_id>/profile', methods=['PATCH'])
def update_interview_profile(session_id):
    try:
        session, error = get_session_or_error(session_id)
        if error:
            return error

        data = request.get_json() or {}
        updates = data.get('profile') or {}
        confirm = bool(data.get('confirm'))

        profile = merge_profile_updates(session.profile, updates)
        session.set_profile(profile)
        session.summary = build_completion_summary(profile)
        session.updated_at = datetime.utcnow()

        if confirm:
            if session.current_step < len(PROFILE_FIELDS):
                return error_response('问诊尚未完成，不能直接确认画像')
            session.status = 'confirmed'
            db.session.add(InterviewMessage(
                session_id=session.id,
                role='assistant',
                content='画像已确认，后续可以基于这份信息继续做岗位匹配和简历优化。'
            ))
        elif session.current_step >= len(PROFILE_FIELDS) and session.status != 'confirmed':
            session.status = 'completed'

        db.session.commit()

        payload = session_payload(session)
        payload['message'] = '画像已更新'
        return jsonify(payload), 200
    except Exception as exc:
        db.session.rollback()
        return error_response(f'更新画像失败: {exc}', 500)
