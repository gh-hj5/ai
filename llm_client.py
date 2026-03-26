import json
import time
import urllib.error
import urllib.request

from config import Config


def llm_enabled():
    return bool(Config.LLM_API_KEY) and Config.INTERVIEW_USE_LLM


def chat_completion(messages, model=None, timeout=120, max_retries=3):
    if not llm_enabled():
        raise RuntimeError('LLM API key is not configured')

    payload = {
        'model': model or Config.LLM_CHAT_MODEL,
        'messages': messages,
    }

    headers = {
        'Authorization': f'Bearer {Config.LLM_API_KEY}',
        'Content-Type': 'application/json',
    }

    if Config.LLM_PROVIDER == 'openrouter':
        headers['HTTP-Referer'] = Config.LLM_REFERER
        headers['X-Title'] = Config.LLM_APP_NAME

    body = json.dumps(payload).encode('utf-8')
    url = f'{Config.LLM_BASE_URL}/chat/completions'
    last_error = None

    for attempt in range(max_retries):
        request = urllib.request.Request(url, data=body, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                response_data = json.loads(response.read().decode('utf-8'))
                return response_data['choices'][0]['message']['content']
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='ignore')
            last_error = f'HTTP {exc.code}: {detail or exc.reason}'
        except Exception as exc:
            last_error = str(exc)

        if attempt < max_retries - 1:
            time.sleep(2)

    raise RuntimeError(last_error or 'LLM request failed')


def parse_json_object(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def test_llm_connection():
    reply = chat_completion(
        [
            {
                'role': 'system',
                'content': 'You are a connectivity check assistant. Reply in one short sentence.'
            },
            {
                'role': 'user',
                'content': 'Please reply with: LLM connection successful.'
            }
        ],
        timeout=60,
        max_retries=1
    )
    return {
        'enabled': llm_enabled(),
        'provider': Config.LLM_PROVIDER,
        'model': Config.LLM_CHAT_MODEL,
        'reply': reply.strip()
    }
