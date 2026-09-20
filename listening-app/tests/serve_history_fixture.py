"""Run the history UI against disposable records: python tests/serve_history_fixture.py.
Uses port 5173 and a temporary database. Never reads the user's database.
"""
import os,sys,tempfile
from pathlib import Path
from datetime import datetime,timedelta,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='listening-history-qa-') as directory:
        os.environ['LISTENING_DB']=str(Path(directory)/'fixture.sqlite3')
        from backend import server
        import uvicorn
        server.maybe_recommend=lambda:None
        server.seed()
        clip=server.sound_clips()[0]
        today=datetime.now().astimezone().replace(hour=12,minute=0,second=0,microsecond=0)
        dates=[('오늘 연습',today),('지난주 연습',today-timedelta(days=8)),('지난달 연습',today.replace(day=1)-timedelta(days=1)),('지난해 연습',today.replace(month=1,day=1)-timedelta(days=1))]
        for i,(title,day) in enumerate(dates):
            at=day.astimezone(timezone.utc).isoformat()
            note=dict(recordType='sound-note',exerciseId=f'fixture-{i}',sourceId=clip['sourceId'],start=clip['start'],end=clip['end'],target=title,heard='검증용 들린 소리',feedback='검증용 피드백',reheard='검증용 다시 들은 소리',at=at)
            server.store.put('preference',f'sound-note:fixture-{i}',note)
            server.store.put('attempt',f'fixture-{i}',dict(id=f'fixture-{i}',exerciseId=clip['id'],goal=next(iter(server.GOALS)),at=at,correct=True,scored=True,helped=False,firstExposure=True,note=title,reflection='understood',plays=1))
        uvicorn.run(server.app,host='127.0.0.1',port=5173)
