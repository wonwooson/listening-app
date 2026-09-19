import unittest
from backend.sentences import sentence_view, OPENING, reviewed_boundaries

def clip(id,start,end,text,provenance='user-xlsx',source='UVnck7nWaB4'):
    return dict(id=id,sourceId=source,start=start,end=end,text=text,provenance=provenance,kind='youtube')

class SentenceTests(unittest.TestCase):
    def test_two_tracks_do_not_duplicate_opening(self):
        original="hello I'm gav I'm Dan"
        clips=[clip('sheet',0,2,original),clip('auto',.04,2.1,original,'youtube-auto')]
        result=sentence_view(clips)
        self.assertEqual([c['text'] for c in result],["Hello, I'm Gav.","I'm Dan."])
        self.assertEqual(len({c['id'] for c in result}),2)
        self.assertEqual(result[0]['end'],result[1]['start'])
        self.assertEqual(clips[0]['text'],original)

    def test_sentence_can_cross_caption_rows(self):
        text=' '.join(original for original,_ in OPENING)
        tokens=text.split();cut=5
        rows=[dict(start=0,duration=2,text=' '.join(tokens[:cut])),dict(start=2,duration=61,text=' '.join(tokens[cut:]))]
        result=sentence_view([clip('sheet',0,63,text)],rows)
        self.assertEqual(len(result),27)
        self.assertTrue(all(c['sentenceStatus']=='edited' for c in result))
        self.assertTrue(all(a['end']<=b['start'] for a,b in zip(result,result[1:])))
        self.assertTrue(all(c['text'][-1] in '.?!' for c in result))
        self.assertTrue(all(' '.join(w['text'] for w in c['words'])==c['text'] for c in result))

    def test_missing_punctuation_is_not_certified_sentence(self):
        result=sentence_view([clip('x',0,4,'this has no punctuation',source='different')])
        self.assertEqual(result[0]['sentenceStatus'],'candidate')
        self.assertEqual(result[0]['text'],'this has no punctuation')

    def test_unprepared_cues_do_not_receive_fake_periods(self):
        clips=[clip('a',0,30,'this sentence continues',source='different'),clip('b',30,35,'in the next caption',source='different')]
        result=sentence_view(clips)
        self.assertEqual([c['text'] for c in result],['this sentence continues','in the next caption'])
        self.assertTrue(all(c['sentenceStatus']=='candidate' for c in result))

    def test_incomplete_boundary_plan_is_rejected(self):
        with self.assertRaises(ValueError): reviewed_boundaries([dict(text='unexpected')],0)

    def test_real_repeat_and_existing_punctuation_are_preserved(self):
        result=sentence_view([clip('x',0,4,'Go. Go.',source='different')])
        self.assertEqual([c['text'] for c in result],['Go.','Go.'])
        self.assertTrue(all(c['sentenceStatus']=='original' for c in result))

    def test_empty_track(self):
        self.assertEqual(sentence_view([]),[])
