import tempfile, unittest
from pathlib import Path
from backend.core import Store, video_id, choose_session, cloze_items, submit, summarize, now
from backend import cloze

SENTENCE=["We","haven't","confirmed","the","cause","yet."]

def clips_for(source,count,revision='rev1'):
    result=[]
    for index in range(count):
        base=index*10.0
        result.append({'id':f'{source}:{revision}:{index}','sourceId':source,'kind':'youtube','start':base,
            'end':base+len(SENTENCE),'text':' '.join(SENTENCE),
            'words':[{'text':w,'start':base+i,'end':base+i+1} for i,w in enumerate(SENTENCE)],
            'chunks':[{'text':' '.join(SENTENCE),'start':base,'end':base+len(SENTENCE),'first':0,'last':len(SENTENCE)-1}],
            'paragraphId':f'{source}:{revision}:p0','sentenceStatus':'runtime-ai','timingQuality':'caption-estimate'})
    return result

def plan_for(clips,revision='rev1'):
    return {'version':cloze.VERSION,'revision':revision,'status':'complete','nextSentence':len(clips),
            'sentenceCount':len(clips),'targets':list(cloze.TARGETS),'rejected':[],
            'items':[{'sentence':i,'clipId':c['id'],'maskIndex':1,'category':'polarity','distractors':['have','had']}
                     for i,c in enumerate(clips)]}

class LearningTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'test.db')
        self.install('TESTvideo01');self.store.put('preference','active',{'sourceId':'TESTvideo01'})
    def tearDown(self): self.temp.cleanup()
    def install(self,source,count=3):
        clips=clips_for(source,count);plan=plan_for(clips)
        self.store.put('preference','analysis:'+source,{'revision':'rev1','clips':clips})
        self.store.put('preference','cloze:'+source,plan)
        for e in cloze.exercises({'revision':'rev1','clips':clips},plan): self.store.put('exercise',e['id'],e)
        return clips
    def event(self,s,e,t):
        self.store.insert('event',t,{'id':t,'sessionId':s['id'],'exerciseId':e['id'],'type':t,'at':now()})
    def begin(self):
        s=choose_session(self.store);e=self.store.get('exercise',s['exerciseIds'][0]);self.event(s,e,'played');return s,e
    def test_url_normalizes_and_rejects_untrusted_hosts(self):
        self.assertEqual(video_id('https://youtu.be/UVnck7nWaB4?t=60'),'UVnck7nWaB4')
        self.assertEqual(video_id('https://www.youtube.com/watch?v=UVnck7nWaB4&si=x'),'UVnck7nWaB4')
        for url in ['http://127.0.0.1/x','https://youtube.com.evil.test/watch?v=UVnck7nWaB4','https://evil@youtube.com/watch?v=UVnck7nWaB4','https://youtube.com/watch?v=x']:
            with self.assertRaises(ValueError):video_id(url)
    def test_blank_answer_is_scored_against_the_transcript(self):
        s,e=self.begin()
        self.assertEqual(e['options'][e['answer']],"haven't")
        a=submit(self.store,s['id'],e['id'],e['answer'])
        self.assertTrue(a['scored']);self.assertTrue(a['correct'])
        wrong=self.store.get('exercise',s['exerciseIds'][1])
        self.store.insert('event','play-b',{'id':'play-b','sessionId':s['id'],'exerciseId':wrong['id'],'type':'played','at':now()})
        s['index']=1;self.store.put('session',s['id'],s)
        b=submit(self.store,s['id'],wrong['id'],(wrong['answer']+1)%len(wrong['options']))
        self.assertTrue(b['scored']);self.assertFalse(b['correct'])
    def test_run_follows_video_order_and_resumes_after_answers(self):
        s,e=self.begin();submit(self.store,s['id'],e['id'],e['answer'])
        ordered=[x['id'] for x in cloze_items(self.store,'TESTvideo01')]
        self.assertEqual(s['exerciseIds'],ordered)
        s['status']='completed';self.store.put('session',s['id'],s)
        self.assertEqual(choose_session(self.store)['exerciseIds'][0],ordered[1])
    def test_jump_starts_a_run_at_the_requested_sentence(self):
        s,_=self.begin();ordered=[x['id'] for x in cloze_items(self.store,'TESTvideo01')]
        jumped=choose_session(self.store,start=ordered[2])
        self.assertEqual(jumped['exerciseIds'][0],ordered[2])
        self.assertEqual(self.store.get('session',s['id'])['status'],'abandoned')
    def test_authored_records_stay_but_are_never_queued(self):
        self.assertIsNotNone(self.store.get('exercise','p01'))
        for session_ids in [choose_session(self.store)['exerciseIds']]:
            self.assertTrue(all(self.store.get('exercise',i)['quality']=='cloze-ai' for i in session_ids))
    def test_flagged_sentence_leaves_the_queue(self):
        s,e=self.begin();self.event(s,e,'content_issue')
        self.assertNotIn(e['id'],[x['id'] for x in cloze_items(self.store,'TESTvideo01')])
    def test_option_order_is_stable_when_items_are_rebuilt(self):
        first=[self.store.get('exercise',x['id'])['options'] for x in cloze_items(self.store,'TESTvideo01')]
        clips=clips_for('TESTvideo01',3)
        rebuilt=[e['options'] for e in cloze.exercises({'revision':'rev1','clips':clips},plan_for(clips))]
        self.assertEqual(first,rebuilt)
    def test_helped_answer_not_counted_as_independent(self):
        s,e=self.begin();self.event(s,e,'transcript');a=submit(self.store,s['id'],e['id'],e['answer'])
        self.assertTrue(a['helped']);self.assertEqual(sum(x['fresh'] for x in summarize(self.store)['skills']),0)
    def test_familiar_and_content_error_not_skill_failure(self):
        s,e=self.begin();self.event(s,e,'familiar');a=submit(self.store,s['id'],e['id'],-1)
        self.assertFalse(a['firstExposure']);self.event(s,e,'content_issue')
        self.assertEqual(sum(x['count'] for x in summarize(self.store)['skills']),0)
    def test_due_count_ignores_reviews_without_an_exercise(self):
        s,e=self.begin();submit(self.store,s['id'],e['id'],-1)
        self.assertEqual(summarize(self.store)['due'],0)
        self.store.put('review','gone',{'exerciseId':'gone','goal':'polarity','due':'2000-01-01T00:00:00+00:00'})
        self.assertEqual(summarize(self.store)['due'],0)
    def test_session_resumes_after_restart_with_same_source(self):
        s,e=self.begin();again=Store(self.store.path)
        self.assertEqual(choose_session(again)['id'],s['id'])
    def test_switching_source_starts_new_session_and_keeps_old_attempts(self):
        s,e=self.begin();a=submit(self.store,s['id'],e['id'],e['answer'])
        self.install('OTHERvideo1')
        fresh=choose_session(self.store,source='OTHERvideo1')
        self.assertNotEqual(fresh['id'],s['id']);self.assertEqual(self.store.get('session',s['id'])['status'],'abandoned')
        self.assertEqual(self.store.get('attempt',s['id']+':'+e['id']),a)
    def test_video_without_blanks_keeps_the_active_run(self):
        s,_=self.begin()
        with self.assertRaises(ValueError):choose_session(self.store,source='EMPTYvideo1')
        self.assertEqual(self.store.get('session',s['id'])['status'],'active')
    def test_no_playback_no_answer(self):
        s=choose_session(self.store)
        with self.assertRaises(ValueError):submit(self.store,s['id'],s['exerciseIds'][0],0)
    def test_backup_atomic_and_roundtrip(self):
        s,e=self.begin();submit(self.store,s['id'],e['id'],e['answer']);backup=self.store.export()
        other=Store(Path(self.temp.name)/'restored.db');other.restore(backup)
        self.assertEqual(other.all('attempt'),self.store.all('attempt'));self.assertEqual(other.all('review'),self.store.all('review'))
        self.assertEqual(other.get('exercise',e['id'])['options'],e['options'])
        bad={'format':'listening-notebook','version':1,'records':[{'kind':'source','id':'new','value':{}},{'kind':'secret','id':'bad','value':{}}]}
        with self.assertRaises(ValueError):other.restore(bad)
        self.assertIsNone(other.get('source','new'))
    def test_repeated_exposure_not_new(self):
        s,e=self.begin();submit(self.store,s['id'],e['id'],e['answer']);s['status']='completed';self.store.put('session',s['id'],s)
        s2={'id':'next','status':'active','index':0,'exerciseIds':[e['id']]};self.store.put('session','next',s2)
        self.store.insert('event','play2',{'type':'played','sessionId':'next','exerciseId':e['id']})
        a=submit(self.store,'next',e['id'],e['answer']);self.assertFalse(a['firstExposure'])
    def test_legacy_caption_block_is_not_prior_exposure(self):
        legacy={'id':'TESTvideo01:0','sourceId':'TESTvideo01','kind':'youtube','goal':'context','prompt':'','options':[],
                'answer':None,'explanation':'','meaning':'','pattern':'','quality':'transcript_only','version':1,
                'start':0.0,'end':30.0,'text':' '.join(SENTENCE)}
        self.store.put('exercise',legacy['id'],legacy)
        old={'id':'old:'+legacy['id'],'sessionId':'old','exerciseId':legacy['id'],'goal':'context','at':now()}
        self.store.insert('attempt',old['id'],old)
        s,e=self.begin();a=submit(self.store,s['id'],e['id'],e['answer'])
        self.assertTrue(a['firstExposure'])

if __name__=='__main__':unittest.main()
