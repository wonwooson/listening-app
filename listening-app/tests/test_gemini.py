import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient
from backend import gemini
from backend.core import Store
from backend.preparation import ask, timed_words, SCHEMA, GEMINI_SCHEMA


class GeminiTests(unittest.TestCase):
    def test_key_paste_normalization(self):
        key='test.key-with-more-than-twenty-characters=='
        for value in (key,'  '+key+'  ', '"'+key+'"',"GEMINI_API_KEY='"+key+"'", 'export GOOGLE_API_KEY="'+key+'"'):
            self.assertEqual(gemini.normalize_key(value),key)
        for value in ('short',key+'\nother',key+'\u200b','https://example.com/api-key'):
            with self.assertRaises(ValueError):gemini.normalize_key(value)
    def test_windows_credential_roundtrip(self):
        key='test-key-not-a-real-credential-123456'
        encrypted=gemini.protect(key)
        self.assertNotIn(key,encrypted)
        self.assertEqual(gemini.protect(encrypted,True),key)

    def test_settings_persist_without_disclosure_or_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ,{'LISTENING_DB':str(Path(tmp)/'bootstrap.db')}):
                from backend import server
            store=Store(str(Path(tmp)/'test.db'))
            with patch.object(server,'store',store), TestClient(server.app) as client:
                key='test-key-not-a-real-credential-123456'
                result=client.post('/api/settings/gemini',json={'apiKey':'GEMINI_API_KEY="'+key+'"','model':gemini.DEFAULT_MODEL})
                self.assertEqual(result.status_code,200,result.text)
                self.assertTrue(result.json()['configured'])
                self.assertNotIn(key,result.text)
                self.assertNotIn(key,client.get('/api/settings/gemini').text)
                self.assertNotIn(key,json.dumps(store.export()))
                self.assertFalse(any(r['kind']=='secret' for r in store.export()['records']))
                encrypted=Store(str(Path(tmp)/'test.db')).get('secret','gemini')['encryptedKey']
                self.assertEqual(gemini.protect(encrypted,True),key)
                self.assertEqual(client.post('/api/settings/gemini',json={'apiKey':'bad','model':gemini.DEFAULT_MODEL}).status_code,400)
                self.assertEqual(store.get('secret','gemini')['encryptedKey'],encrypted)
                self.assertEqual(client.post('/api/settings/gemini',json={'model':gemini.DEFAULT_MODEL}).status_code,200)
                plan={'sentences':[{'end':1,'punctuation':'.','chunkEnds':[1],'paragraphEnd':True}]}
                with patch.object(gemini,'generate',return_value=plan):
                    self.assertTrue(client.post('/api/settings/gemini/test').json()['ok'])
                self.assertFalse(client.post('/api/settings/gemini',json={'remove':True}).json()['configured'])
                # Deleting Gemini must not silently switch to an inherited OpenAI key.
                self.assertEqual(server.configuration()['provider'],'gemini')
                self.assertFalse(server.configuration()['configured'])

    def test_gemini_structured_request_and_validation_errors(self):
        key='test-key-not-a-real-credential-123456'
        settings={'provider':'gemini','model':gemini.DEFAULT_MODEL,'encryptedKey':gemini.protect(key)}
        plan={'sentences':[{'end':1,'punctuation':'.','chunkEnds':[1],'paragraphEnd':True}]}
        response=Mock(ok=True)
        response.json.return_value={'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(plan)}]}}]}
        with patch.object(gemini,'read_settings',return_value=settings),patch.object(gemini.requests,'post',return_value=response) as post:
            self.assertEqual(ask(timed_words([{'text':'Hello there','start':0,'duration':2}])),{**plan,'paragraphEnds':[1]})
            self.assertEqual(post.call_args.kwargs['headers']['x-goog-api-key'],key)
            self.assertNotIn(key,post.call_args.args[0])
            self.assertEqual(post.call_args.kwargs['json']['generationConfig']['responseJsonSchema'],GEMINI_SCHEMA)
            self.assertEqual(post.call_args.kwargs['json']['generationConfig']['responseMimeType'],'application/json')
            for status in (400,401,403,404,429,500):
                response.ok=False;response.status_code=status
                with self.assertRaises(ValueError) as caught:gemini.generate('test','test')
                self.assertNotIn(key,str(caught.exception))
            response.ok=True
            response.json.return_value={'candidates':[{'finishReason':'MAX_TOKENS'}]}
            with self.assertRaises(ValueError):gemini.generate('test','test',SCHEMA)


if __name__=='__main__': unittest.main()
