import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,CheckCircle2,ChevronRight,CircleHelp,Flag,LoaderCircle,Pause,Play,RotateCcw,Sparkles,X} from 'lucide-react';
import {chunkFor,clozeProgress,maskedRuns,nextUnanswered,wordWindow,type ClozeItem} from './blanks';

type Exercise={id:string;sourceId:string;kind:string;text:string;masked?:string;maskIndex?:number;goal:string;
 prompt:string;options:string[];answer:number|null;start:number;end:number;quality:string};
type Session={id:string;exerciseIds:string[];index:number;status:string};
type Attempt={exerciseId:string;correct:boolean|null;note:string;answer:number|null};
type Bundle={session:Session;exercises:Exercise[];attempts:Attempt[];events:{exerciseId:string;type:string}[]};
type Overview={items:ClozeItem[];sentenceCount:number;status:string;nextSentence:number;rejected:number;
 targets:string[];message:string;model:{provider:string;model:string};maskSource:string;timingQuality:string};
type Range={start:number;end:number;nonce:number};

const RESTART='앱 서버가 이 기능을 아직 제공하지 않아요. 앱을 종료하고 Start-App.cmd로 다시 실행해주세요.';
async function api<T=any>(path:string,data?:unknown):Promise<T>{
 const r=await fetch('/api'+path,{method:data===undefined?'GET':'POST',cache:'no-store',
  headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 // An older server answers unknown /api paths with the SPA page, so a non-JSON body means the backend is stale.
 let v:any=null;
 try{v=await r.json();}catch{throw new Error(r.ok?RESTART:'요청을 처리하지 못했어요. 다시 시도해주세요.');}
 if(!r.ok)throw new Error(typeof v?.detail==='string'?v.detail:'요청을 처리하지 못했어요. 다시 시도해주세요.');
 return v;
}
const time=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;

let ytPromise:Promise<void>|null=null;
function loadYT(){return ytPromise??=new Promise<void>((resolve,reject)=>{
 if(window.YT?.Player){resolve();return;}
 // Chain so a player mounted on another screen keeps its own callback.
 const prior=window.onYouTubeIframeAPIReady;
 window.onYouTubeIframeAPIReady=()=>{prior?.();resolve();};
 const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
 script.onerror=()=>{ytPromise=null;reject(new Error('영상 플레이어를 불러오지 못했어요.'));};
 document.head.appendChild(script);
});}

function RangePlayer({sourceId,request,rate,onRate,onPlayed,onError}:{sourceId:string;request:Range|null;rate:number;
 onRate:(v:number)=>void;onPlayed:()=>void;onError:(message:string)=>void}){
 const slot=useRef<HTMLDivElement>(null),player=useRef<any>(null),stopAt=useRef(0),played=useRef(onPlayed);
 const [ready,setReady]=useState(false),[playing,setPlaying]=useState(false);
 played.current=onPlayed;
 useEffect(()=>{
  let cancelled=false;let timer:ReturnType<typeof setInterval>;
  loadYT().then(()=>{
   if(cancelled||!slot.current)return;
   const div=document.createElement('div');slot.current.replaceChildren(div);
   player.current=new window.YT.Player(div,{width:'100%',height:'100%',videoId:sourceId,
    playerVars:{origin:location.origin,playsinline:1,rel:0,cc_load_policy:0},events:{
     onReady:()=>{if(!cancelled)setReady(true);},
     onStateChange:(ev:any)=>{if(cancelled)return;setPlaying(ev.data===1);if(ev.data===1)played.current();},
     onError:()=>{if(!cancelled)onError('이 영상은 여기서 재생되지 않아요. 원본에서 들을 수 있습니다.');}}});
   timer=setInterval(()=>{
    if(player.current?.getPlayerState?.()===1&&player.current.getCurrentTime()>=stopAt.current)player.current.pauseVideo();
   },120);
  }).catch(x=>onError(x.message));
  return()=>{cancelled=true;clearInterval(timer);player.current?.destroy();player.current=null;};
 },[sourceId]);
 useEffect(()=>{
  if(!request||!ready||!player.current)return;
  stopAt.current=request.end;player.current.setPlaybackRate?.(rate);
  player.current.loadVideoById({videoId:sourceId,startSeconds:request.start,endSeconds:request.end});
 },[request?.nonce,ready]);
 return <div className="player video-player">
  <div className="video-slot" ref={slot}/>
  <div className="player-controls">
   <button className="play-button" disabled={!ready||!request} onClick={()=>{
    if(!player.current||!request)return;
    if(playing){player.current.pauseVideo();return;}
    stopAt.current=request.end;player.current.setPlaybackRate?.(rate);
    player.current.loadVideoById({videoId:sourceId,startSeconds:request.start,endSeconds:request.end});
   }}><span>{playing?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</span>{playing?'일시정지':'다시 듣기'}</button>
   <select aria-label="재생 속도" value={rate} onChange={e=>{const v=Number(e.target.value);onRate(v);player.current?.setPlaybackRate?.(v);}}>
    <option value={1}>1배속</option><option value={0.85}>0.85배속</option><option value={0.75}>0.75배속</option></select>
   <small>{request?`${time(request.start)} – ${time(request.end)}`:'구간을 선택하세요'}</small>
  </div>
 </div>;
}

export default function Cloze({sourceId,title,goals,sourceStatus,onError,onOpenLibrary}:{sourceId?:string;title:string;
 goals:Record<string,string>;sourceStatus:string;onError:(message:string)=>void;onOpenLibrary:()=>void}){
 const [overview,setOverview]=useState<Overview|null>(null);
 const [bundle,setBundle]=useState<Bundle|null>(null);
 const [goal,setGoal]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [note,setNote]=useState('');
 const [answer,setAnswer]=useState<number|null>(null);
 const [request,setRequest]=useState<Range|null>(null);
 const [rate,setRate]=useState(1);
 const [played,setPlayed]=useState(false);
 const [replay,setReplay]=useState('');
 const [feedback,setFeedback]=useState<{text:string;cached:boolean}|null>(null);
 const [notice,setNotice]=useState('');
 const [preparing,setPreparing]=useState(false);
 const nonce=useRef(0);

 const overviewRef=useRef<Overview|null>(null);
 overviewRef.current=overview;
 const load=useCallback(async()=>{
  if(!sourceId){setOverview(null);setLoading(false);return;}
  // A background refresh must not blank a list that is already on screen.
  if(!overviewRef.current)setLoading(true);
  try{
   const data=await api<Overview>('/cloze/'+sourceId);
   if(!Array.isArray(data?.items))throw new Error(RESTART);
   setOverview(data);
  }catch(x){setOverview(null);onError((x as Error).message);}finally{setLoading(false);}
 },[sourceId,onError]);
 useEffect(()=>{void load();setBundle(null);},[load]);
 // Preparation runs in the background on the server, so follow it until the plan finishes or stops advancing.
 useEffect(()=>{
  if(!preparing)return;
  const timer=setInterval(()=>void load(),5000);
  return()=>clearInterval(timer);
 },[preparing,load]);
 useEffect(()=>{
  if(!preparing||!overview)return;
  if(overview.status==='complete'){setPreparing(false);setNotice('빈칸 문항 준비가 끝났어요.');}
  else if(overview.status==='partial'){setPreparing(false);setNotice(overview.message||'일부 문장만 준비했어요. 다시 준비하면 이어서 진행합니다.');}
 },[preparing,overview]);

 const exercise=bundle?bundle.exercises[bundle.session.index]:undefined;
 const attempt=exercise?bundle!.attempts.find(a=>a.exerciseId===exercise.id):undefined;
 const detail=exercise?overview?.items.find(i=>i.id===exercise.id):undefined;
 const listen=(start:number,end:number,label:string)=>{nonce.current+=1;setRequest({start,end,nonce:nonce.current});setReplay(label);};

 useEffect(()=>{
  if(!exercise)return;
  setNote('');setAnswer(null);setFeedback(null);setNotice('');
  setPlayed(bundle!.events.some(x=>x.exerciseId===exercise.id&&x.type==='played'));
  listen(exercise.start,exercise.end,'문장 전체');
 },[exercise?.id]);

 async function startRun(startClipId?:string){
  setBusy(true);
  try{
   const session=await api<Session>('/sessions',{goal:goal||undefined,startClipId});
   if(!session?.id)throw new Error(RESTART);
   const run=await api<Bundle>('/sessions/'+session.id);
   if(!run?.session||!Array.isArray(run.exercises))throw new Error(RESTART);
   setBundle(run);
  }catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function markPlayed(){
  if(!exercise||!bundle||played)return;
  setPlayed(true);
  try{await api('/events',{id:crypto.randomUUID(),sessionId:bundle.session.id,exerciseId:exercise.id,type:'played'});}
  catch(x){onError((x as Error).message);}
 }
 async function check(){
  if(!exercise||!bundle)return;
  setBusy(true);
  try{
   await api('/attempts',{sessionId:bundle.session.id,exerciseId:exercise.id,answer,note});
   setBundle(await api<Bundle>('/sessions/'+bundle.session.id));
  }catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function advance(skip=false){
  if(!bundle)return;
  setBusy(true);
  try{
   await api('/sessions/'+bundle.session.id+'/next',{index:bundle.session.index,skip});
   setBundle(await api<Bundle>('/sessions/'+bundle.session.id));
  }catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function askFeedback(){
  if(!exercise)return;
  setBusy(true);
  try{
   const r=await api<{feedback:string;cached:boolean}>('/cloze/'+encodeURIComponent(exercise.id)+'/feedback',
    {heard:note,picked:answer!==null&&answer>=0?exercise.options[answer]:''});
   setFeedback({text:r.feedback,cached:r.cached});
  }catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function prepareCloze(){
  if(!sourceId)return;
  setBusy(true);
  try{await api('/cloze/'+sourceId+'/prepare',{});setPreparing(true);
   setNotice('빈칸 문항을 준비하고 있어요. 끝나면 목록이 채워집니다.');}
  catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }

 if(!sourceId)return <div className="page-content"><div className="page-heading"><h1>의미 이해 연습</h1>
  <p>먼저 연습할 영상을 고르면, 그 영상의 문장에서 핵심 단어를 가리고 듣습니다.</p></div>
  <button className="primary-button" onClick={onOpenLibrary}>내 영상에서 고르기 <ChevronRight size={17}/></button></div>;

 if(bundle&&exercise){
  const words=detail?.words??[];
  const maskIndex=detail?.maskIndex??exercise.maskIndex??null;
  const chunk=detail?chunkFor(detail.chunks,maskIndex):undefined;
  const answered=!!attempt;
  const correctIndex=exercise.answer;
  return <div className="practice-wrap">
   <div className="practice-header"><button className="plain-button" onClick={()=>{setBundle(null);void load();}}><X size={18}/> 목록으로</button>
    <span>{bundle.session.index+1} / {bundle.exercises.length}</span></div>
   <div className="progress-track"><i style={{width:`${(bundle.session.index+1)/bundle.exercises.length*100}%`}}/></div>
   <div className="exercise-heading"><span>{goals[exercise.goal]??exercise.goal}</span>
    <h1>{answered?'가려졌던 단어를 확인하세요.':'가려진 단어를 들어보세요.'}</h1>
    <p>{answered?'원문과 비교하고, 필요하면 구간을 다시 들어보세요.':'단어를 모르겠으면 들린 소리를 한글로 적어도 됩니다.'}</p></div>
   <RangePlayer sourceId={exercise.sourceId} request={request} rate={rate} onRate={setRate}
    onPlayed={()=>void markPlayed()} onError={onError}/>
   {replay&&<p className="cloze-replay">{replay} 재생 중{replay.startsWith('단어')?' · 추정 위치(±0.35초 여유) · 정확한 발음 경계가 아닙니다':''}</p>}
   <div className="cloze-sentence" lang="en">
    {answered?exercise.text:maskedRuns(words,maskIndex).map((run,i)=>run.blank
      ? <span key={i}><b className="cloze-blank">____</b>{run.text} </span>
      : <span key={i}>{run.text} </span>)}
   </div>
   {!answered?<section className="answer-section">
    <h2>{exercise.prompt}</h2>
    <label className="cloze-heard">들린 소리를 한글로 적기 (선택)
     <input value={note} maxLength={2000} placeholder="예: 해븐트" onChange={e=>setNote(e.target.value)}/></label>
    <div className="answers">{exercise.options.map((option,i)=>
     <button key={option} className={answer===i?'selected':''} disabled={!played} onClick={()=>setAnswer(i)}>
      <span>{String.fromCharCode(65+i)}</span>{option}{answer===i&&<Check size={17}/>}</button>)}
     <button className={'unsure '+(answer===-1?'selected':'')} disabled={!played} onClick={()=>setAnswer(-1)}>모르겠어요</button></div>
    {!played&&<p className="inline-notice">먼저 소리를 들어야 답을 고를 수 있어요.</p>}
    <div className="answer-actions">
     <button className="plain-button" disabled={busy} onClick={()=>void advance(true)}>이 문장 건너뛰기</button>
     <button className="primary-button" disabled={busy||!played||answer===null} onClick={()=>void check()}>
      {busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} 확인</button></div>
   </section>:<section className="feedback">
    <div className="feedback-title">{attempt!.correct?<CheckCircle2 size={23}/>:<CircleHelp size={23}/>}
     <h2>{attempt!.correct?'정확히 들었어요.':`가려진 단어는 “${correctIndex!==null?exercise.options[correctIndex]:''}” 였어요.`}</h2></div>
    {attempt!.note&&<p className="cloze-heard-record">내가 들은 소리: {attempt!.note}</p>}
    <div className="cloze-replays">
     <button className="secondary-button" onClick={()=>listen(exercise.start,exercise.end,'문장 전체')}><RotateCcw size={15}/> 문장 다시</button>
     {chunk&&<button className="secondary-button" onClick={()=>listen(chunk.start,chunk.end,'청크')}><RotateCcw size={15}/> 청크만</button>}
     {words.length>0&&maskIndex!==null&&<button className="secondary-button" onClick={()=>{
      const w=wordWindow(words,maskIndex);listen(w.start,w.end,'단어 위치');}}><RotateCcw size={15}/> 단어 위치(추정)</button>}
    </div>
    <div className="button-row">
     <button className="secondary-button" disabled={busy} onClick={()=>void askFeedback()}><Sparkles size={16}/> 왜 그렇게 들렸는지 묻기</button>
     <button className="primary-button" disabled={busy} onClick={()=>void advance()}>다음 문장 <ArrowRight size={17}/></button></div>
    {feedback&&<div className="meaning"><p>{feedback.text}</p>
     <small>자막 텍스트 기반 가설 · 실제 음성 분석이 아닙니다{feedback.cached?' · 저장된 답변':''}</small></div>}
   </section>}
   <div className="exercise-footer"><button className="plain-button" onClick={async()=>{
    try{await api('/events',{id:crypto.randomUUID(),sessionId:bundle.session.id,exerciseId:exercise.id,type:'content_issue'});
     setNotice('문항 문제로 기록했어요. 이 문장은 다음 목록에서 빠집니다.');}
    catch(x){onError((x as Error).message);}}}><Flag size={14}/> 자막이나 보기가 이상해요</button>
    <small>응답과 한글 기록은 자동으로 저장됩니다.</small></div>
   {notice&&<p className="inline-notice" role="status">{notice}</p>}
  </div>;
 }

 if(bundle&&!exercise)return <div className="session-complete"><span className="complete-mark"><Check size={40}/></span>
  <h1>이 구간을 마쳤어요.</h1><p>{bundle.exercises.length}개 문장을 들었습니다. 이어서 다음 구간을 계속할 수 있어요.</p>
  <div className="button-row"><button className="primary-button" disabled={busy} onClick={()=>void startRun()}>이어서 듣기 <ArrowRight size={17}/></button>
   <button className="secondary-button" onClick={()=>{setBundle(null);void load();}}>목록 보기</button></div></div>;

 const items=(overview?.items??[]).filter(i=>!goal||i.goal===goal);
 const progress=clozeProgress(items);
 const next=nextUnanswered(items);
 const ready=overview?.status==='complete';
 return <div className="page-content">
  <div className="page-heading"><h1>의미 이해 연습</h1>
   <p>{title} · 영상 문장에서 핵심 단어를 가리고 순서대로 듣습니다.</p></div>
  <section className="cloze-status">
   <div><b>{progress.answered}</b> 응답 · 대상 {progress.total}문장 · 전체 {overview?.sentenceCount??0}문장</div>
   <div className="muted">{overview?.message||(sourceStatus==='ready'?'빈칸 문항을 준비해주세요.':'먼저 자막·AI 문장 분석을 준비해주세요.')}</div>
   <div className="muted">저장된 Gemini 문장 분석과 빈칸 선정 · 단어 시간은 자막 기반 추정입니다.</div>
   {!ready&&<button className="secondary-button" disabled={busy||preparing} onClick={()=>void prepareCloze()}>
    {busy||preparing?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>}
    {preparing?' 준비 중…':' 빈칸 문항 준비'}</button>}
  </section>
  {loading?<p role="status">빈칸 문항을 불러오고 있어요.</p>:<>
   <div className="cloze-filters">
    <button className={goal===''?'selected':''} onClick={()=>setGoal('')}>전체</button>
    {(overview?.targets??[]).map(t=><button key={t} className={goal===t?'selected':''} onClick={()=>setGoal(t)}>{goals[t]??t}</button>)}
   </div>
   <div className="button-row">
    <button className="primary-button" disabled={busy||!items.length} onClick={()=>void startRun(next?.id)}>
     {progress.answered?'이어서 듣기':'연습 시작'} <Play size={16}/></button>
    {progress.answered>0&&<span className="muted">정답 {progress.correct} · 다시 볼 문장 {progress.wrong+progress.skipped}</span>}
   </div>
   {!items.length?<p className="empty">아직 준비된 빈칸 문항이 없어요. 위에서 빈칸 문항 준비를 실행해주세요.</p>:
    <ol className="cloze-list">{items.map(item=><li key={item.id} className={'cloze-row is-'+item.state}>
     <button onClick={()=>void startRun(item.id)}>
      <span className="cloze-row-meta">{time(item.start)} · {goals[item.goal]??item.goal}
       <b>{item.state==='correct'?'정답':item.state==='wrong'?'다시':item.state==='skipped'?'건너뜀':'미응답'}</b></span>
      <span className="cloze-row-text" lang="en">{item.masked}</span></button></li>)}</ol>}
   {!!overview?.rejected&&<div className="info-box"><CircleHelp size={20}/>
    <p>AI 응답 중 {overview.rejected}개 문장은 검증에서 걸러졌습니다. 자막 단어와 맞지 않는 선정은 출제하지 않습니다.</p></div>}
  </>}
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
 </div>;
}
