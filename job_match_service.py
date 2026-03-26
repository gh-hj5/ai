import re

from llm_client import chat_completion, llm_enabled, parse_json_object


COMMON_KEYWORDS = [
    'python', 'java', 'javascript', 'typescript', 'go', 'mysql', 'postgresql',
    'redis', 'flask', 'django', 'fastapi', 'spring', 'react', 'vue', 'docker',
    'kubernetes', 'sql', 'tableau', 'excel', '机器学习', '深度学习', '数据分析',
    '后端', '前端', '产品', '运营', '测试', '算法', 'prompt', 'nlp', 'llm'
]


def analyze_job_match(profile, job_title, jd_text):
    if llm_enabled():
        try:
            return analyze_job_match_with_llm(profile, job_title, jd_text)
        except Exception:
            pass
    return analyze_job_match_with_rules(profile, job_title, jd_text)


def analyze_job_match_with_llm(profile, job_title, jd_text):
    prompt = f"""你正在做求职岗位匹配分析。请基于候选人的求职画像与目标岗位 JD，输出一份结构化匹配结果。

候选人画像：
- 意向岗位：{profile.get('target_role', '')}
- 意向行业：{profile.get('target_industry', '')}
- 意向城市：{profile.get('target_city', '')}
- 教育背景：{profile.get('education', '')}
- 代表经历：{profile.get('experience', '')}
- 核心技能：{profile.get('skills', '')}
- 个人优势：{profile.get('advantages', '')}
- 优化目标：{profile.get('improvement_needs', '')}

目标岗位：{job_title}
JD 内容：
{jd_text}

请严格输出 JSON 对象，不要附加解释：
{{
  "match_score": 78,
  "summary": "1-2 句总结候选人与岗位的整体匹配情况",
  "strengths": ["最多 4 条优势"],
  "gaps": ["最多 4 条短板或风险"],
  "suggestions": ["最多 4 条改进建议"],
  "keywords": ["JD 中最关键的 5-8 个关键词"]
}}

要求：
1. match_score 为 0-100 的整数。
2. strengths/gaps/suggestions 必须具体，优先引用画像或 JD 中的真实信息。
3. 如果信息不足，可以指出“证据不足”，但不要编造经历。
4. summary 必须简洁，便于直接展示在页面上。"""

    messages = [
        {
            'role': 'system',
            'content': '你是一名招聘顾问，擅长基于候选人画像与职位 JD 做岗位匹配分析。输出必须是合法 JSON。'
        },
        {'role': 'user', 'content': prompt}
    ]
    parsed = parse_json_object(chat_completion(messages))
    return normalize_job_match(parsed, profile, job_title, jd_text)


def analyze_job_match_with_rules(profile, job_title, jd_text):
    profile_text = '\n'.join([
        profile.get('target_role', ''),
        profile.get('target_industry', ''),
        profile.get('education', ''),
        profile.get('experience', ''),
        profile.get('skills', ''),
        profile.get('advantages', '')
    ]).lower()
    jd_lower = (jd_text or '').lower()
    keywords = extract_keywords(job_title, jd_text)
    matched = [keyword for keyword in keywords if keyword.lower() in profile_text]

    score = min(95, 35 + len(matched) * 8)
    if not profile.get('experience'):
        score -= 10
    if not profile.get('skills'):
        score -= 12
    score = max(20, score)

    strengths = []
    gaps = []
    suggestions = []

    if matched:
        strengths.append(f'画像中已覆盖岗位相关关键词：{", ".join(matched[:4])}')
    if profile.get('experience'):
        strengths.append('已有代表经历，可用于支撑岗位适配度表达')
    if profile.get('advantages'):
        strengths.append('问诊里已沉淀个人优势，适合补强简历亮点')

    missing = [keyword for keyword in keywords if keyword.lower() not in profile_text]
    if missing:
        gaps.append(f'与 JD 相比，当前画像缺少这些关键信息或证据：{", ".join(missing[:4])}')
    if not profile.get('target_role'):
        gaps.append('目标岗位描述还不够明确，影响定向匹配判断')
    if len((profile.get('experience') or '').strip()) < 20:
        gaps.append('经历描述偏少，难以支撑和 JD 要求的直接映射')

    suggestions.append('优先把 JD 中的核心技能和职责映射到项目经历里，补充动作与结果')
    if missing:
        suggestions.append(f'针对 {", ".join(missing[:3])} 补充对应技能、项目片段或学习计划')
    suggestions.append('把最相关的一段经历前置，突出与岗位最接近的成果')

    summary = (
        f'当前画像与“{job_title}”存在一定匹配基础，'
        f'已识别 {len(matched)} 个直接相关关键词，'
        f'但仍有部分 JD 要求缺少明确证据。'
    )

    return normalize_job_match(
        {
            'match_score': score,
            'summary': summary,
            'strengths': strengths,
            'gaps': gaps,
            'suggestions': suggestions,
            'keywords': keywords
        },
        profile,
        job_title,
        jd_text
    )


def extract_keywords(job_title, jd_text):
    base_tokens = [job_title] if job_title else []
    text = f'{job_title}\n{jd_text}'
    found = []
    lowered = text.lower()
    for keyword in COMMON_KEYWORDS:
        if keyword.lower() in lowered and keyword not in found:
            found.append(keyword)

    chinese_tokens = re.findall(r'[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9+\-#/]{1,20}', text)
    for token in chinese_tokens:
        token = token.strip()
        if len(token) < 2:
            continue
        if token in found:
            continue
        if any(char.isdigit() for char in token) and len(token) <= 2:
            continue
        found.append(token)
        if len(found) >= 8:
            break

    result = []
    for item in base_tokens + found:
        cleaned = str(item).strip()
        if cleaned and cleaned not in result:
            result.append(cleaned)
        if len(result) >= 8:
            break
    return result


def normalize_job_match(payload, profile, job_title, jd_text):
    keywords = payload.get('keywords') or extract_keywords(job_title, jd_text)
    return {
        'match_score': clamp_score(payload.get('match_score', 0)),
        'summary': str(payload.get('summary') or '').strip() or f'已完成“{job_title}”的岗位匹配分析。',
        'strengths': normalize_list(payload.get('strengths')),
        'gaps': normalize_list(payload.get('gaps')),
        'suggestions': normalize_list(payload.get('suggestions')),
        'keywords': normalize_list(keywords, limit=8)
    }


def normalize_list(items, limit=4):
    normalized = []
    for item in items or []:
        text = str(item).strip()
        if text and text not in normalized:
            normalized.append(text)
        if len(normalized) >= limit:
            break
    return normalized


def clamp_score(value):
    try:
        score = int(float(value))
    except (TypeError, ValueError):
        score = 0
    return max(0, min(100, score))
