from llm_client import chat_completion, llm_enabled, parse_json_object


VERSION_TYPES = {
    'general': '通用优化版',
    'job_targeted': '岗位定制版',
    'compact': '精简投递版',
}


def generate_resume_optimization(
    resume_text,
    version_type='general',
    interview_profile=None,
    job_match=None,
    existing_analysis=None
):
    interview_profile = interview_profile or {}
    job_match = job_match or {}
    version_type = version_type if version_type in VERSION_TYPES else 'general'

    if llm_enabled():
        try:
            return generate_with_llm(
                resume_text,
                version_type,
                interview_profile,
                job_match,
                existing_analysis
            )
        except Exception:
            pass

    return generate_with_rules(
        resume_text,
        version_type,
        interview_profile,
        job_match,
        existing_analysis
    )


def generate_with_llm(resume_text, version_type, interview_profile, job_match, existing_analysis):
    job_title = job_match.get('job_title') or interview_profile.get('target_role') or '目标岗位'
    prompt = f"""你是一名资深简历顾问。请基于原始简历、问诊画像、岗位匹配结果，生成一版可直接展示的中文优化简历内容。

版本类型：{VERSION_TYPES[version_type]}
目标岗位：{job_title}
原始简历：
{resume_text}

问诊画像：
- 意向岗位：{interview_profile.get('target_role', '')}
- 意向行业：{interview_profile.get('target_industry', '')}
- 意向城市：{interview_profile.get('target_city', '')}
- 教育背景：{interview_profile.get('education', '')}
- 代表经历：{interview_profile.get('experience', '')}
- 核心技能：{interview_profile.get('skills', '')}
- 个人优势：{interview_profile.get('advantages', '')}
- 优化目标：{interview_profile.get('improvement_needs', '')}

已有分析：
{existing_analysis or ''}

岗位匹配结果：
- 匹配总结：{job_match.get('summary', '')}
- 优势：{'；'.join(job_match.get('strengths', []))}
- 短板：{'；'.join(job_match.get('gaps', []))}
- 建议：{'；'.join(job_match.get('suggestions', []))}

请严格输出 JSON：
{{
  "title": "版本标题",
  "summary": "2 句以内概述这版优化思路",
  "highlights": ["最多 5 条亮点改写策略"],
  "content": "完整优化后的简历文本"
}}

要求：
1. content 要有明确的模块结构，可直接复制。
2. 不要编造不存在的经历，只能重组、提炼、强调已有信息。
3. 如果信息不足，用更稳妥的表达，不要虚构量化结果。
4. 不要输出 Markdown 代码块。"""

    messages = [
        {
            'role': 'system',
            'content': '你是简历优化专家，输出必须是合法 JSON。'
        },
        {'role': 'user', 'content': prompt}
    ]
    parsed = parse_json_object(chat_completion(messages))
    return normalize_optimization(parsed, version_type, job_title, resume_text, interview_profile, job_match)


def generate_with_rules(resume_text, version_type, interview_profile, job_match, existing_analysis):
    job_title = job_match.get('job_title') or interview_profile.get('target_role') or '目标岗位'
    title = f'{job_title} - {VERSION_TYPES[version_type]}'
    highlights = [
        '围绕目标岗位重组经历顺序',
        '优先突出与岗位更相关的技能与成果',
        '弱化无关信息，增强表达密度',
    ]
    if job_match.get('suggestions'):
        highlights.extend(job_match['suggestions'][:2])

    content_sections = [
        f'【版本类型】{VERSION_TYPES[version_type]}',
        f'【目标岗位】{job_title}',
        '',
        '【个人定位】',
        interview_profile.get('target_role') or '可根据目标岗位进一步补充个人定位',
        '',
        '【教育背景】',
        interview_profile.get('education') or '请补充学校、专业、学历与毕业时间',
        '',
        '【核心技能】',
        interview_profile.get('skills') or '请补充与岗位直接相关的技能栈',
        '',
        '【代表经历】',
        interview_profile.get('experience') or resume_text[:1200],
        '',
        '【个人优势】',
        interview_profile.get('advantages') or '请补充可支撑岗位匹配的个人优势',
    ]

    if version_type == 'compact':
        content_sections.append('')
        content_sections.append('【投递重点】优先保留与目标岗位最相关的信息，删除冗余描述。')

    if existing_analysis:
        content_sections.extend(['', '【补充说明】', existing_analysis[:500]])

    summary = f'已生成一版面向“{job_title}”的{VERSION_TYPES[version_type]}，重点强化岗位相关表达。'
    return normalize_optimization(
        {
            'title': title,
            'summary': summary,
            'highlights': highlights,
            'content': '\n'.join(content_sections)
        },
        version_type,
        job_title,
        resume_text,
        interview_profile,
        job_match
    )


def normalize_optimization(payload, version_type, job_title, resume_text, interview_profile, job_match):
    title = str(payload.get('title') or '').strip() or f'{job_title} - {VERSION_TYPES[version_type]}'
    summary = str(payload.get('summary') or '').strip() or f'已生成{VERSION_TYPES[version_type]}。'
    content = str(payload.get('content') or '').strip()
    if not content:
        content = resume_text.strip() or interview_profile.get('experience') or '暂无可生成内容'

    highlights = []
    for item in payload.get('highlights', []) or []:
        text = str(item).strip()
        if text and text not in highlights:
            highlights.append(text)
        if len(highlights) >= 5:
            break

    return {
        'title': title,
        'summary': summary,
        'highlights': highlights,
        'content': content,
        'version_type': version_type,
        'target_job_title': job_title,
    }
