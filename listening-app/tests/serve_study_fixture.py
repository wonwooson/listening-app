"""Run the step-by-step study screen against disposable records: python tests/serve_study_fixture.py.
Uses port 5173 and a temporary database. Never reads the user's database and never calls an AI provider.
The sentences below are hand-written QA fixtures and their times do not match the audio.
"""
import os, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SOURCE = 'UVnck7nWaB4'
LINES = [
    'We are back at the Colorado School of Mines.',
    'It would be a crime if we did not do something with a shaped charge.',
    'We have done them every single time we have been here.',
    'So I thought this time we could point two of them at each other.',
    'For those who have not seen a shaped charge video, what is a shaped charge?',
    'It is an explosive where the blast starts at the back.',
    'What it does is it causes the focused jet to appear.',
    'These are used for making holes in steel or concrete.',
    'As always, these events are incredibly fast.',
    'We have got some serious gear again.',
]


def build(sentences=90, seconds=16.0):
    clips = []
    for index in range(sentences):
        start = index * seconds
        text = LINES[index % len(LINES)]
        words = text.split()
        step = (seconds - 2) / len(words)
        timed = [{'text': w, 'start': start + i * step, 'end': start + (i + 1) * step} for i, w in enumerate(words)]
        half = max(1, len(words) // 2)
        clips.append({'id': f'{SOURCE}:fixture:{index}', 'sourceId': SOURCE, 'kind': 'youtube',
                      'start': start, 'end': timed[-1]['end'], 'text': text, 'words': timed,
                      'chunks': [{'text': ' '.join(words[:half]), 'start': timed[0]['start'], 'end': timed[half - 1]['end'], 'first': 0, 'last': half - 1},
                                 {'text': ' '.join(words[half:]), 'start': timed[half]['start'], 'end': timed[-1]['end'], 'first': half, 'last': len(words) - 1}],
                      'paragraphId': f'{SOURCE}:fixture:p{index // 9}',
                      'sentenceStatus': 'runtime-ai', 'timingQuality': 'caption-estimate'})
    return {'revision': 'fixture', 'clips': clips}


def fixture_pack(clips, count=4):
    """Hand-written packs so steps 2 and 5 can be exercised without calling an AI provider."""
    items = {}
    for clip in clips[:count]:
        chunks = []
        for index, unit in enumerate(clip['chunks']):
            chunks.append({'index': index, 'meaning': f'검증용 뜻 {index + 1}',
                           'stressWordIndex': unit['last'], 'linkPoints': [unit['first']],
                           'weakWords': [unit['first'] + 1] if unit['last'] > unit['first'] + 1 else []})
        items[clip['id']] = {'clipId': clip['id'], 'chunks': chunks,
                             'order': '검증용 어순 설명입니다. 누가 무엇을 했는지 먼저 말합니다.',
                             'grammar': '검증용 문법 설명입니다.',
                             'expansion': ['We are back.', clip['text']],
                             'variations': ['We are back at the lab.'],
                             'forms': {'affirmative': clip['text'], 'negative': 'We are not back.',
                                       'question': 'Are we back?', 'past': 'We were back.',
                                       'perfect': 'We have been back.'},
                             'evidence': 'transcript-hypothesis'}
    return {'version': 'study-pack-v1', 'revision': 'fixture', 'status': 'complete', 'items': items,
            'rejected': [], 'pending': [], 'lastError': '', 'generatedAt': '2026-09-25T00:00:00+00:00',
            'model': {'provider': 'fixture', 'model': 'qa-fixture', 'configured': False}}


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='listening-study-qa-') as directory:
        os.environ['LISTENING_DB'] = str(Path(directory) / 'fixture.sqlite3')
        from backend import server
        import uvicorn
        server.maybe_recommend = lambda: None
        server.seed()
        analysis = build()
        server.store.put('preference', 'analysis:' + SOURCE, analysis)
        server.store.put('preference', 'active', {'sourceId': SOURCE})
        source = server.store.get('source', SOURCE)
        source.update(status='ready', message='검증용 고정 자막입니다.', count=len(analysis['clips']))
        server.store.put('source', SOURCE, source)
        server.store.put('preference', 'study-pack:' + SOURCE, fixture_pack(analysis['clips']))
        print(f"fixture sentences: {len(analysis['clips'])} · 약 {analysis['clips'][-1]['end'] / 60:.0f}분")
        print('http://127.0.0.1:5173/ 에서 단계별 정독 청취 탭 확인')
        uvicorn.run(server.app, host='127.0.0.1', port=5173)
