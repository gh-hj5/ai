import json
import re

from llm_client import chat_completion


def analyze_resume(resume_text):
    prompt = f"""请对以下简历内容进行详细分析，包括：
1. 个人信息总结
2. 教育背景分析
3. 工作经历 / 项目经历总结
4. 技能评估
5. 优势与亮点
6. 可能的改进建议

简历内容：
{resume_text}

请用结构化、清晰的小标题输出分析结果。"""

    messages = [
        {
            'role': 'system',
            'content': '你是一名专业的简历顾问，擅长分析候选人的背景并给出具体可执行的建议。'
        },
        {'role': 'user', 'content': prompt}
    ]
    return chat_completion(messages)


def generate_interview_questions(resume_text, analysis_result=None, num_questions=10):
    context_block = f'简历分析：\n{analysis_result}\n\n' if analysis_result else ''
    prompt = f"""基于以下简历内容，生成 {num_questions} 道面试题，并为每道题提供参考答案。

要求覆盖：
1. 技术 / 专业能力
2. 项目或实习经历
3. 基础知识
4. 行为面试
5. 场景分析

简历内容：
{resume_text}

{context_block}请严格输出 JSON 数组，不要输出额外说明。格式如下：
[
  {{"question": "问题内容", "category": "技术", "answer": "参考答案"}},
  {{"question": "问题内容", "category": "项目", "answer": "参考答案"}}
]"""

    messages = [
        {
            'role': 'system',
            'content': '你是一名专业面试官。请输出标准 JSON，不要添加代码块标记或额外说明。'
        },
        {'role': 'user', 'content': prompt}
    ]

    response_text = chat_completion(messages)
    return parse_questions_json(response_text)


def parse_questions_json(response_text):
    try:
        return normalize_questions(json.loads(response_text))
    except json.JSONDecodeError:
        pass

    match = re.search(r'\[[\s\S]*\]', response_text)
    if match:
        try:
            return normalize_questions(json.loads(match.group(0)))
        except json.JSONDecodeError:
            pass

    return parse_questions_text(response_text)


def normalize_questions(questions):
    result = []
    for item in questions:
        result.append({
            'question': item.get('question', '').strip(),
            'category': item.get('category', '其他').strip() or '其他',
            'answer': item.get('answer', '暂无参考答案').strip() or '暂无参考答案'
        })
    return result


def parse_questions_text(questions_text):
    questions = []
    blocks = questions_text.strip().split('\n\n')

    for block in blocks:
        lines = [line.strip() for line in block.strip().split('\n') if line.strip()]
        if not lines:
            continue

        question = ''
        category = '其他'
        answer_lines = []
        answer_mode = False

        for line in lines:
            lower_line = line.lower()
            if lower_line.startswith('answer:') or line.startswith('答案：') or line.startswith('答案:'):
                answer_mode = True
                if ':' in line:
                    answer_lines.append(line.split(':', 1)[1].strip())
                elif '：' in line:
                    answer_lines.append(line.split('：', 1)[1].strip())
                continue

            if answer_mode:
                answer_lines.append(line)
                continue

            if not question:
                question = re.sub(r'^\d+[\.\、]\s*', '', line)
                if '[' in question and ']' in question:
                    left, right = question.split(']', 1)
                    if '[' in left:
                        category = left.split('[', 1)[1].strip() or category
                    question = right.strip()

        if question:
            questions.append({
                'question': question,
                'category': category,
                'answer': '\n'.join([line for line in answer_lines if line]) or '暂无参考答案'
            })

    return questions
