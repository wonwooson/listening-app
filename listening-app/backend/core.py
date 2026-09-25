import json, re, sqlite3, uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from contextlib import contextmanager
from .content import EXERCISES, GOALS, BASELINE, SCORED_QUALITIES

RUN_SIZE = 12

def now(): return datetime.now(timezone.utc).isoformat()
def video_id(url):
    try:
        p=urlparse(url.strip())
        if p.scheme not in ('http','https') or p.username or p.password or p.port: raise ValueError()
        if p.hostname in ('youtu.be','www.youtu.be'): value=p.path.strip('/').split('/')[0]
        elif p.hostname in ('youtube.com','www.youtube.com','m.youtube.com'):
            parts=p.path.strip('/').split('/')
            value=parse_qs(p.query).get('v',[''])[0] if p.path=='/watch' else (parts[1] if len(parts)==2 and parts[0] in ('shorts','embed','live') else '')
        else: raise ValueError()
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}',value): raise ValueError()
        return value
    except Exception: raise ValueError('올바른 YouTube 영상 링크를 입력해주세요.')

class Store:
    def __init__(self,path):
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        self.path=str(path)
        with self.connect() as c:
            c.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(kind,id))')
        for e in EXERCISES:
            if not self.get('exercise',e['id']): self.put('exercise',e['id'],e)
        if not self.get('baseline','initial'): self.put('baseline','initial',BASELINE)
    @contextmanager
    def connect(self):
        c=sqlite3.connect(self.path,timeout=15)
        try:
            c.execute('PRAGMA journal_mode=WAL')
            with c: yield c
        finally: c.close()
    def get(self,kind,id):
        with self.connect() as c: row=c.execute('SELECT body FROM records WHERE kind=? AND id=?',(kind,id)).fetchone()
        return json.loads(row[0]) if row else None
    def all(self,kind):
        with self.connect() as c: rows=c.execute('SELECT body FROM records WHERE kind=? ORDER BY rowid',(kind,)).fetchall()
        return [json.loads(r[0]) for r in rows]
    def put(self,kind,id,value):
        with self.connect() as c: c.execute('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body',(kind,id,json.dumps(value,ensure_ascii=False)))
    def insert(self,kind,id,value):
        with self.connect() as c:
            return c.execute('INSERT OR IGNORE INTO records VALUES (?,?,?)',(kind,id,json.dumps(value,ensure_ascii=False))).rowcount>0
    def export(self):
        with self.connect() as c: rows=c.execute("SELECT kind,id,body FROM records WHERE kind!='secret'").fetchall()
        return {'format':'listening-notebook','version':1,'exportedAt':now(),'records':[{'kind':k,'id':i,'value':json.loads(b)} for k,i,b in rows]}
    def restore(self,data):
        if data.get('format')!='listening-notebook' or data.get('version')!=1 or not isinstance(data.get('records'),list): raise ValueError('지원하지 않는 백업 형식입니다.')
        rows=[]; allowed={'exercise','baseline','source','event','attempt','session','review','preference','recommendation'}
        for r in data['records']:
            if not isinstance(r,dict) or r.get('kind') not in allowed or not isinstance(r.get('id'),str) or not isinstance(r.get('value'),dict): raise ValueError('백업 항목이 올바르지 않습니다.')
            v=r['value']; k=r['kind']
            if k=='exercise':
                if v.get('kind') not in ('speech','youtube') or v.get('goal') not in GOALS or not isinstance(v.get('text'),str): raise ValueError('문항 형식 오류')
                if v['kind']=='youtube' and not re.fullmatch(r'[A-Za-z0-9_-]{11}',v.get('sourceId','')): raise ValueError('영상 ID 오류')
                if v.get('options') and (not isinstance(v.get('answer'),int) or not 0<=v['answer']<len(v['options'])): raise ValueError('정답 형식 오류')
            rows.append((k,r['id'],json.dumps(v,ensure_ascii=False)))
        with self.connect() as c:
            c.executemany('INSERT OR IGNORE INTO records VALUES (?,?,?)',rows)
        return len(rows)

def summarize(store):
    attempts=store.all('attempt'); events=store.all('event'); skills=[]
    for key,label in GOALS.items():
        flagged={x['exerciseId'] for x in events if x.get('type')=='content_issue'}
        a=[x for x in attempts if x.get('goal')==key and x.get('scored') and x['exerciseId'] not in flagged]
        fresh=[x for x in a if x.get('firstExposure') and not x.get('helped') and x.get('plays')==1]
        skills.append({'id':key,'label':label,'count':len(a),'fresh':len(fresh),'correct':sum(x.get('correct') is True for x in fresh),
           'state':'관찰 부족' if len(fresh)<3 else ('새 사례에서 이해 중' if sum(x.get('correct') is True for x in fresh)/len(fresh)>=.7 else '도움과 함께 연습 중')})
    known={e['id'] for e in store.all('exercise')}
    reviews=[r for r in store.all('review') if r['due']<=now() and r['exerciseId'] in known]
    return {'attempts':attempts[-100:][::-1],'skills':skills,'due':len(reviews),'days':len(set(x['at'][:10] for x in attempts)),
            'total':len(attempts),'events':len(events),'baseline':store.get('baseline','initial')}

