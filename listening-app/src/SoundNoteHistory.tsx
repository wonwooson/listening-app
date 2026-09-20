import {useEffect,useState} from 'react';
import DateArchive from './DateArchive';
export type SavedSoundNote={exerciseId:string;sourceId:string;clipId:string|null;title:string;start:number;end:number;heard:string;target:string;feedback:string;reheard:string;at:string};
const time=(n:number)=>`${Math.floor(n/60)}:${(n%60).toFixed(1).padStart(4,'0')}`;
export default function SoundNoteHistory({onOpen}:{onOpen:(note:SavedSoundNote)=>void}){
 const [notes,setNotes]=useState<SavedSoundNote[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[source,setSource]=useState('');
 const [retry,setRetry]=useState(0),[writtenOnly,setWrittenOnly]=useState(true);
 useEffect(()=>{let alive=true;setLoading(true);setError('');fetch('/api/sound-lab/history',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('소리 노트를 불러오지 못했어요.');return r.json();}).then(v=>{if(!Array.isArray(v))throw new Error('앱 서버를 다시 시작해주세요.');if(alive)setNotes(v);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[retry]);
 const titles=new Map(notes.map(n=>[n.sourceId,n.title]));
 const visible=notes.filter(n=>(!writtenOnly||[n.heard,n.feedback,n.reheard].some(v=>v?.trim()))&&(!source||n.sourceId===source)&&[n.title,n.target,n.heard,n.feedback,n.reheard].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="sound-note-history" aria-label="저장한 소리 노트">
  <div className="section-heading"><h2>소리 노트</h2><span>{visible.length}개 · 최근 저장순</span></div>
  <label className="sound-note-written"><input type="checkbox" checked={writtenOnly} onChange={e=>setWrittenOnly(e.target.checked)}/> 작성한 노트만 보기</label><div className="sound-note-filters"><input aria-label="소리 노트 검색" placeholder="영어 구절이나 들린 소리로 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="소리 노트 영상" value={source} onChange={e=>setSource(e.target.value)}><option value="">모든 영상</option>{[...titles].map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></div>
  {loading?<p role="status">소리 노트를 불러오고 있어요.</p>:error?<p role="alert">{error} <button className="secondary-button" onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button></p>:!visible.length?<p className="empty">{notes.length?'검색 조건에 맞는 노트가 없어요.':'아직 저장한 소리 노트가 없어요. 소리 연습실에서 구간과 기록을 저장해보세요.'}</p>:<DateArchive key={`${query}:${source}:${writtenOnly}`} records={visible} expandMatches={!!query.trim()||!!source} renderItem={n=><article key={n.exerciseId} className="sound-note-card">
   <small>{n.title} · {time(n.start)}–{time(n.end)} · {n.at?new Date(n.at).toLocaleString('ko-KR'):'저장일 없음'}</small>
   <h3>{n.target||'영어 구절 없음'}</h3>
   <dl><dt>처음 들린 소리</dt><dd>{n.heard||'아직 기록하지 않았어요.'}</dd><dt>다시 들은 소리</dt><dd>{n.reheard||'아직 기록하지 않았어요.'}</dd></dl>
   <details><summary>발음 피드백 보기</summary><p>{n.feedback||'저장한 피드백이 없어요.'}</p></details>
   {n.clipId?<button className="secondary-button" onClick={()=>onOpen(n)}>이 구간과 노트 열기</button>:<p>연결할 자막을 찾지 못했어요. 저장한 기록은 그대로 보관됩니다.</p>}
  </article>}/> }
 </section>;
}
