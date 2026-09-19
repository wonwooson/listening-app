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
    def test_full_session_backup_restore_and_resume(self):
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
        self.assertEqual(report['summary']['total'],len(bundle['exercises']))
    def test_security_and_invalid_backup(self):
        self.assertEqual(self.client.post('/api/sources',json={'url':'http://localhost:9999/private'}).status_code,400)
        self.assertEqual(self.client.post('/api/sessions',json={},headers={'Origin':'https://evil.test'}).status_code,403)
        self.assertEqual(self.client.post('/api/restore',json={'version':999}).status_code,400)
    def test_duplicate_source_preserves_record(self):
        with patch.object(self.server.pool,'submit'):
            a=self.client.post('/api/sources',json={'url':'https://youtu.be/UVnck7nWaB4'}).json()
            b=self.client.post('/api/sources',json={'url':'https://www.youtube.com/watch?v=UVnck7nWaB4&t=100'}).json()
        self.assertEqual(a['id'],b['id'])
        self.assertEqual(len(self.server.store.all('source')),1)

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

if __name__=='__main__':unittest.main()
