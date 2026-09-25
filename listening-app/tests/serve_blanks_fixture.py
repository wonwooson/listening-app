"""Run the blank-listening screen against disposable records: python tests/serve_blanks_fixture.py.
Uses port 5173 and a temporary database. Never reads the user's database and never calls an AI provider.
The blanks below are hand-written QA fixtures, not Gemini output, and their word times do not match the audio.
"""
import os,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

SOURCE='UVnck7nWaB4'
FIXTURES=[
 (60.0,"We haven't confirmed the cause yet.",1,'polarity',['have','had']),
 (95.0,'Not all of the devices failed.',0,'scope',['No','Now']),
 (130.0,'The current increases when the temperature rises.',3,'pattern',['which','then']),
 (170.0,'It may be caused by a damaged contact.',1,'scope',['must','my']),
 (210.0,'We used a laser to align the parts.',4,'pattern',['too','two']),
]

def build():
    clips,items=[],[]
    for index,(start,text,mask,category,distractors) in enumerate(FIXTURES):
        words=text.split()
        clip_id=f'{SOURCE}:fixture:{index}'
        clips.append({'id':clip_id,'sourceId':SOURCE,'kind':'youtube','start':start,'end':start+len(words),
            'text':text,'words':[{'text':w,'start':start+i,'end':start+i+1} for i,w in enumerate(words)],
            'chunks':[{'text':' '.join(words[:mask+1]),'start':start,'end':start+mask+1,'first':0,'last':mask},
                      {'text':' '.join(words[mask+1:]),'start':start+mask+1,'end':start+len(words),
                       'first':mask+1,'last':len(words)-1}] if mask+1<len(words) else
                     [{'text':text,'start':start,'end':start+len(words),'first':0,'last':len(words)-1}],
            'paragraphId':f'{SOURCE}:fixture:p{index//3}','sentenceStatus':'runtime-ai','timingQuality':'caption-estimate'})
        items.append({'sentence':index,'clipId':clip_id,'maskIndex':mask,'category':category,'distractors':distractors})
    return {'revision':'fixture','clips':clips},{'version':'cloze-v1','revision':'fixture','status':'complete',
        'nextSentence':len(FIXTURES),'sentenceCount':len(FIXTURES),'targets':['polarity','scope','pattern'],
        'rejected':[{'sentence':9,'reason':'검증용 표시 항목'}],'items':items,'generatedAt':'2026-09-25T00:00:00+00:00',
        'model':{'provider':'fixture','model':'qa-fixture','configured':False}}

if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='listening-blanks-qa-') as directory:
        os.environ['LISTENING_DB']=str(Path(directory)/'fixture.sqlite3')
        from backend import server
        import uvicorn
        server.maybe_recommend=lambda:None
        server.seed()
        analysis,plan=build()
        server.store.put('preference','analysis:'+SOURCE,analysis)
        server.store.put('preference','cloze:'+SOURCE,plan)
        server.store.put('preference','active',{'sourceId':SOURCE})
        source=server.store.get('source',SOURCE)
        source.update(status='ready',message='검증용 고정 자막입니다.',clozeStatus='complete',
                      clozeMessage=f'빈칸 문항 {len(plan["items"])}개 준비 완료 · 검증용 고정 데이터입니다.')
        server.store.put('source',SOURCE,source)
        server.install_cloze(SOURCE,analysis,plan)
        print('fixture blanks:',len(plan['items']),'- http://127.0.0.1:5173/ 에서 의미 이해 연습 탭 확인')
        uvicorn.run(server.app,host='127.0.0.1',port=5173)
