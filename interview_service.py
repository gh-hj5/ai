from datetime import datetime

from config import Config


QUESTION_FLOW = [
    {
        'key': 'target_role',
        'label': '意向岗位',
        'section': '求职目标',
        'prompt': '我们先明确目标岗位。你现在最想投递的岗位是什么？如果有 1 到 3 个备选岗位，也可以一起写出来。',
        'tip': '岗位名称越具体，后续做岗位匹配和简历优化时越准确。',
        'placeholder': '例如：后端开发工程师、AI 产品经理、数据分析师',
        'suggestions': ['后端开发工程师', '数据分析师', 'AI 产品经理']
    },
    {
        'key': 'target_industry',
        'label': '意向行业',
        'section': '求职目标',
        'prompt': '你更倾向于进入哪些行业或业务方向？如果暂时不确定，也可以直接说你更感兴趣的领域。',
        'tip': '行业偏好会影响简历侧重点，比如 ToB、教育、电商、AI 应用的表达方式会不同。',
        'placeholder': '例如：企业服务、电商、互联网教育、智能制造',
        'suggestions': ['企业服务', '电商', 'AI 应用']
    },
    {
        'key': 'target_city',
        'label': '意向城市',
        'section': '求职目标',
        'prompt': '你的意向城市和工作地点偏好是什么？是否接受异地、远程或出差？',
        'tip': '如果你对城市优先级很明确，可以直接写“第一选择 / 可接受范围 / 不接受”。',
        'placeholder': '例如：上海优先，也接受杭州；可短期出差',
        'suggestions': ['上海优先，也接受杭州', '北京 / 深圳均可', '支持远程或异地']
    },
    {
        'key': 'education',
        'label': '教育背景',
        'section': '背景信息',
        'prompt': '请介绍你的教育背景，尽量包含学校、专业、学历、毕业时间，以及你认为最有含金量的课程或研究方向。',
        'tip': '如果你是应届生，这一部分通常会直接影响简历前半页的结构安排。',
        'placeholder': '例如：XX 大学计算机科学与技术，本科，2026 年毕业',
        'suggestions': ['本科，2026 年毕业', '硕士在读，研究方向 NLP', '软件工程专业']
    },
    {
        'key': 'experience',
        'label': '经历亮点',
        'section': '经历沉淀',
        'prompt': '请说说你最值得写进简历的经历，可以是实习、项目、比赛、科研或学生工作。重点写你做了什么、解决了什么问题、结果如何。',
        'tip': '尽量按“背景 - 动作 - 结果”来描述，不要只写参与了什么。',
        'placeholder': '例如：在某项目中负责接口设计和性能优化，接口耗时下降 40%',
        'suggestions': ['项目经历', '实习经历', '竞赛 / 科研经历']
    },
    {
        'key': 'skills',
        'label': '核心技能',
        'section': '能力梳理',
        'prompt': '你的核心技能有哪些？请按“工具 / 语言 / 框架 / 方法论”去说，并标一下你最有把握的 3 项。',
        'tip': '技能不要只堆关键词，最好体现熟练度或使用场景。',
        'placeholder': '例如：Python、Flask、MySQL、数据分析、Prompt 设计',
        'suggestions': ['Python / Flask / MySQL', 'Excel / SQL / Tableau', 'Prompt 设计 / 内容策划']
    },
    {
        'key': 'advantages',
        'label': '个人优势',
        'section': '能力梳理',
        'prompt': '如果让你总结自己的竞争优势，你最希望招聘方记住哪几点？也可以补充证书、奖项、语言能力或性格优势。',
        'tip': '这里适合写那些不容易从项目经历里直接看出来，但确实能拉开差距的点。',
        'placeholder': '例如：沟通推进力强，项目复盘能力好，英语可工作交流',
        'suggestions': ['沟通推进力强', '学习速度快', '英语可工作交流']
    },
    {
        'key': 'improvement_needs',
        'label': '优化目标',
        'section': '优化方向',
        'prompt': '这次你最希望系统帮你优化什么？比如“突出项目成果”“贴合某个 JD”“补齐自我介绍”“改得更 ATS 友好”等。',
        'tip': '你说得越具体，后面生成的优化版本越有针对性。',
        'placeholder': '例如：想重点优化项目经历表达，提升岗位匹配度',
        'suggestions': ['突出项目成果', '贴合某个 JD', '更 ATS 友好']
    }
]

