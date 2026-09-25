import tempfile, unittest
from pathlib import Path
from backend.core import Store
from backend import study

SOURCE='STUDYvid01'

def clips(count=12,revision='rev1',words=4,gap=20.0):
    out=[]
    for i in range(count):
        start=i*gap
        text=' '.join(f'w{i}-{j}' for j in range(words))
        out.append({'id':f'{SOURCE}:{revision}:{i}','sourceId':SOURCE,'kind':'youtube','start':start,
            'end':start+words,'text':text,
            'words':[{'text':f'w{i}-{j}','start':start+j,'end':start+j+1} for j in range(words)],
            'chunks':[{'text':text,'start':start,'end':start+words,'first':0,'last':words-1}],
            'paragraphId':f'{SOURCE}:{revision}:p{i//4}','sentenceStatus':'runtime-ai'})
    return out

class StudyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'study.db')
        self.clips=clips()
        self.session=study.new_session(SOURCE,'rev1',study.build_range(self.clips,
            {'minutes':3,'start':0.0,'end':self.clips[5]['end'],'boundary':'sentence'}))
    def tearDown(self): self.temp.cleanup()
    def mark(self,step=1,start=20.0,end=24.0,reason='unheard',scope='sentence'):
        return study.build_mark(self.session,self.clips,{'step':step,'start':start,'end':end,'reason':reason,'scope':scope})

    def test_range_must_match_stored_sentence_boundaries(self):
        ok=study.build_range(self.clips,{'minutes':6,'start':0.0,'end':self.clips[5]['end']})
        self.assertEqual(ok['sentenceCount'],6);self.assertEqual(ok['lastClipId'],self.clips[5]['id'])
        self.assertEqual(ok['paragraphCount'],2)
        for bad in ({'minutes':6,'start':0.0,'end':self.clips[5]['end']+1.5},{'minutes':6,'start':1.5,'end':40.0},
                    {'minutes':7,'start':0.0,'end':40.0},{'minutes':6,'start':0.0,'end':0.0}):
            with self.assertRaises(ValueError):study.build_range(self.clips,bad)
        with self.assertRaises(ValueError):study.build_range([],{'minutes':6,'start':0.0,'end':4.0})

    def test_mark_key_is_time_based_so_remarking_overwrites(self):
        a=self.mark();b=self.mark(start=20.0004,end=23.9996)
        key=study.mark_key(self.session['id'],1,a['start'],a['end'])
        self.assertEqual(key,study.mark_key(self.session['id'],1,b['start'],b['end']))
        self.store.put('preference',key,a);self.store.put('preference',key,b)
        rows=[v for v in self.store.all('preference') if v.get('recordType')=='study-mark']
        self.assertEqual(len(rows),1)
        self.assertTrue(self.store.remove('preference',key))
        self.assertFalse([v for v in self.store.all('preference') if v.get('recordType')=='study-mark'])

    def test_mark_records_words_and_sentence_by_time(self):
        whole=self.mark();self.assertEqual(whole['clipId'],self.clips[1]['id'])
        self.assertEqual((whole['wordFirst'],whole['wordLast']),(0,3))
        part=self.mark(start=21.0,end=23.0,scope='words')
        self.assertEqual((part['wordFirst'],part['wordLast']),(1,2))
        self.assertEqual(part['text'],self.clips[1]['text'])

    def test_marks_are_rejected_outside_the_range_or_without_a_reason(self):
        for bad in ({'step':1,'start':200.0,'end':204.0,'reason':'unheard','scope':'sentence'},
                    {'step':1,'start':20.0,'end':20.05,'reason':'unheard','scope':'sentence'},
                    {'step':1,'start':20.0,'end':24.0,'reason':'made-up','scope':'sentence'},
                    {'step':1,'start':20.0,'end':24.0,'reason':'unheard','scope':'paragraph'},
                    {'step':2,'start':20.0,'end':24.0,'reason':'unheard','scope':'sentence'},
                    {'step':1,'start':'x','end':24.0,'reason':'unheard','scope':'sentence'},
                    {'step':1,'start':20.0,'end':24.0,'reason':'unheard','scope':'sentence','note':'x'*501}):
            with self.assertRaises(ValueError):study.build_mark(self.session,self.clips,bad)

    def test_mark_survives_a_new_analysis_revision(self):
        saved=self.mark()
        resplit=[{**c,'id':f'{SOURCE}:rev2:{i}'} for i,c in enumerate(clips(revision='rev2'))]
        again=study.refreshed(saved,resplit)
        self.assertEqual(again['clipId'],f'{SOURCE}:rev2:1')
        self.assertEqual(again['start'],saved['start'])
        orphan=study.refreshed(saved,[])
        self.assertIsNone(orphan['clipId'])
        self.assertEqual(orphan['text'],saved['text'])
        self.assertEqual(orphan['start'],saved['start'])

    def test_session_is_done_only_after_every_step(self):
        session=self.session
        self.assertEqual(session['status'],'active')
        for step in (1,2,3,4,5,6):
            session=study.step_update(session,step,True)
            self.assertEqual(session['status'],'active',f'step {step}')
        session=study.step_update(session,7,True,seek_detected=False)
        self.assertEqual(session['status'],'done');self.assertTrue(session['endedAt'])
        self.assertIs(session['steps']['7']['seekDetected'],False)
        reopened=study.step_update(session,7,False)
        self.assertEqual(reopened['status'],'active');self.assertIsNone(reopened['endedAt'])
        for step in (0,8,'3',None):
            with self.assertRaises(ValueError):study.step_update(session,step,True)

    def test_only_marking_steps_accept_marks(self):
        for step in (1,3,4,6,7):
            self.assertEqual(self.mark(step=step,reason='linking' if step in (3,4,6) else 'unheard')['step'],step)
        for step in (2,5):
            with self.assertRaises(ValueError):self.mark(step=step)

    def test_form_checkoffs_and_shadowing_state_are_self_reported(self):
        clip=self.clips[1]['id']
        session=study.form_update(self.session,clip,'negative',True)
        self.assertIn('negative',session['forms'][clip])
        session=study.form_update(session,clip,'past',True)
        self.assertEqual(set(session['forms'][clip]),{'negative','past'})
        session=study.form_update(session,clip,'negative',False)
        self.assertEqual(set(session['forms'][clip]),{'past'})
        session=study.form_update(session,clip,'past',False)
        self.assertNotIn(clip,session['forms'])
        with self.assertRaises(ValueError):study.form_update(session,clip,'imperative',True)
        with self.assertRaises(ValueError):study.form_update(session,'','past',True)
        session=study.shadowing_update(session,clip,'backward',.85)
        self.assertEqual(session['shadowing'][clip]['mode'],'backward')
        self.assertEqual(session['shadowing'][clip]['rate'],.85)
        with self.assertRaises(ValueError):study.shadowing_update(session,clip,'humming',1.0)
        with self.assertRaises(ValueError):study.shadowing_update(session,clip,'echo',3.0)

    def test_records_survive_backup_and_do_not_touch_other_features(self):
        key=study.session_key(SOURCE,self.session['id'])
        self.store.put('preference',key,self.session)
        mark=self.mark()
        self.store.put('preference',study.mark_key(self.session['id'],1,mark['start'],mark['end']),mark)
        other=Store(Path(self.temp.name)/'restored.db');other.restore(self.store.export())
        kinds={v.get('recordType') for v in other.all('preference')}
        self.assertIn('study-session',kinds);self.assertIn('study-mark',kinds)
        self.assertEqual(other.get('preference',key)['range'],self.session['range'])
        self.assertEqual(self.store.all('session'),[])
        self.assertEqual([a for a in self.store.all('attempt')],[])

if __name__=='__main__':unittest.main()
