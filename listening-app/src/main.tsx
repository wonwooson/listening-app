import React, {useEffect,useState,useRef,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {Headphones, Play, Plus, BookOpen, ListOrdered, Library, ChartNoAxesCombined, Settings, Volume2, ExternalLink, Download, Upload, ChevronRight, CircleHelp, X, LoaderCircle, CheckCircle2} from 'lucide-react';
import './style.css';
import SoundLab from './SoundLab';
import LearningHistory from './LearningHistory';
import type {SavedSoundNote} from './SoundNoteHistory';
import GeminiSettings from './GeminiSettings';
import Cloze from './Cloze';
import StudyFlow from './StudyFlow';

type Session={id:string;exerciseIds:string[];index:number;status:string;startedAt:string};
type Attempt={exerciseId:string;goal:string;at:string;correct:boolean|null;scored:boolean;helped:boolean;firstExposure:boolean;note:string;reflection:string;plays:number};
type Source={id:string;title:string;url:string;status:string;message:string;count:number};
type Skill={id:string;label:string;count:number;fresh:number;correct:number;state:string};
type AppState={sources:Source[];session:Session|null;active:{sourceId:string}|null;goals:Record<string,string>;summary:{attempts:Attempt[];skills:Skill[];due:number;days:number;total:number;baseline:{date:string;reviewDate:string;summary:string;observations:string[];note:string}};ai:{configured:boolean;model:string};recommendations:{id:string;title:string;url:string;reason:string;type:string;checkedAt:string;available:boolean}[];recommendationCheck:{status:string;attemptedAt:string}|null};
declare global {interface Window {YT:any;onYouTubeIframeAPIReady:()=>void}}

async function api<T=any>(path:string,data?:unknown):Promise<T>{
 const r=await fetch('/api'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 const v=await r.json(); if(!r.ok)throw new Error(typeof v.detail==='string'?v.detail:'요청을 처리하지 못했어요. 다시 시도해주세요.'); return v;
}
const date=(s:string)=>new Date(s).toLocaleDateString('ko-KR',{month:'long',day:'numeric'});
function App(){
 const [soundNote,setSoundNote]=useState<SavedSoundNote|null>(null);
 const [state,setState]=useState<AppState|null>(null);const [page,setPage]=useState('sound');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [url,setUrl]=useState('');const [toast,setToast]=useState('');
 const refresh=useCallback(async()=>{try{setState(await api<AppState>('/state'));}catch(x){setError((x as Error).message);}},[]);
 useEffect(()=>{void refresh();const t=setInterval(()=>void refresh(),6000);return()=>clearInterval(t);},[refresh]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);}},[toast]);
 async function add(ev:React.FormEvent){ev.preventDefault();if(!url.trim())return;setBusy(true);setError('');try{await api('/sources',{url});setUrl('');setPage('library');await refresh();setToast('영상 준비를 시작했어요. 기존 연습은 계속할 수 있어요.');}catch(x){setError((x as Error).message);}finally{setBusy(false);}}
 const nav=[['sound','소리 연습실',Headphones],['home','의미 이해 연습',Volume2],['study','단계별 정독 청취',ListOrdered],['library','내 영상',Library],['history','학습 기록',ChartNoAxesCombined],['baseline','나의 출발점',BookOpen],['settings','설정과 백업',Settings]] as const;
 const linkForm=<form className="link-form" onSubmit={add}><label htmlFor="video-url">새 영상으로 이어가기</label><div><input id="video-url" type="url" placeholder="YouTube 링크를 붙여넣으세요" value={url} onChange={e=>setUrl(e.target.value)} required/><button disabled={busy} aria-label="영상 추가">{busy?<LoaderCircle className="spin" size={20}/>:<Plus size={22}/>}</button></div><small>자막과 연습 구간은 자동으로 준비합니다.</small></form>;
 if(!state)return <main className="loading"><Headphones size={36}/><h1>듣는 노트를 열고 있어요</h1>{error?<><p>{error}</p><button onClick={()=>void refresh()}>다시 연결</button></>:<LoaderCircle className="spin"/>}</main>;
 const summary=state.summary;
 return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('home');}}><span className="brand-icon"><Headphones size={24}/></span><span>듣는 노트<small>나의 리스닝 연습장</small></span></a><nav>{nav.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setSoundNote(null);setError('');}}><Icon size={19}/>{label}{id==='home'&&state.session&&<span className="nav-dot"/>}</button>)}</nav><div className="sidebar-note"><span className="little-line"/><p>익숙한 문장에서<br/>새로운 이해로.</p><small>짧게 듣고, 연결하고, 다시 만나기</small></div><div className="local-mark"><i/> 이 컴퓨터에 학습 기록 저장</div></aside>
 <main className="workspace"><header className="topbar"><span>{nav.find(n=>n[0]===page)?.[1]}</span><span className="top-date">{new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}</span></header>
 {error&&<div className="error-banner" role="alert">{error}<button aria-label="닫기" onClick={()=>setError('')}><X size={17}/></button></div>}
 {page==='settings'&&<GeminiSettings/>}
 {page==='sound'&&<SoundLab sources={state.sources} activeSource={soundNote?.sourceId??state.active?.sourceId} initialNote={soundNote??undefined} ai={state.ai.configured}/>}
 {page==='home'&&<Cloze sourceId={state.active?.sourceId} title={state.sources.find(s=>s.id===state.active?.sourceId)?.title??'선택한 영상'} sourceStatus={state.sources.find(s=>s.id===state.active?.sourceId)?.status??''} goals={state.goals} onError={setError} onOpenLibrary={()=>setPage('library')}/>}
 {page==='study'&&<StudyFlow sourceId={state.active?.sourceId} onError={setError} onOpenLibrary={()=>setPage('library')}/>}
 {page==='library'&&<div className="page-content"><div className="page-heading"><h1>내 영상</h1><p>영상이 바뀌어도 지금까지의 연습은 이어집니다.</p></div>{linkForm}<div className="library-list">{state.sources.map(s=><SourceRow key={s.id} source={s} active={state.active?.sourceId===s.id} onSelect={async()=>{await api('/sources/'+s.id+'/select',{});await refresh();setToast('다음 연습의 주 영상으로 선택했어요.');}}/>)}</div><div className="info-box"><CircleHelp size={20}/><p>영상 자막은 틀릴 수 있어요. 음성과 대조하지 않은 구간은 자유 청취로 제공하며, 이해도를 확정 채점하지 않습니다. 준비가 안 되는 동안에도 기본 연습을 이어갈 수 있어요.</p></div><button className="primary-button" onClick={()=>setPage('home')}>의미 이해 연습으로 <Play size={17}/></button><section className="recommendations"><div className="section-heading"><h2>다음에 살펴볼 자료</h2><span>{state.recommendationCheck?.status==="checking"?"공식 자료 확인 중":"앱 사용 시 주간 확인"}</span></div>{state.recommendations.length?state.recommendations.map(r=><article key={r.id}><div><h3>{r.title}</h3><p>{r.reason}</p><small>{date(r.checkedAt)} 확인 · {r.available?"페이지 접근 확인":"현재 접근 확인 안 됨"}{r.type==="site"?" · 외부 학습 사이트":" · 자막은 추가 시 확인"}</small></div><a className="text-link" href={r.url} target="_blank" rel="noreferrer">자료 보기 <ExternalLink size={14}/></a></article>):<p className="muted">기술 설명과 관련 있는 공식 학습 자료를 확인하고 있어요.</p>}</section></div>}
 {page==='history'&&<LearningHistory skills={summary.skills} goals={state.goals} onOpen={note=>{setSoundNote(note);setPage('sound');}} onStart={()=>setPage('home')}/>}
 {page==='baseline'&&<div className="page-content"><div className="page-heading"><h1>나의 출발점</h1><p>한 달 뒤의 나와 비교할 수 있도록 처음의 반응을 남겼어요.</p></div><div className="baseline-paper"><span className="date-tag">{summary.baseline.date}</span><h2>{summary.baseline.summary}</h2>{summary.baseline.observations.map((o,i)=><p key={o}><span>{i+1}</span>{o}</p>)}<div className="info-box"><CircleHelp size={18}/><p>{summary.baseline.note}</p></div><footer>다음 비교 예정일 <b>{summary.baseline.reviewDate}</b><small>새로운 비슷한 난도의 발화로 짧게 확인합니다. 자동 알림은 설정되어 있지 않습니다.</small></footer></div></div>}
 {page==='settings'&&<div className="page-content"><div className="page-heading"><h1>학습을 이어가는 설정</h1><p>기록은 이 컴퓨터의 데이터베이스에 저장됩니다.</p></div><section className="settings-section"><h2>백업과 복원</h2><p>답변, 복습 일정, 영상과 출발점 기록을 함께 보관하세요.<br/>다른 컴퓨터로 옮길 때 백업 파일을 가져오면 됩니다.</p><div className="button-row"><a className="primary-button" href="/api/backup" download><Download size={17}/> 백업 내보내기</a><label className="secondary-button"><Upload size={17}/> 백업 가져오기<input type="file" accept=".json" hidden onChange={async e=>{try{const f=e.target.files?.[0];if(!f)return;const d=JSON.parse(await f.text());const result=await api('/restore',d);await refresh();setToast(`${result.count}개 항목을 확인했어요. 기존 기록은 유지됩니다.`);}catch(x){setError((x as Error).message);}e.target.value='';}}/></label></div></section><section className="settings-section"><h2>음성과 AI 도움</h2><p>기본 연습은 기기의 영어 합성 음성을 사용합니다. 실제 화자의 억양 학습과는 구분됩니다.</p><p>영상의 한국어 AI 설명: <b>{state.ai.configured?state.ai.model:'아직 연결하지 않음'}</b></p><p className="muted">로컬 Ollama 모델을 실행하고 LISTENING_AI_MODEL을 지정하면 설명을 사용할 수 있습니다. 연결 전에도 영어 자막 확인과 기본 연습이 가능합니다.</p></section><section className="settings-section"><h2>기록을 해석하는 방법</h2><p>앱 밖에서 본 영상은 자동으로 알 수 없습니다. 익숙한 구간은 연습 중 ‘이미 익숙해요’로 알려주세요. 자막 오류 신고와 건너뛰기는 오답으로 계산하지 않습니다.</p></section></div>}
 </main>{toast&&<div className="toast" role="status"><CheckCircle2 size={19}/>{toast}</div>}</div>;
}

function SourceRow({source:s,active,onSelect}:{source:Source;active:boolean;onSelect:()=>Promise<void>}){
 const [err,setErr]=useState('');return <article className="source-row"><div className="source-thumb"><img src={`https://i.ytimg.com/vi/${s.id}/mqdefault.jpg`} alt="" loading="lazy"/><span><Play size={17} fill="currentColor"/></span></div><div className="source-copy"><div className="source-meta">{active&&<span className="pill">학습 중</span>}<span>{s.count||0}개 구간</span></div><h3>{s.title}</h3><p>{s.message}</p>{err&&<p className="inline-error">{err}</p>}</div><button className="source-select" aria-label={`${s.title} 선택`} onClick={()=>void onSelect().catch(x=>setErr(x.message))}>{s.status==='fetching'||s.status==='queued'?<LoaderCircle className="spin" size={20}/>:<ChevronRight size={21}/>}</button></article>;
}


createRoot(document.getElementById('root')!).render(<App/>);
