import unittest
from unittest.mock import patch
from backend import cloze

SENTENCE=["We","haven't","confirmed","the","cause","yet."]

def clip(index,words=None):
    words=words or SENTENCE
    start=index*10.0
    return {'id':f'VIDEOid0001:rev:{index}','sourceId':'VIDEOid0001','kind':'youtube','start':start,
            'end':start+len(words),'text':' '.join(words),
            'words':[{'text':w,'start':start+i,'end':start+i+1} for i,w in enumerate(words)],
            'chunks':[{'text':' '.join(words),'start':start,'end':start+len(words),'first':0,'last':len(words)-1}],
            'paragraphId':f'VIDEOid0001:rev:p0','sentenceStatus':'runtime-ai','timingQuality':'caption-estimate'}

def analysis(count):
    return {'revision':'rev','clips':[clip(i) for i in range(count)]}

def picks(sentences,**overrides):
    rows=[]
    for s in sentences:
        row={'sentence':s['i'],'category':'polarity','maskIndex':1,'answerEcho':s['words'][1][1],
             'distractors':['have','had']}
        row.update(overrides)
        rows.append(row)
    return {'picks':rows}

class ClozeTests(unittest.TestCase):
    def setUp(self):
        # configuration() reads the app store, which other suites tear down; the plan only records it.
        config=patch.object(cloze,'configuration',return_value={'provider':'gemini','model':'gemini-3.8-flash','configured':True})
        config.start();self.addCleanup(config.stop)

    def test_targets_are_known_goals(self):
        from backend.content import GOALS
        self.assertTrue(set(cloze.TARGETS)<=set(GOALS))

    def test_valid_plan_becomes_items(self):
        with patch.object(cloze,'ask',side_effect=lambda s:picks(s)):
            plan=cloze.build(analysis(3))
        self.assertEqual(plan['status'],'complete')
        self.assertEqual(plan['nextSentence'],3)
        self.assertEqual([i['sentence'] for i in plan['items']],[0,1,2])
        self.assertEqual(plan['rejected'],[])
        self.assertEqual(plan['targets'],list(cloze.TARGETS))
        self.assertEqual(plan['model']['provider'],'gemini')
        self.assertEqual(plan['lastError'],'')
        self.assertEqual(plan['version'],'cloze-v1')

    def test_sentences_without_a_target_are_left_out(self):
        with patch.object(cloze,'ask',side_effect=lambda s:picks(s,category='none',maskIndex=-1,answerEcho='',distractors=[])):
            plan=cloze.build(analysis(2))
        self.assertEqual(plan['status'],'complete')
        self.assertEqual(plan['items'],[])
        self.assertEqual(plan['rejected'],[])

    def test_invalid_picks_are_rejected_without_a_fallback(self):
        cases={'문장 밖의 단어 위치':{'maskIndex':99},'문장 밖의 단어 위치 (음수)':{'maskIndex':-2},
               '지정한 단어와 자막 단어가 다름':{'answerEcho':'confirmed'},
               '허용되지 않은 학습 범주':{'category':'numbers'},
               '오답 보기가 2개가 아님':{'distractors':['have']},
               '정답과 겹치는 오답 보기':{'distractors':['have','HAVE']},
               '한 단어가 아닌 오답 보기':{'distractors':['have not','had']},
               '글자가 없는 단어':{'maskIndex':0,'answerEcho':'We','distractors':['--','++']}}
        for label,override in cases.items():
            with self.subTest(label), patch.object(cloze,'ask',side_effect=lambda s,o=override:picks(s,**o)):
                plan=cloze.build(analysis(1))
            self.assertEqual(plan['items'],[],label)
            self.assertEqual(plan['status'],'complete',label)
            self.assertEqual(len(plan['rejected']),1,label)

    def test_truncated_or_padded_response_is_not_accepted(self):
        for broken in ('missing','extra','duplicate'):
            def fake(sentences,mode=broken):
                rows=picks(sentences)['picks']
                if mode=='missing': rows=rows[:-1]
                if mode=='extra': rows.append({**rows[0],'sentence':999})
                if mode=='duplicate': rows.append(dict(rows[0]))
                return {'picks':rows}
            with self.subTest(broken), patch.object(cloze,'ask',side_effect=fake) as ask:
                plan=cloze.build(analysis(3))
            self.assertEqual(plan['status'],'partial',broken)
            self.assertEqual(plan['items'],[],broken)
            self.assertEqual(plan['nextSentence'],0,broken)
            self.assertEqual(ask.call_count,2,broken)

    def test_one_retry_recovers_a_bad_batch(self):
        calls=[]
        def fake(sentences):
            calls.append(len(sentences))
            if len(calls)==1: raise ValueError('일시 오류')
            return picks(sentences)
        with patch.object(cloze,'ask',side_effect=fake):
            plan=cloze.build(analysis(2))
        self.assertEqual(plan['status'],'complete')
        self.assertEqual(len(plan['items']),2)
        self.assertEqual(len(calls),2)

    def test_long_video_is_batched_over_every_sentence(self):
        seen=[]
        def fake(sentences):
            seen.append([s['i'] for s in sentences])
            return picks(sentences)
        with patch.object(cloze,'ask',side_effect=fake):
            plan=cloze.build(analysis(95))
        self.assertEqual(len(seen),3)
        self.assertEqual([len(batch) for batch in seen],[32,32,31])
        self.assertEqual([i for batch in seen for i in batch],list(range(95)))
        self.assertEqual(len(plan['items']),95)
        self.assertEqual(plan['status'],'complete')

    def test_failed_batch_stays_partial_and_resumes(self):
        def fail_second(sentences):
            if sentences[0]['i']>=32: raise ValueError('AI 응답 실패')
            return picks(sentences)
        with patch.object(cloze,'ask',side_effect=fail_second):
            partial=cloze.build(analysis(70))
        self.assertEqual(partial['status'],'partial')
        self.assertEqual(partial['nextSentence'],32)
        self.assertEqual(len(partial['items']),32)
        self.assertEqual(partial['lastError'],'AI 응답 실패')
        with patch.object(cloze,'ask',side_effect=lambda s:picks(s)) as ask:
            resumed=cloze.build(analysis(70),partial)
        self.assertEqual(resumed['status'],'complete')
        self.assertEqual([i['sentence'] for i in resumed['items']],list(range(70)))
        self.assertEqual([s['i'] for s in ask.call_args_list[0].args[0]][0],32)

    def test_resume_restarts_when_the_analysis_revision_changed(self):
        with patch.object(cloze,'ask',side_effect=lambda s:picks(s)):
            old=cloze.build(analysis(2))
        stale={**old,'revision':'other'}
        with patch.object(cloze,'ask',side_effect=lambda s:picks(s)) as ask:
            fresh=cloze.build(analysis(2),stale)
        self.assertEqual([s['i'] for s in ask.call_args_list[0].args[0]],[0,1])
        self.assertEqual(len(fresh['items']),2)

    def test_exercises_use_transcript_words_and_stable_options(self):
        data=analysis(2)
        with patch.object(cloze,'ask',side_effect=lambda s:picks(s)):
            plan=cloze.build(data)
        items=cloze.exercises(data,plan)
        self.assertEqual([e['id'] for e in items],[c['id']+'#cloze' for c in data['clips']])
        for e in items:
            self.assertEqual(e['options'][e['answer']],"haven't")
            self.assertEqual(sorted(e['options']),sorted(["haven't",'have','had']))
            self.assertEqual(e['masked'],"We ____ confirmed the cause yet.")
            self.assertEqual(e['text'],' '.join(SENTENCE))
            self.assertEqual(e['quality'],'cloze-ai')
            self.assertEqual(e['goal'],'polarity')
            self.assertEqual(e['maskSource'],'stored-ai')
            self.assertEqual(e['timingQuality'],'caption-estimate')
        self.assertEqual([e['options'] for e in items],[e['options'] for e in cloze.exercises(data,plan)])

    def test_final_word_blank_drops_terminal_punctuation(self):
        data=analysis(1)
        plan={'revision':'rev','items':[{'sentence':0,'clipId':data['clips'][0]['id'],'maskIndex':5,
              'category':'pattern','distractors':['yes','get']}]}
        e=cloze.exercises(data,plan)[0]
        self.assertEqual(e['options'][e['answer']],'yet')
        self.assertEqual(e['masked'],"We haven't confirmed the cause ____.")

    def test_prompt_sends_indices_and_never_asks_for_timestamps(self):
        with patch.object(cloze.gemini,'generate',return_value={'picks':[]}) as generate:
            cloze.ask([{'i':0,'words':[[0,'We'],[1,"haven't"]]}])
        system,prompt,schema=generate.call_args.args
        self.assertIn('untrusted data',system)
        self.assertIn('never invent timestamps',system)
        self.assertIn('ZERO-BASED',system)
        self.assertIn('"i": 0',prompt.replace('"i":0','"i": 0'))
        self.assertNotIn('start',prompt)
        self.assertEqual(schema['properties']['picks']['items']['properties']['category']['enum'],
                         list(cloze.TARGETS)+['none'])

if __name__=='__main__':unittest.main()