def cloze_items(store,source_id,goal=None):
    """The video's AI-chosen blanks, in playback order. Rule-based caption blocks are never queued here."""
    flagged={x['exerciseId'] for x in store.all('event') if x.get('type')=='content_issue'}
    items=[e for e in store.all('exercise') if e.get('quality')=='cloze-ai' and e['sourceId']==source_id
           and e['id'] not in flagged and (not goal or e['goal']==goal)]
    return sorted(items,key=lambda e:(e['start'],e['id']))

def choose_session(store,source=None,goal=None,start=None):
    chosen=source or (store.get('preference','active') or {}).get('sourceId')
    # Checked before touching the active run, so a video without blanks never discards work in progress.
    items=cloze_items(store,chosen,goal)
    if not items: raise ValueError('이 영상의 빈칸 문항이 아직 준비되지 않았어요. 빈칸 문항 준비를 먼저 실행해주세요.')
    active=[s for s in store.all('session') if s['status']=='active']
    if active:
        current=active[-1]
        # A different video, range or filter starts a fresh run instead of finishing the old one's leftovers.
        if current.get('sourceId')==chosen and current.get('goal')==goal and not start: return current
        store.put('session',current['id'],{**current,'status':'abandoned','endedAt':now()})
    answered={a['exerciseId'] for a in store.all('attempt')}
    begin=next((i for i,e in enumerate(items) if start in (e['id'],e.get('clipId'))),None) if start else None
    if begin is None: begin=next((i for i,e in enumerate(items) if e['id'] not in answered),0)
    ordered=items[begin:begin+RUN_SIZE]
    s={'id':str(uuid.uuid4()),'exerciseIds':[e['id'] for e in ordered],'index':0,'status':'active','startedAt':now(),
       'sourceId':chosen,'goal':goal,'mode':'cloze'}
    store.put('session',s['id'],s); return s

def submit(store,session_id,exercise_id,answer,reflection=None,note=''):
    s=store.get('session',session_id)
    if not s: raise ValueError('세션을 찾을 수 없습니다.')
    key=session_id+':'+exercise_id
    existing=store.get('attempt',key)
    if existing: return existing
    if s['status']!='active' or s['exerciseIds'][s['index']]!=exercise_id: raise ValueError('현재 연습 문항이 아닙니다.')
    e=store.get('exercise',exercise_id)
    ev=[x for x in store.all('event') if x.get('sessionId')==session_id and x.get('exerciseId')==exercise_id]
    played=any(x.get('type') in ('played','external_listen') for x in ev)
    if not played: raise ValueError('먼저 소리를 재생해주세요.')
    scored=e['quality'] in SCORED_QUALITIES and bool(e.get('options')) and type(e.get('answer')) is int
    if scored and answer not in list(range(len(e['options'])))+[-1]: raise ValueError('답변을 선택해주세요.')
    if not scored and reflection not in ('understood','partial','lost'): raise ValueError('들린 정도를 선택해주세요.')
    prev=[]
    for attempt in store.all('attempt'):
        old=store.get('exercise',attempt['exerciseId'])
        # Only the same kind of item counts as prior exposure; legacy caption blocks overlap almost every sentence.
        overlap=old and e['kind']=='youtube' and old['sourceId']==e['sourceId'] and old['quality']==e['quality'] and old['start']<e['end'] and old['end']>e['start']
        if attempt['exerciseId']==exercise_id or overlap:prev.append(attempt)
    help_types={'transcript','meaning','slow','external_listen','familiar','feedback'}
    helped=any(x['type'] in help_types for x in ev)
    a={'id':key,'sessionId':session_id,'exerciseId':exercise_id,'sourceId':e['sourceId'],'goal':e['goal'],'at':now(),
       'answer':answer,'reflection':reflection,'note':note[:2000],'scored':scored,'correct':answer==e.get('answer') if scored else None,
       'firstExposure':not prev and not e.get('previouslyExposed') and not any(x['type']=='familiar' for x in ev),'helped':helped,'quality':e['quality'],'version':e['version'],
       'plays':sum(x['type']=='played' for x in ev)}
    store.insert('attempt',key,a)
    days=3 if a['correct'] and not helped else 1
    store.put('review',exercise_id,{'exerciseId':exercise_id,'goal':e['goal'],'due':(datetime.now(timezone.utc)+timedelta(days=days)).isoformat()})
    return a
