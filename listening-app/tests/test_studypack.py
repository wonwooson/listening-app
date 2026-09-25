import unittest
from unittest.mock import patch
from backend import studypack

WORDS = ['We', 'used', 'a', 'laser', 'to', 'align', 'the', 'parts.']


def clip(index=0):
    start = index * 10.0
    return {'id': f'PACKvideo01:rev:{index}', 'sourceId': 'PACKvideo01', 'start': start, 'end': start + len(WORDS),
            'text': ' '.join(WORDS),
            'words': [{'text': w, 'start': start + i, 'end': start + i + 1} for i, w in enumerate(WORDS)],
            'chunks': [{'text': ' '.join(WORDS[:4]), 'start': start, 'end': start + 4, 'first': 0, 'last': 3},
                       {'text': ' '.join(WORDS[4:]), 'start': start + 4, 'end': start + len(WORDS), 'first': 4, 'last': 7}]}


def analysis(count=2):
    return {'revision': 'rev', 'clips': [clip(i) for i in range(count)]}


def pack_for(sentences, **overrides):
    rows = []
    for s in sentences:
        row = {'sentence': s['i'],
               'chunks': [{'index': 0, 'meaning': '우리는 레이저를 사용했다', 'stressWordIndex': 3, 'linkPoints': [1], 'weakWords': [2]},
                          {'index': 1, 'meaning': '부품을 정렬하려고', 'stressWordIndex': 5, 'linkPoints': [4], 'weakWords': [6]}],
               'order': '먼저 누가 무엇을 했는지 말하고, 그다음 목적을 붙입니다.',
               'grammar': 'used + 목적어 뒤에 to 부정사가 목적을 나타냅니다.',
               'expansion': ['We used a laser.', 'We used a laser to align the parts.'],
               'variations': ['We used a microscope to inspect the surface.'],
               'forms': {'affirmative': 'We used a laser to align the parts.',
                         'negative': "We didn't use a laser to align the parts.",
                         'question': 'Did we use a laser to align the parts?',
                         'past': 'We used a laser to align the parts.',
                         'perfect': 'We have used a laser to align the parts.'}}
        row.update(overrides)
        rows.append(row)
    return {'packs': rows}


