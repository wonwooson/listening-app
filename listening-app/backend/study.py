"""Step-by-step study sessions. Marks are keyed by time, because clip ids change whenever the analysis is re-run."""
import uuid
from datetime import datetime, timezone

VERSION = 'study-v1'
STEPS = (1, 2, 3, 4, 5, 6, 7)
LISTENING_STEPS = (1, 4, 7)
# Steps that ask the learner to mark what was hard; 2 and 5 record practice instead.
MARK_STEPS = (1, 3, 4, 6, 7)
RANGE_MINUTES = (3, 6, 10, 20)
REASONS = ('unheard', 'linking', 'stress', 'unknown-word')
SCOPES = ('sentence', 'words')


def now():
    return datetime.now(timezone.utc).isoformat()


def session_key(source_id, session_id):
    return f'study:{source_id}:{session_id}'


def mark_key(session_id, step, start, end):
    return f'study-mark:{session_id}:{step}:{round(start * 1000)}-{round(end * 1000)}'


def number(value):
    if type(value) not in (int, float) or value != value or value in (float('inf'), float('-inf')):
        raise ValueError('시간 값이 올바르지 않습니다.')
    return float(value)


def resolve_clip(clips, start, source_id):
    """Same rule the sound notes use: exact id first, then whichever sentence contains that moment."""
    return next((c for c in clips if c['sourceId'] == source_id and c['start'] <= start < c['end']), None)


def words_in_range(clip, start, end):
    words = (clip or {}).get('words') or []
    inside = [i for i, w in enumerate(words) if w['end'] > start + .001 and w['start'] < end - .001]
    return (inside[0], inside[-1]) if inside else (None, None)


def build_range(clips, data):
    """The learner picks a length; the stored sentences decide where it actually ends."""
    minutes = data.get('minutes')
    if minutes not in RANGE_MINUTES:
        raise ValueError('학습 범위는 3·6·10·20분 중에서 선택해주세요.')
    if not clips:
        raise ValueError('이 영상의 문장 분석이 아직 준비되지 않았어요.')
    start, end = number(data.get('start')), number(data.get('end'))
    first = next((c for c in clips if abs(c['start'] - start) < .001), None)
    last = next((c for c in clips if abs(c['end'] - end) < .001), None)
    if not first or not last or end <= start:
        raise ValueError('범위는 문장의 시작과 끝에 맞춰야 합니다.')
    span = [c for c in clips if c['end'] > start + .001 and c['start'] < end - .001]
    return {'minutes': minutes, 'start': first['start'], 'end': last['end'],
            'firstClipId': first['id'], 'lastClipId': last['id'], 'seconds': last['end'] - first['start'],
            'sentenceCount': len(span), 'paragraphCount': len({c.get('paragraphId') for c in span if c.get('paragraphId')}),
            'boundary': 'end' if last is clips[-1] else data.get('boundary') if data.get('boundary') in ('paragraph', 'sentence') else 'sentence'}


def new_session(source_id, revision, range_value):
    session_id = str(uuid.uuid4())
    return {'recordType': 'study-session', 'version': VERSION, 'id': session_id, 'sourceId': source_id,
            'analysisRevision': revision, 'range': range_value, 'currentStep': 1,
            'steps': {str(s): {'doneAt': None} for s in STEPS}, 'forms': {}, 'shadowing': {},
            'status': 'active', 'at': now(), 'endedAt': None, 'timingQuality': 'caption-estimate'}


def step_update(session, step, done, seek_detected=None):
    if step not in STEPS:
        raise ValueError('없는 단계입니다.')
    state = dict(session['steps'].get(str(step)) or {})
    state['doneAt'] = now() if done else None
    if seek_detected is not None:
        state['seekDetected'] = bool(seek_detected)
    session['steps'][str(step)] = state
    session['currentStep'] = step
    finished = all((session['steps'].get(str(s)) or {}).get('doneAt') for s in STEPS)
    session['status'] = 'done' if finished else 'active'
    session['endedAt'] = now() if finished else None
    return session


def build_mark(session, clips, data):
    step = data.get('step')
    if step not in MARK_STEPS:
        raise ValueError('이 단계는 표시를 저장하지 않습니다.')
    start, end = number(data.get('start')), number(data.get('end'))
    if start < 0 or end - start < .0999:
        raise ValueError('표시할 구간을 0.1초 이상으로 선택해주세요.')
    span = session['range']
    if start < span['start'] - .001 or end > span['end'] + .001:
        raise ValueError('학습 범위 안에서만 표시할 수 있어요.')
    if data.get('reason') not in REASONS or data.get('scope') not in SCOPES:
        raise ValueError('표시 이유를 선택해주세요.')
    note = data.get('note', '')
    if not isinstance(note, str) or len(note) > 500:
        raise ValueError('메모는 500자 이내로 입력해주세요.')
    clip = resolve_clip(clips, start, session['sourceId'])
    first, last = words_in_range(clip, start, end)
    return {'recordType': 'study-mark', 'version': VERSION, 'sessionId': session['id'],
            'sourceId': session['sourceId'], 'step': step, 'start': start, 'end': end,
            'scope': data['scope'], 'reason': data['reason'], 'note': note,
            'clipId': clip['id'] if clip else None, 'analysisRevision': session.get('analysisRevision'),
            'wordFirst': first, 'wordLast': last,
            'text': clip['text'] if clip else '', 'at': now()}


def refreshed(mark, clips):
    """Re-attach a stored mark to whatever sentence now covers its time; never drop the record."""
    clip = resolve_clip(clips, mark.get('start', 0), mark.get('sourceId'))
    first, last = words_in_range(clip, mark.get('start', 0), mark.get('end', 0))
    return {**mark, 'clipId': clip['id'] if clip else None,
            'text': clip['text'] if clip else mark.get('text', ''),
            'wordFirst': first, 'wordLast': last}


def form_update(session, clip_id, form, done):
    """Step two: the learner ticks off each sentence form they practised out loud. Self-reported, never scored."""
    from .studypack import FORMS
    if form not in FORMS:
        raise ValueError('없는 문장 형식입니다.')
    if not isinstance(clip_id, str) or not clip_id:
        raise ValueError('문장을 선택해주세요.')
    forms = dict(session.get('forms') or {})
    entry = dict(forms.get(clip_id) or {})
    if done:
        entry[form] = now()
    else:
        entry.pop(form, None)
    if entry:
        forms[clip_id] = entry
    else:
        forms.pop(clip_id, None)
    session['forms'] = forms
    return session


def shadowing_update(session, clip_id, mode, rate):
    """Step five: remember which chunking drill and speed the learner reached, so the ladder resumes."""
    if mode not in ('backward', 'forward', 'echo'):
        raise ValueError('없는 연습 방식입니다.')
    if type(rate) not in (int, float) or not .5 <= rate <= 1.5:
        raise ValueError('재생 속도가 올바르지 않습니다.')
    state = dict(session.get('shadowing') or {})
    state[clip_id] = {'mode': mode, 'rate': float(rate), 'at': now()}
    session['shadowing'] = state
    return session
