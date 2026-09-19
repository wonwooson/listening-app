"""Gemini connection and Windows user-bound credential storage."""
import base64
import ctypes
from ctypes import wintypes
import json
import re
import requests

DEFAULT_MODEL = 'gemini-3.8-flash'
read_settings = lambda: {}


def normalize_key(value):
    if not isinstance(value,str) or len(value)>4096:
        raise ValueError('API 키 입력이 너무 깁니다. 발급된 키 하나만 붙여넣어주세요.')
    value=value.strip()
    value=re.sub(r'^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*','',value).strip()
    if len(value)>=2 and value[0]==value[-1] and value[0] in ('"',"'"):
        value=value[1:-1].strip()
    if not value: return ''
    if any(c.isspace() for c in value):
        raise ValueError('키 안에 공백 또는 줄바꿈이 있습니다. Google AI Studio의 키 복사 버튼으로 다시 복사해주세요.')
    if not value.isascii() or any(ord(c)<33 or ord(c)>126 for c in value):
        raise ValueError('키에 한글 또는 보이지 않는 문자가 포함되어 있습니다. 발급된 키만 다시 복사해주세요.')
    if len(value)<20:
        raise ValueError('키가 너무 짧습니다. 키 이름이 아니라 발급된 API 키 전체를 복사해주세요.')
    if value.startswith(('http://','https://')):
        raise ValueError('주소가 입력되었습니다. 페이지 주소가 아닌 API 키를 복사해주세요.')
    return value


def protect(value, decrypt=False):
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    raw = base64.b64decode(value) if decrypt else value.encode('utf-8')
    buffer = (ctypes.c_ubyte * len(raw)).from_buffer_copy(raw)
    source = Blob(len(raw), buffer); target = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                         ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise ValueError('Windows 키 보관함에 접근하지 못했습니다. 같은 Windows 사용자로 실행해주세요.')
    try:
        result = ctypes.string_at(target.data, target.size)
        return result.decode('utf-8') if decrypt else base64.b64encode(result).decode('ascii')
    finally:
        kernel.LocalFree(target.data)


def model_name(value):
    if not isinstance(value,str) or not re.fullmatch(r'gemini-[A-Za-z0-9._-]{1,90}',value):
        raise ValueError('gemini-로 시작하는 올바른 모델 이름을 입력해주세요.')
    return value


def generate(system, prompt, schema=None, settings=None):
    settings = settings if settings is not None else read_settings()
    if not settings.get('encryptedKey'):
        raise ValueError('설정과 백업에서 Gemini API 키를 저장해주세요.')
    model = model_name(settings.get('model', DEFAULT_MODEL))
    payload = {'systemInstruction':{'parts':[{'text':system}]},
               'contents':[{'role':'user','parts':[{'text':prompt}]}]}
    if schema:
        payload['generationConfig'] = {'responseMimeType':'application/json','responseJsonSchema':schema}
    try:
        response = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                                 headers={'x-goog-api-key':protect(settings['encryptedKey'],True)},
                                 json=payload, timeout=(10,240))
    except requests.RequestException:
        raise ValueError('Gemini에 연결하지 못했습니다. 네트워크를 확인해주세요.') from None
    errors = {400:'키 또는 요청 형식을 확인해주세요.',401:'API 키 인증에 실패했습니다.',
              403:'API 키의 사용 권한을 확인해주세요.',404:'모델을 찾을 수 없습니다. 모델 이름을 확인해주세요.',
              429:'사용 한도에 도달했습니다. Gemini 할당량·결제 상태를 확인해주세요.'}
    if not response.ok:
        raise ValueError('Gemini: '+errors.get(response.status_code,'일시적인 서버 오류입니다. 잠시 후 다시 시도해주세요.'))
    try:
        candidate = response.json()['candidates'][0]
        if candidate.get('finishReason') != 'STOP':
            raise ValueError()
        text = ''.join(p.get('text','') for p in candidate['content']['parts'] if not p.get('thought'))
        if not text: raise ValueError()
        return json.loads(text) if schema else text
    except (KeyError, IndexError, TypeError, ValueError):
        raise ValueError('Gemini가 완전한 응답을 반환하지 않았습니다. 다시 시도해주세요.') from None
