import os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        os.environ['LISTENING_DB']=str(Path(cls.temp.name)/'api.db')
        from backend import server
        cls.server=server
    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup();os.environ.pop('LISTENING_DB',None)
    def setUp(self):
        self.scheduler=patch.object(self.server,'maybe_recommend');self.scheduler.start()
        self.client=TestClient(self.server.app);self.client.__enter__()
    def tearDown(self):self.client.__exit__(None,None,None);self.scheduler.stop()
    def install_blanks(self,source,count=3,base=400.0,artifact=False):
        """Blanks built from a stored analysis shape. Times stay outside the seeded prior-exposure windows."""
        from backend import cloze
        words=["We","haven't","confirmed","the","cause","yet."]
        clips=[]
        for index in range(count):
            start=base+index*10
            clips.append({'id':f'{source}:apirev:{index}','sourceId':source,'kind':'youtube','start':start,
                'end':start+len(words),'text':' '.join(words),
                'words':[{'text':w,'start':start+i,'end':start+i+1} for i,w in enumerate(words)],
                'chunks':[{'text':' '.join(words),'start':start,'end':start+len(words),'first':0,'last':len(words)-1}],
                'paragraphId':f'{source}:apirev:p0','sentenceStatus':'runtime-ai','timingQuality':'caption-estimate'})
        plan={'version':cloze.VERSION,'revision':'apirev','status':'complete','nextSentence':count,'sentenceCount':count,
              'targets':list(cloze.TARGETS),'rejected':[],
              'items':[{'sentence':i,'clipId':c['id'],'maskIndex':1,'category':'polarity','distractors':['have','had']}
                       for i,c in enumerate(clips)]}
        analysis={'revision':'apirev','clips':clips}
        if artifact:
            self.server.store.put('preference','analysis:'+source,analysis)
            self.server.store.put('preference','cloze:'+source,plan)
            self.server.store.put('source',source,{'id':source,'title':'빈칸 테스트 영상','count':count,
                'url':'https://www.youtube.com/watch?v='+source,'status':'ready','message':'준비 완료'})
        items=cloze.exercises(analysis,plan)
        for e in items: self.server.store.put('exercise',e['id'],e)
        return [e['id'] for e in items]
    def test_full_session_backup_restore_and_resume(self):
        self.install_blanks('UVnck7nWaB4')
        before=self.client.get('/api/state').json()['summary']['total']
        s=self.client.post('/api/sessions',json={}).json();bundle=self.client.get('/api/sessions/'+s['id']).json()
        for i,e in enumerate(bundle['exercises']):
            event={'id':f'event-{i}','type':'played','sessionId':s['id'],'exerciseId':e['id']}
            self.assertEqual(self.client.post('/api/events',json=event).status_code,200)
            self.assertEqual(self.client.post('/api/events',json=event).status_code,200)
            answer={'sessionId':s['id'],'exerciseId':e['id'],'answer':e['answer'],'reflection':'partial','note':'API integration test'}
            result=self.client.post('/api/attempts',json=answer)
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['plays'],1)
            advanced=self.client.post('/api/sessions/'+s['id']+'/next',json={'index':i}).json()
            retry=self.client.post('/api/sessions/'+s['id']+'/next',json={'index':i}).json()
            self.assertEqual(advanced['index'],retry['index'])
        self.assertEqual(advanced['status'],'completed')
        backup=self.client.get('/api/backup').json()
        self.assertEqual(self.client.post('/api/restore',json=backup).status_code,200)
        report=self.client.get('/api/state').json()
        self.assertEqual(report['summary']['total']-before,len(bundle['exercises']))
        self.assertTrue(all(e['quality']=='cloze-ai' for e in bundle['exercises']))
    def test_security_and_invalid_backup(self):
        self.assertEqual(self.client.post('/api/sources',json={'url':'http://localhost:9999/private'}).status_code,400)
        self.assertEqual(self.client.post('/api/sessions',json={},headers={'Origin':'https://evil.test'}).status_code,403)
        self.assertEqual(self.client.post('/api/restore',json={'version':999}).status_code,400)
    def test_duplicate_source_preserves_record(self):
        before=len(self.server.store.all('source'))
        with patch.object(self.server.pool,'submit'):
            a=self.client.post('/api/sources',json={'url':'https://youtu.be/UVnck7nWaB4'}).json()
            b=self.client.post('/api/sources',json={'url':'https://www.youtube.com/watch?v=UVnck7nWaB4&t=100'}).json()
        self.assertEqual(a['id'],b['id'])
        self.assertEqual(len(self.server.store.all('source')),before)
        self.assertEqual(len([s for s in self.server.store.all('source') if s['id']==a['id']]),1)

    def test_sound_notes_roundtrip_backup_and_validation(self):
        clip=self.client.get('/api/sound-lab').json()['clips'][0]
        note={'exerciseId':clip['id'],'start':clip['start'],'end':clip['end'],
              'heard':'워릿더즈','target':'what it does','feedback':'자막 기반 가설','reheard':'워릿 더즈'}
        result=self.client.post('/api/sound-lab/notes',json=note)
        self.assertEqual(result.status_code,200,result.text)
        saved=next(n for n in self.client.get('/api/sound-lab').json()['notes'] if n['exerciseId']==clip['id'])
        self.assertEqual(saved['heard'],note['heard'])
        self.assertEqual(saved['reheard'],note['reheard'])
        backup=self.client.get('/api/backup').json()
        self.assertTrue(any(r['value'].get('recordType')=='sound-note' for r in backup['records']))
        self.assertEqual(self.client.post('/api/restore',json=backup).status_code,200)
        for bad in ({'end':note['start']},{'start':-1},{'heard':[]},{'end':999999},{'exerciseId':'missing'}):
            self.assertEqual(self.client.post('/api/sound-lab/notes',json={**note,**bad}).status_code,400)
        self.assertEqual(self.client.get('/api/sound-lab').json()['notes'][-1]['heard'],note['heard'])

    def test_history_attempts_keeps_more_than_recent_100(self):
        records=[{'id':str(i),'at':f'2026-01-{i%28+1:02d}T12:00:00+00:00','note':f'note {i}'} for i in range(125)]
        with patch.object(self.server.store,'all',return_value=records):
            response=self.client.get('/api/history/attempts')
        self.assertEqual(response.status_code,200)
        rows=response.json()
        self.assertEqual(len(rows),125)
        self.assertEqual({r['id'] for r in rows},{r['id'] for r in records})
        self.assertEqual([r['at'] for r in rows],sorted((r['at'] for r in records),reverse=True))

    def test_sound_history_keeps_legacy_and_unlinked_notes(self):
        notes=[{'recordType':'sound-note','exerciseId':id,'sourceId':'v','start':start,'end':start+1,'heard':id,'at':date}
               for id,start,date in [('old-a',2,'2026-01-01'),('old-b',3,'2026-01-03'),('missing',99,'2026-01-02')]]
        clips=[{'id':'new','sourceId':'v','start':0,'end':10}]
        with patch.object(self.server,'sound_clips',return_value=clips), patch.object(self.server.store,'all',side_effect=lambda kind:notes if kind=='preference' else [{'id':'v','title':'Video'}]):
            response=self.client.get('/api/sound-lab/history')
        self.assertEqual(response.status_code,200)
        rows=response.json()
        self.assertEqual([n['exerciseId'] for n in rows],['old-b','missing','old-a'])
        self.assertEqual([n['clipId'] for n in rows],['new',None,'new'])
        self.assertEqual(rows[0]['heard'],'old-b')
        self.assertEqual(rows[0]['title'],'Video')

    def test_sound_feedback_requires_input_and_model(self):
        clip=self.client.get('/api/sound-lab').json()['clips'][0]
        data={'exerciseId':clip['id'],'start':clip['start'],'end':clip['end'],'heard':''}
        self.assertEqual(self.client.post('/api/sound-lab/feedback',json=data).status_code,400)
        with patch.dict(os.environ,{'LISTENING_AI_MODEL':''}):
            self.assertEqual(self.client.post('/api/sound-lab/feedback',json={**data,'heard':'워릿'}).status_code,409)

    def test_whole_video_sentence_coverage_and_source_words(self):
        from backend.sentences import normalized
        clips=self.client.get('/api/sound-lab').json()['clips']
        video=[c for c in clips if c['sourceId']=='UVnck7nWaB4']
        self.assertGreater(len(video),200)
        self.assertTrue(all(c['sentenceStatus'] in ('edited','ai-reviewed') for c in video))
        original=[normalized(t) for r in self.server.provided_transcript() for t in r['text'].split()]
        displayed=[normalized(t) for c in video for t in c['text'].split()]
        self.assertEqual(displayed,original)
        self.assertTrue(all(a['end']<=b['start']+.00001 for a,b in zip(video,video[1:])))
        self.assertEqual(len({c['id'] for c in video}),len(video))
        self.assertEqual(video[-1]['text'],'Thanks for watching.')
        self.assertTrue(any(c['text']=="It'll probably be completely useless for analyzing the shape charge." for c in video))
        self.assertTrue(any(c['text']=='Over here we\'ve got the shimatsu.' for c in video))

    def test_sound_feedback_prompt_distinguishes_hypothesis_from_audio(self):
        clip=self.client.get('/api/sound-lab').json()['clips'][0]
        data={'exerciseId':clip['id'],'start':clip['start'],'end':clip['end'],'heard':'워릿','target':'what it','reheard':'왓잇'}
        with patch.dict(os.environ,{'LISTENING_AI_MODEL':'test-model'}),patch.object(self.server.requests,'post') as post:
            post.return_value.json.return_value={'response':'자막 기반 발음 가설입니다.'}
            response=self.client.post('/api/sound-lab/feedback',json=data)
            self.assertEqual(response.status_code,200,response.text)
            sent=post.call_args.kwargs['json']
            self.assertIn('NOT heard the audio',sent['system'])
            self.assertIn('왓잇',sent['prompt'])

    def test_blank_overview_progress_and_jump(self):
        ids=self.install_blanks('CLOZEvideo1',artifact=True)
        overview=self.client.get('/api/cloze/CLOZEvideo1').json()
        self.assertEqual([i['id'] for i in overview['items']],ids)
        self.assertEqual(overview['status'],'complete')
        self.assertEqual(overview['sentenceCount'],3)
        self.assertEqual(overview['maskSource'],'stored-ai')
        self.assertEqual(overview['timingQuality'],'caption-estimate')
        self.assertEqual(overview['items'][0]['maskIndex'],1)
        self.assertEqual(overview['items'][0]['masked'],"We ____ confirmed the cause yet.")
        self.assertTrue(overview['items'][0]['words'] and overview['items'][0]['chunks'])
        session=self.client.post('/api/sessions',json={'sourceId':'CLOZEvideo1','startClipId':ids[1]}).json()
        self.assertEqual(session['exerciseIds'][0],ids[1])
        exercise=self.client.get('/api/sessions/'+session['id']).json()['exercises'][0]
        self.client.post('/api/events',json={'id':'blank-play','type':'played','sessionId':session['id'],'exerciseId':exercise['id']})
        answer=self.client.post('/api/attempts',json={'sessionId':session['id'],'exerciseId':exercise['id'],
            'answer':exercise['answer'],'note':'해븐트'})
        self.assertEqual(answer.status_code,200,answer.text)
        self.assertTrue(answer.json()['correct']);self.assertEqual(answer.json()['note'],'해븐트')
        after={i['id']:i['state'] for i in self.client.get('/api/cloze/CLOZEvideo1').json()['items']}
        self.assertEqual(after[ids[1]],'correct');self.assertEqual(after[ids[0]],'open')

    def test_blank_session_requires_prepared_items(self):
        self.assertEqual(self.client.post('/api/sessions',json={'sourceId':'EMPTYvideo1'}).status_code,409)
        self.assertEqual(self.client.get('/api/cloze/EMPTYvideo1').status_code,404)

    def test_blank_feedback_sends_one_sentence_only_and_caches(self):
        ids=self.install_blanks('FEEDvideo01',artifact=True)
        path='/api/cloze/'+ids[0].replace('#','%23')+'/feedback'
        with patch.dict(os.environ,{'LISTENING_AI_MODEL':''}),patch.object(self.server,'configuration',
                return_value={'provider':'openai','model':'x','configured':False}):
            self.assertEqual(self.client.post(path,json={'heard':'해븐트'}).status_code,409)
        with patch.object(self.server,'configuration',return_value={'provider':'gemini','model':'gemini-3.8-flash','configured':True}), \
             patch.object(self.server.gemini,'generate',return_value='자막 텍스트 기반 가설입니다.') as generate:
            first=self.client.post(path,json={'heard':'해븐트','picked':'have'})
            self.assertEqual(first.status_code,200,first.text)
            self.assertFalse(first.json()['cached'])
            system,prompt=generate.call_args.args[0],generate.call_args.args[1]
            self.assertIn('NOT heard the audio',system)
            self.assertIn('해븐트',prompt);self.assertIn("We haven't confirmed the cause yet.",prompt)
            self.assertNotIn('Thanks for watching',prompt)
            self.assertLess(len(prompt),1200)
            second=self.client.post(path,json={'heard':'해븐트','picked':'have'})
            self.assertTrue(second.json()['cached']);self.assertEqual(generate.call_count,1)
        self.assertEqual(self.client.post(path,json={'heard':'x'*2001}).status_code,400)

    def test_study_session_marks_and_history(self):
        self.install_blanks('STUDYapi001',artifact=True)
        overview=self.client.get('/api/study/STUDYapi001').json()
        self.assertEqual(len(overview['clips']),3)
        self.assertIsNone(overview['session'])
        self.assertEqual(overview['rangeMinutes'],[3,6,10,20])
        self.assertEqual(overview['listeningSteps'],[1,2,3,4,5,6,7])
        self.assertEqual(overview['markSteps'],[1,3,4,6,7])
        self.assertEqual(overview['forms'],['affirmative','negative','question','past','perfect'])
        clips=overview['clips']
        body={'minutes':3,'start':clips[0]['start'],'end':clips[-1]['end'],'boundary':'sentence'}
        self.assertEqual(self.client.post('/api/study/STUDYapi001/sessions',
            json={**body,'end':body['end']+2}).status_code,400)
        session=self.client.post('/api/study/STUDYapi001/sessions',json=body).json()
        self.assertEqual(session['range']['sentenceCount'],3)
        self.assertEqual(session['status'],'active')
        marked=self.client.post(f"/api/study/sessions/{session['id']}/marks",
            json={'step':1,'start':clips[1]['start'],'end':clips[1]['end'],'reason':'unheard','scope':'sentence'})
        self.assertEqual(marked.status_code,200,marked.text)
        saved=marked.json()['marks'][0]
        self.assertEqual(saved['clipId'],clips[1]['id'])
        self.assertEqual(saved['wordFirst'],0)
        self.assertEqual(self.client.post(f"/api/study/sessions/{session['id']}/marks",
            json={'step':2,'start':clips[1]['start'],'end':clips[1]['end'],'reason':'unheard','scope':'sentence'}).status_code,400)
        for step in (1,2,3,4,5,6,7):
            done=self.client.post(f"/api/study/sessions/{session['id']}/step",json={'step':step,'done':True})
            self.assertEqual(done.status_code,200,done.text)
        self.assertEqual(done.json()['status'],'done')
        form=self.client.post(f"/api/study/sessions/{session['id']}/forms",
            json={'clipId':clips[1]['id'],'form':'negative','done':True})
        self.assertEqual(form.status_code,200,form.text)
        self.assertIn('negative',form.json()['forms'][clips[1]['id']])
        self.assertEqual(self.client.post(f"/api/study/sessions/{session['id']}/forms",
            json={'clipId':clips[1]['id'],'form':'nope','done':True}).status_code,400)
        self.assertEqual(self.client.post(f"/api/study/sessions/{session['id']}/shadowing",
            json={'clipId':clips[1]['id'],'mode':'echo','rate':0.75}).status_code,200)
        history=self.client.get('/api/study/history').json()
        row=next(r for r in history if r['id']==session['id'])
        self.assertEqual(row['markCount'],1)
        self.assertEqual(row['title'],'빈칸 테스트 영상')
        removed=self.client.post(f"/api/study/sessions/{session['id']}/marks",
            json={'step':1,'start':clips[1]['start'],'end':clips[1]['end'],'remove':True}).json()
        self.assertTrue(removed['removed']);self.assertEqual(removed['marks'],[])
        self.assertEqual(self.client.get('/api/study/NOSUCHvid1').status_code,404)

if __name__=='__main__':unittest.main()
