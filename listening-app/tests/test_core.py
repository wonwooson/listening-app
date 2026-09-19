import tempfile, unittest, json
from pathlib import Path
from backend.core import Store, video_id, choose_session, submit, summarize, now

class LearningTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'test.db')
    def tearDown(self): self.temp.cleanup()
    def event(self,s,e,t):
        self.store.insert('event',t,{'id':t,'sessionId':s['id'],'exerciseId':e['id'],'type':t,'at':now()})
    def begin(self):
        s=choose_session(self.store);e=self.store.get('exercise',s['exerciseIds'][0]);self.event(s,e,'played');return s,e
    def test_url_normalizes_and_rejects_untrusted_hosts(self):
        self.assertEqual(video_id('https://youtu.be/UVnck7nWaB4?t=60'),'UVnck7nWaB4')
        self.assertEqual(video_id('https://www.youtube.com/watch?v=UVnck7nWaB4&si=x'),'UVnck7nWaB4')
        for url in ['http://127.0.0.1/x','https://youtube.com.evil.test/watch?v=UVnck7nWaB4','https://evil@youtube.com/watch?v=UVnck7nWaB4','https://youtube.com/watch?v=x']:
            with self.assertRaises(ValueError):video_id(url)
    def test_retry_preserves_first_answer(self):
        s,e=self.begin();a=submit(self.store,s['id'],e['id'],-1)
        b=submit(self.store,s['id'],e['id'],e['answer'])
        self.assertEqual(a,b);self.assertEqual(len(self.store.all('attempt')),1)
    def test_helped_answer_not_counted_as_independent(self):
        s,e=self.begin();self.event(s,e,'transcript');a=submit(self.store,s['id'],e['id'],e['answer'])
        self.assertTrue(a['helped']);self.assertEqual(sum(x['fresh'] for x in summarize(self.store)['skills']),0)
    def test_familiar_and_content_error_not_skill_failure(self):
        s,e=self.begin();self.event(s,e,'familiar');a=submit(self.store,s['id'],e['id'],-1)
        self.assertFalse(a['firstExposure']);self.event(s,e,'content_issue')
        self.assertEqual(sum(x['count'] for x in summarize(self.store)['skills']),0)
    def test_session_survives_source_switch_and_restart(self):
        s,e=self.begin();self.store.put('preference','active',{'sourceId':'another'})
        again=Store(self.store.path);self.assertEqual(choose_session(again,source='different')['id'],s['id'])
    def test_no_playback_no_answer(self):
        s=choose_session(self.store)
        with self.assertRaises(ValueError):submit(self.store,s['id'],s['exerciseIds'][0],0)
    def test_backup_atomic_and_roundtrip(self):
        s,e=self.begin();submit(self.store,s['id'],e['id'],e['answer']);backup=self.store.export()
        other=Store(Path(self.temp.name)/'restored.db');other.restore(backup)
        self.assertEqual(other.all('attempt'),self.store.all('attempt'));self.assertEqual(other.all('review'),self.store.all('review'))
        bad={'format':'listening-notebook','version':1,'records':[{'kind':'source','id':'new','value':{}},{'kind':'secret','id':'bad','value':{}}]}
        with self.assertRaises(ValueError):other.restore(bad)
        self.assertIsNone(other.get('source','new'))
    def test_repeated_exposure_not_new(self):
        s,e=self.begin();submit(self.store,s['id'],e['id'],e['answer']);s['status']='completed';self.store.put('session',s['id'],s)
        s2={'id':'next','status':'active','index':0,'exerciseIds':[e['id']]};self.store.put('session','next',s2)
        self.store.insert('event','play2',{'type':'played','sessionId':'next','exerciseId':e['id']})
        a=submit(self.store,'next',e['id'],e['answer']);self.assertFalse(a['firstExposure'])

if __name__=='__main__':unittest.main()