class StudyPackTests(unittest.TestCase):
    def setUp(self):
        config = patch.object(studypack, 'configuration',
                              return_value={'provider': 'gemini', 'model': 'gemini-3.8-flash', 'configured': True})
        config.start()
        self.addCleanup(config.stop)

    def test_pack_is_built_only_for_the_requested_sentences(self):
        data = analysis(3)
        wanted = [data['clips'][0]['id'], data['clips'][2]['id']]
        with patch.object(studypack, 'ask', side_effect=lambda s: pack_for(s)) as ask:
            pack = studypack.build(data, wanted)
        self.assertEqual(pack['status'], 'complete')
        self.assertEqual(sorted(pack['items']), sorted(wanted))
        self.assertEqual([s['i'] for s in ask.call_args.args[0]], [0, 2])
        item = pack['items'][wanted[0]]
        self.assertEqual(item['evidence'], 'transcript-hypothesis')
        self.assertEqual(len(item['chunks']), 2)
        self.assertEqual(set(item['forms']), set(studypack.FORMS))

    def test_already_built_sentences_are_not_requested_again(self):
        data = analysis(2)
        first, second = (c['id'] for c in data['clips'])
        with patch.object(studypack, 'ask', side_effect=lambda s: pack_for(s)):
            pack = studypack.build(data, [first])
        with patch.object(studypack, 'ask', side_effect=lambda s: pack_for(s)) as ask:
            again = studypack.build(data, [first, second], pack)
        self.assertEqual([s['i'] for s in ask.call_args.args[0]], [1])
        self.assertEqual(sorted(again['items']), sorted([first, second]))

    def test_indexes_outside_the_stored_sentence_are_rejected(self):
        data = analysis(1)
        cases = {
            '강세 단어가 청크 밖에 있음': {'chunks': [{'index': 0, 'meaning': '뜻', 'stressWordIndex': 7, 'linkPoints': [], 'weakWords': []},
                                          {'index': 1, 'meaning': '뜻', 'stressWordIndex': 5, 'linkPoints': [], 'weakWords': []}]},
            '연음·약화 단어 위치가 범위를 벗어남': {'chunks': [{'index': 0, 'meaning': '뜻', 'stressWordIndex': 3, 'linkPoints': [99], 'weakWords': []},
                                              {'index': 1, 'meaning': '뜻', 'stressWordIndex': 5, 'linkPoints': [], 'weakWords': []}]},
            '청크 개수가 저장된 분석과 다름': {'chunks': [{'index': 0, 'meaning': '뜻', 'stressWordIndex': 3, 'linkPoints': [], 'weakWords': []}]},
            '청크 뜻이 비어 있거나 너무 김': {'chunks': [{'index': 0, 'meaning': '  ', 'stressWordIndex': 3, 'linkPoints': [], 'weakWords': []},
                                          {'index': 1, 'meaning': '뜻', 'stressWordIndex': 5, 'linkPoints': [], 'weakWords': []}]},
            '어순·문법 설명이 비어 있거나 너무 김': {'order': ''},
            '확장 예시가 비어 있음': {'expansion': []},
            '문장 형식 예시가 비어 있음': {'forms': {'affirmative': 'x', 'negative': 'x', 'question': 'x', 'past': 'x', 'perfect': ''}},
        }
        for label, override in cases.items():
            with self.subTest(label), patch.object(studypack, 'ask', side_effect=lambda s, o=override: pack_for(s, **o)):
                pack = studypack.build(data, [data['clips'][0]['id']])
            self.assertEqual(pack['items'], {}, label)
            self.assertEqual(pack['status'], 'complete', label)
            self.assertEqual(pack['rejected'][0]['reason'], label)

    def test_a_truncated_response_never_publishes_a_partial_pack(self):
        data = analysis(2)
        wanted = [c['id'] for c in data['clips']]
        with patch.object(studypack, 'ask', side_effect=lambda s: pack_for(s[:1])) as ask:
            pack = studypack.build(data, wanted)
        self.assertEqual(pack['status'], 'partial')
        self.assertEqual(pack['items'], {})
        self.assertEqual(pack['pending'], wanted)
        self.assertIn('모두 다루지', pack['lastError'])
        self.assertEqual(ask.call_count, 2)

    def test_batches_stay_small_and_cover_every_requested_sentence(self):
        data = analysis(15)
        wanted = [c['id'] for c in data['clips']]
        seen = []

        def fake(sentences):
            seen.append([s['i'] for s in sentences])
            return pack_for(sentences)

        with patch.object(studypack, 'ask', side_effect=fake):
            pack = studypack.build(data, wanted)
        self.assertEqual([len(b) for b in seen], [6, 6, 3])
        self.assertEqual([i for b in seen for i in b], list(range(15)))
        self.assertEqual(len(pack['items']), 15)
        self.assertEqual(pack['status'], 'complete')

    def test_prompt_carries_indexes_and_forbids_rewriting(self):
        with patch.object(studypack.gemini, 'generate', return_value={'packs': []}) as generate:
            studypack.ask([{'i': 0, 'text': 'x', 'words': [[0, 'We']], 'chunks': [[0, 'We', 0, 0]]}])
        system, prompt, schema = generate.call_args.args
        self.assertIn('untrusted data', system)
        self.assertIn('Never rewrite the original transcript words', system)
        self.assertIn('never grade the learner', system)
        self.assertIn('Korean', system)
        self.assertEqual(set(schema['properties']['packs']['items']['properties']['forms']['properties']), set(studypack.FORMS))
        self.assertIn('"i": 0', prompt.replace('"i":0', '"i": 0'))


if __name__ == '__main__':
    unittest.main()
