import {useEffect,useState} from 'react';
import SoundNoteHistory from './SoundNoteHistory';
import type {SavedSoundNote} from './SoundNoteHistory';
import DateArchive from './DateArchive';
type Skill={id:string;label:string;state:string;fresh:number;correct:number};
type Attempt={id?:string;exerciseId:string;goal:string;at:string;correct:boolean|null;scored:boolean;helped:boolean;firstExposure:boolean;note:string;plays:number};
const tabs=[['sound','소리 노트'],['meaning','의미 이해 연습 기록'],['recent','최근 연습 노트']] as const;
export default function LearningHistory({skills,goals,onOpen,onStart}:{skills:Skill[];goals:Record<string,string>;onOpen:(note:SavedSoundNote)=>void;onStart:()=>void}){
 const [tab,setTab]=useState<string>('sound');
 return <div className="page-content learning-history"><div className="page-heading"><h1>학습 기록</h1><p>필요한 기록을 펼쳐 보고, 같은 구간에서 다시 들어보세요.</p></div>
  <div className="history-tabs" role="tablist" aria-label="학습 기록 종류">{tabs.map(([id,label],index)=><button type="button" key={id} id={'history-tab-'+id} role="tab" aria-selected={tab===id} aria-controls={'history-panel-'+id} tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next][0]);document.getElementById('history-tab-'+tabs[next][0])?.focus();}}>{label}</button>)}</div>
  <section role="tabpanel" id="history-panel-sound" aria-labelledby="history-tab-sound" hidden={tab!=='sound'}><SoundNoteHistory onOpen={onOpen}/></section>
  <section role="tabpanel" id="history-panel-meaning" aria-labelledby="history-tab-meaning" hidden={tab!=='meaning'}><div className="section-heading"><h2>의미 이해 연습 기록</h2><span>전체 기간 누적</span></div><div className="skill-table">{skills.map(s=><div key={s.id}><span>{s.label}<small>{s.state}</small></span><span>{s.fresh?`${s.correct} / ${s.fresh}`:'아직 기록 없음'}<small>도움 없이 답한 앱 내 새 문장</small></span></div>)}</div><p className="history-help">날짜별 응답과 메모는 ‘최근 연습 노트’에서 확인하세요.</p></section>
  <section role="tabpanel" id="history-panel-recent" aria-labelledby="history-tab-recent" hidden={tab!=='recent'}><RecentNotes goals={goals} onStart={onStart}/></section>
 </div>;
}
function RecentNotes({goals,onStart}:{goals:Record<string,string>;onStart:()=>void}){
 const [records,setRecords]=useState<Attempt[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setLoading(true);setError('');fetch('/api/history/attempts',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('연습 기록을 불러오지 못했어요.');const v=await r.json();if(!Array.isArray(v))throw new Error('앱 서버를 다시 시작해주세요.');if(alive)setRecords(v);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[retry]);
 return <><div className="section-heading"><h2>최근 연습 노트</h2><span>{records.length}개 · 전체 저장 기록</span></div>{loading?<p role="status">연습 기록을 불러오고 있어요.</p>:error?<p role="alert">{error} <button className="secondary-button" onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button></p>:!records.length?<div className="empty"><h3>아직 연습 기록이 없어요.</h3><p>의미 이해 연습의 응답과 메모가 여기에 쌓입니다.</p><button className="primary-button" onClick={onStart}>연습 시작</button></div>:<DateArchive records={records} renderItem={(a,i)=><article className="history-attempt" key={a.id??`${a.exerciseId}:${a.at}:${i}`}><small>{new Date(a.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} · {goals[a.goal]??a.goal}</small><h3>{!a.scored?'영상 자유 청취':a.correct?'의미를 이해했어요':'다음 사례에서 다시 연결해요'}</h3><p>{a.scored?(a.helped?'도움을 사용한 응답':a.firstExposure?'앱에서 처음 연습한 문장':'다시 만난 문장'):'자기 점검 기록 · 확정 점수에 포함하지 않음'} · 재생 {a.plays}회</p>{a.note&&<blockquote>{a.note}</blockquote>}</article>}/>}</>;
}