PROFILE_FIELDS = [
    {
        'key': item['key'],
        'label': item['label'],
        'placeholder': item['placeholder']
    }
    for item in QUESTION_FLOW
]

PROFILE_FIELD_KEYS = {item['key'] for item in PROFILE_FIELDS}


def get_question_by_step(step):
    if 0 <= step < len(QUESTION_FLOW):
        return QUESTION_FLOW[step]
    return None


def initialize_profile():
    profile = {item['key']: '' for item in QUESTION_FLOW}
    profile['_meta'] = {
        'active_step': 0,
        'active_mode': 'base',
        'follow_up_count': 0,
        'follow_up_history': {},
        'awaiting_confirmation': False
    }
    return profile


def progress_percent(step):
    if not QUESTION_FLOW:
        return 100
    answered = min(step, len(QUESTION_FLOW))
    return int(answered / len(QUESTION_FLOW) * 100)


def get_meta(profile):
    meta = dict(profile.get('_meta') or {})
    meta.setdefault('active_step', 0)
    meta.setdefault('active_mode', 'base')
    meta.setdefault('follow_up_count', 0)
    meta.setdefault('follow_up_history', {})
    meta.setdefault('awaiting_confirmation', False)
    return meta


def set_meta(profile, meta):
    profile['_meta'] = meta
    return profile


def base_question_payload(step):
    question = get_question_by_step(step)
    if not question:
        return None
    return {
        'step': step,
        'progress': progress_percent(step),
        'key': question['key'],
        'label': question['label'],
        'section': question['section'],
        'prompt': question['prompt'],
        'tip': question['tip'],
        'placeholder': question['placeholder'],
        'suggestions': question.get('suggestions', []),
        'mode': 'base'
    }


def get_active_question(profile):
    meta = get_meta(profile)
    step = meta['active_step']
    base_question = base_question_payload(step)
    if not base_question:
        return None

    if meta.get('active_mode') != 'follow_up':
        return base_question

    follow_up = meta.get('follow_up_question') or {}
    return {
        'step': step,
        'progress': progress_percent(step),
        'key': base_question['key'],
        'label': base_question['label'],
        'section': base_question['section'],
        'prompt': follow_up.get('prompt', base_question['prompt']),
        'tip': follow_up.get('tip', base_question['tip']),
        'placeholder': follow_up.get('placeholder', base_question['placeholder']),
        'suggestions': follow_up.get('suggestions', []),
        'mode': 'follow_up'
    }


def build_opening_message():
    return (
        '我们先做一轮问诊式梳理。'
        '我会分阶段了解你的求职方向、背景、经历和优势；如果某一项信息还不够具体，我会继续追问一轮。'
    )


def build_question_message(question, include_intro=False):
    lines = []
    if include_intro:
        lines.append('第一步，我们先从求职目标开始。')
    lines.append(f"当前阶段：{question['section']}")
    if question.get('mode') == 'follow_up':
        lines.append('我想继续追问一下这一点，让后续画像更准确。')
    lines.append(f"问题：{question['prompt']}")
    lines.append(f"回答建议：{question['tip']}")
    return '\n'.join(lines)


def build_transition_message(current_question, next_question):
    return (
        f"已记录你的「{current_question['label']}」。"
        f" 接下来进入「{next_question['section']}」，我继续了解你的「{next_question['label']}」。\n"
        f"问题：{next_question['prompt']}\n"
        f"回答建议：{next_question['tip']}"
    )


