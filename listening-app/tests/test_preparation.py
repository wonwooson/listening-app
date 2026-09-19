import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.preparation import timed_words, assemble, analyze
from backend.core import Store

ROWS=[{'text':'Hello there how are you','start':1,'duration':3},
      {'text':'I am fine thanks','start':4,'duration':2}]
PLAN={'sentences':[{'end':1,'punctuation':'!','chunkEnds':[1]},
                   {'end':4,'punctuation':'?','chunkEnds':[4]},
                   {'end':8,'punctuation':'.','chunkEnds':[6,8]}], 'paragraphEnds':[4,8]}


class PreparationTests(unittest.TestCase):
    def test_multiple_sources_full_coverage_and_times(self):
        words=timed_words(ROWS)
        for source in ['jNQXAC9IVRw','UVnck7nWaB4']:
            clips=assemble(source,words,PLAN,'revision')
            self.assertEqual([w['text'].rstrip('.?!') for c in clips for w in c['words']],
                             [w['text'] for w in words])
            self.assertEqual(clips[0]['start'],1)
            self.assertEqual(clips[-1]['end'],6)
            self.assertEqual(len({c['paragraphId'] for c in clips}),2)
            self.assertTrue(all(c['sourceId']==source for c in clips))
            for c in clips:
                self.assertEqual(c['chunks'][0]['start'],c['start'])
                self.assertEqual(c['chunks'][-1]['end'],c['end'])
            self.assertTrue(all(a['end']<=b['start'] for a,b in zip(clips,clips[1:])))

    def test_reject_partial_duplicate_and_out_of_range_boundaries(self):
        plans=[]
        p=copy.deepcopy(PLAN);p['sentences'].pop();plans.append(p)
        p=copy.deepcopy(PLAN);p['sentences'][1]['end']=1;plans.append(p)
        p=copy.deepcopy(PLAN);p['sentences'][2]['chunkEnds']=[2,8];plans.append(p)
        p=copy.deepcopy(PLAN);p['paragraphEnds']=[3,8];plans.append(p)
        p=copy.deepcopy(PLAN);p['sentences'][2]['end']=99;plans.append(p)
        for p in plans:
            with self.assertRaises(ValueError):assemble('video',timed_words(ROWS),p,'revision')

    def test_retry_invalid_model_output(self):
        with patch('backend.preparation.gemini.read_settings',return_value={}), patch('backend.preparation.ask',side_effect=[{'sentences':[]},PLAN]) as ask:
            self.assertEqual(analyze('video',ROWS)['wordCount'],9)
            self.assertEqual(ask.call_count,2)

    def test_invalid_timing_never_published(self):
        for rows in [[],[{'text':'hi','start':0,'duration':0}],
                     [{'text':'hi','start':float('nan'),'duration':1}]]:
            with self.assertRaises(ValueError):timed_words(rows)

    def test_pipeline_cache_failure_and_backup_across_videos(self):
        from backend import server
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(str(Path(tmp)/'test.db'))
            with patch.object(server,'store',store),patch.object(server.TimeoutSession,'get',side_effect=Exception('offline metadata')),patch('backend.preparation.ask',return_value=PLAN) as ask:
                # Use a request exception for metadata, as a real network failure would.
                with patch.object(server.TimeoutSession,'get',side_effect=server.requests.ConnectionError()):
                    for vid in ['jNQXAC9IVRw','UVnck7nWaB4']:
                        store.put('source',vid,{'id':vid,'status':'queued'})
                        store.put('preference','transcript:'+vid,{'rows':ROWS,'generated':True})
                        server.prepare(vid)
                        self.assertEqual(store.get('source',vid)['status'],'ready')
                        server.prepare(vid)
                    self.assertEqual(ask.call_count,2)
                    self.assertEqual(len(server.sound_clips()),6)
                    store.put('preference','sound-note:old',{'recordType':'sound-note','heard':'헬로'})
                    restore=Store(str(Path(tmp)/'restore.db'));restore.restore(store.export())
                    self.assertEqual(restore.get('preference','analysis:jNQXAC9IVRw')['wordCount'],9)
                    self.assertEqual(restore.get('preference','sound-note:old')['heard'],'헬로')
                    # A new source whose model fails must not acquire an artifact or ready status.
                    store.put('source','failed',{'id':'failed','status':'queued'})
                    store.put('preference','transcript:failed',{'rows':ROWS,'generated':True})
                    with patch('backend.preparation.ask',return_value={'sentences':[]}):server.prepare('failed')
                    self.assertEqual(store.get('source','failed')['status'],'blocked')
                    self.assertIsNone(store.get('preference','analysis:failed'))


if __name__=='__main__':unittest.main()
