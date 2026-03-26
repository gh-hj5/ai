from llm_client import chat_completion, llm_enabled, parse_json_object


def evaluate_answer(question, answer, profile_snapshot):
    if llm_enabled():
        try:
            return evaluate_answer_with_llm(question, answer, profile_snapshot)
        except Exception:
            pass
    return evaluate_answer_with_rules(question, answer)


def evaluate_answer_with_llm(question, answer, profile_snapshot):
    prompt = f"""你正在担任求职问诊助手。请判断用户对当前问题的回答是否已经足够用于后续简历优化。

当前问题字段：{question['label']}
当前阶段：{question['section']}
问题内容：{question['prompt']}
回答建议：{question['tip']}

用户当前回答：
{answer}

已有画像摘要：
{profile_snapshot}

请输出 JSON 对象，不要输出额外解释：
{{
  "is_sufficient": true,
  "reason": "简短判断",
  "follow_up_prompt": "如果需要追问，这里给出一句具体追问；否则输出空字符串",
  "follow_up_tip": "如果需要追问，这里给出回答建议；否则输出空字符串",
  "suggestions": ["可选快捷建议1", "可选快捷建议2"]
}}

要求：
1. 如果回答过于空泛、缺少关键信息、无法支持后续简历优化，则 is_sufficient=false。
2. follow_up_prompt 必须具体，不能重复原问题。
3. suggestions 最多 3 个。"""

    messages = [
        {
            'role': 'system',
            'content': '你是一名严格但友好的求职问诊助手，擅长判断信息是否充分，并提出一轮补充追问。'
        },
        {'role': 'user', 'content': prompt}
    ]
    parsed = parse_json_object(chat_completion(messages))
    return {
        'is_sufficient': bool(parsed.get('is_sufficient')),
        'reason': str(parsed.get('reason', '')).strip(),
        'follow_up_prompt': str(parsed.get('follow_up_prompt', '')).strip(),
        'follow_up_tip': str(parsed.get('follow_up_tip', '')).strip(),
        'suggestions': [str(item).strip() for item in parsed.get('suggestions', []) if str(item).strip()][:3]
    }


def evaluate_answer_with_rules(question, answer):
    cleaned = (answer or '').strip()
    lower = cleaned.lower()

    if len(cleaned) < 8:
        return build_rule_follow_up(question, '回答太短，需要补充更多具体信息。')

    if question['key'] == 'target_role' and not any(token in cleaned for token in ['工程师', '产品', '运营', '分析', '设计', '开发', '销售']):
        return {
            'is_sufficient': False,
            'reason': '岗位名称还不够具体。',
            'follow_up_prompt': '你可以把目标岗位写得更具体一点吗？最好直接写标准岗位名称，必要时再补 1 到 2 个备选岗位。',
            'follow_up_tip': '例如写清楚“后端开发工程师 / 数据分析师 / AI 产品经理”这类标准称呼。',
            'suggestions': ['后端开发工程师', '数据分析师', 'AI 产品经理']
        }

    if question['key'] == 'experience' and not any(token in cleaned for token in ['负责', '完成', '提升', '优化', '搭建', '参与', '%', '人', '次']):
        return {
            'is_sufficient': False,
            'reason': '经历里缺少动作和结果。',
            'follow_up_prompt': '这段经历里，你具体做了什么、解决了什么问题、最后结果怎样？最好补一个可量化结果。',
            'follow_up_tip': '按“背景 - 动作 - 结果”写，比如“负责接口优化，接口耗时下降 40%”。',
            'suggestions': ['补充我负责的部分', '补充解决的问题', '补充量化结果']
        }

    if question['key'] == 'skills' and '/' not in cleaned and '、' not in cleaned and ',' not in cleaned and '，' not in cleaned:
        return {
            'is_sufficient': False,
            'reason': '技能还不够展开。',
            'follow_up_prompt': '你可以把技能拆开说吗？最好按工具、语言、框架或方法论分别列出来，再标明你最有把握的 3 项。',
            'follow_up_tip': '例如“Python / Flask / MySQL / SQL 优化 / 数据分析”。',
            'suggestions': ['Python / Flask / MySQL', 'Excel / SQL / Tableau', 'Prompt 设计 / 内容策划']
        }

    if question['key'] == 'education' and not any(token in cleaned for token in ['大学', '学院', '本科', '硕士', '博士', '毕业']):
        return {
            'is_sufficient': False,
            'reason': '教育背景缺少关键字段。',
            'follow_up_prompt': '再补充一下学校、专业、学历和毕业时间，这样后面才能更准确地整理教育背景。',
            'follow_up_tip': '至少包含学校 + 专业 + 学历 + 毕业时间。',
            'suggestions': ['XX 大学 / 软件工程 / 本科 / 2026 年毕业', 'XX 大学 / 数据科学 / 硕士 / 2027 年毕业']
        }

    return {
        'is_sufficient': True,
        'reason': '信息已经足够进入下一题。',
        'follow_up_prompt': '',
        'follow_up_tip': '',
        'suggestions': []
    }


def build_rule_follow_up(question, reason):
    return {
        'is_sufficient': False,
        'reason': reason,
        'follow_up_prompt': f"关于「{question['label']}」，你可以再补充得更具体一些吗？最好结合真实经历或明确偏好来说明。",
        'follow_up_tip': question['tip'],
        'suggestions': question.get('suggestions', [])[:3]
    }