def build_follow_up_message(current_question, follow_up_question):
    return (
        f"你的「{current_question['label']}」我先记下了。"
        ' 为了后面的岗位匹配和简历改写更准确，我还想补问一句：\n'
        f"问题：{follow_up_question['prompt']}\n"
        f"回答建议：{follow_up_question['tip']}"
    )


def build_completion_message(profile):
    return (
        '问诊部分已经完成。'
        '我已经把你的回答整理成结构化画像，你现在可以在右侧逐项检查、修改，并在确认无误后锁定画像。'
        '\n\n'
        + build_completion_summary(profile)
    )


def merge_answer(profile, question_key, answer):
    existing = (profile.get(question_key) or '').strip()
    cleaned = answer.strip()
    if not existing:
        profile[question_key] = cleaned
    elif cleaned and cleaned not in existing:
        profile[question_key] = existing + '\n补充：' + cleaned
    profile['last_updated_at'] = datetime.utcnow().isoformat()
    return profile


def set_follow_up_question(profile, follow_up_question):
    meta = get_meta(profile)
    step = meta['active_step']
    question = get_question_by_step(step)
    history = dict(meta.get('follow_up_history') or {})
    question_key = question['key']
    history[question_key] = history.get(question_key, 0) + 1

    meta['active_mode'] = 'follow_up'
    meta['follow_up_count'] = history[question_key]
    meta['follow_up_history'] = history
    meta['follow_up_question'] = follow_up_question
    meta['awaiting_confirmation'] = False
    return set_meta(profile, meta)


def advance_to_next_step(profile):
    meta = get_meta(profile)
    meta['active_step'] += 1
    meta['active_mode'] = 'base'
    meta['follow_up_count'] = 0
    meta.pop('follow_up_question', None)
    meta['awaiting_confirmation'] = meta['active_step'] >= len(QUESTION_FLOW)
    set_meta(profile, meta)
    profile['last_updated_at'] = datetime.utcnow().isoformat()
    return profile


def stay_on_current_step(profile):
    meta = get_meta(profile)
    meta['active_mode'] = 'base'
    meta['follow_up_count'] = 0
    meta.pop('follow_up_question', None)
    meta['awaiting_confirmation'] = False
    set_meta(profile, meta)
    profile['last_updated_at'] = datetime.utcnow().isoformat()
    return profile


def build_continue_message(question, evaluation_reason=''):
    reason = (evaluation_reason or '').strip()
    prefix = f"已记录你的「{question['label']}」。"
    if reason:
        prefix += f" {reason}"
    return (
        prefix
        + "\n你可以继续补充当前这一项，让画像更完整；如果你觉得这个方面已经足够了，再点击“下一步”进入下一个方面。"
    )


def current_follow_up_count(profile):
    return get_meta(profile).get('follow_up_count', 0)


def can_trigger_follow_up(profile):
    return current_follow_up_count(profile) < Config.INTERVIEW_MAX_FOLLOW_UPS


def merge_profile_updates(profile, updates):
    merged = dict(profile)
    for key, value in (updates or {}).items():
        if key in PROFILE_FIELD_KEYS:
            merged[key] = (value or '').strip()
    merged['last_updated_at'] = datetime.utcnow().isoformat()
    return merged


def build_completion_summary(profile):
    summary_lines = [
        '当前求职画像摘要：',
        f"1. 意向岗位：{profile.get('target_role') or '待补充'}",
        f"2. 意向行业：{profile.get('target_industry') or '待补充'}",
        f"3. 意向城市：{profile.get('target_city') or '待补充'}",
        f"4. 教育背景：{profile.get('education') or '待补充'}",
        f"5. 代表经历：{profile.get('experience') or '待补充'}",
        f"6. 核心技能：{profile.get('skills') or '待补充'}",
        f"7. 个人优势：{profile.get('advantages') or '待补充'}",
        f"8. 优化目标：{profile.get('improvement_needs') or '待补充'}",
    ]
    return '\n'.join(summary_lines)
