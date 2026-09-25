import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,CircleHelp,Eye,Flag,History,LoaderCircle,Mic,Play,RotateCcw,Sparkles,Square,Trash2} from 'lucide-react';
import LoopPlayer,{type Clip,type PlayKind,type PlayerControls} from './LoopPlayer';
import {wordsFor,unitsFor,unitAt,selectedRange,type Word,type Unit} from './transcript';
import {rangeOptions,clipsInRange,type StudyRange} from './studyRange';
import {REASON_LABELS,STEP_REASONS,compareSteps,markAt,marksForStep,type MarkReason,type StudyMark} from './studyMarks';
import {MODE_HINTS,MODE_LABELS,SPEED_LADDER,drillSteps,echoGapMs,nextRate,repeatsFor,
 type ShadowMode,type ShadowStep} from './shadowing';
import {countRecordings,recordingsFor,removeRecording,saveRecording,supported,type Recording} from './recordings';

type PackChunk={index:number;meaning:string;stressWordIndex:number;linkPoints:number[];weakWords:number[]};
type Pack={clipId:string;chunks:PackChunk[];order:string;grammar:string;expansion:string[];variations:string[];
 forms:Record<string,string>;evidence:string};
type Session={id:string;sourceId:string;range:StudyRange;currentStep:number;status:string;
 steps:Record<string,{doneAt:string|null;seekDetected?:boolean}>;forms?:Record<string,Record<string,string>>;
 shadowing?:Record<string,{mode:ShadowMode;rate:number}>};
type Overview={title:string;clips:Clip[];session:Session|null;marks:StudyMark[];sessions:Session[];
 rangeMinutes:number[];listeningSteps:number[];markSteps:number[];forms:string[];formLabels:Record<string,string>;
 pack:{items?:Record<string,Pack>;status?:string;lastError?:string;pending?:string[];rejected?:{clipId:string;reason:string}[]};
 priorMarks:StudyMark[];sourceStatus:string;timingQuality:string};

const STEP_TITLES:Record<number,string>={1:'음원 1번만 듣기',2:'스크립트 내용 파악',3:'소리 내어 읽기',
 4:'스크립트 보며 듣기',5:'쉐도잉 · 청킹',6:'음원 없이 다시 읽기',7:'스크립트 덮고 듣기'};
const STEP_HINTS:Record<number,string>={
 1:'끝까지 한 번만 듣고, 안 들린 문장이나 부분을 표시하세요. 스크립트는 다 듣고 나면 펼 수 있어요.',
 2:'1단계에서 표시한 문장을 청크 단위로 뜯어봅니다. 문장 형식은 직접 소리 내어 말한 뒤 체크하세요.',
 3:'소리 내어 읽으면서 어색한 부분을 표시하세요. 녹음해 원음과 번갈아 들을 수 있습니다.',
 4:'스크립트를 보면서 듣습니다. 지금 들리는 청크가 표시되고, 어색한 부분을 연음·강세로 남길 수 있어요.',
 5:'덩어리를 쌓아 가며 따라 말합니다. 표시한 문장은 두 번씩 재생합니다.',
 6:'음원 없이 다시 읽습니다. 3단계에서 표시한 곳이 줄었는지 확인해 보세요.',
 7:'스크립트를 덮고 듣습니다. 아직 안 들리는 부분을 표시하면 1단계와 비교해 보여드려요.'};

async function api<T=any>(path:string,data?:unknown):Promise<T>{
 const r=await fetch('/api'+path,{method:data===undefined?'GET':'POST',cache:'no-store',
  headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 let v:any=null;
 try{v=await r.json();}catch{throw new Error(r.ok?'앱 서버가 이 기능을 아직 제공하지 않아요. 앱을 종료하고 Start-App.cmd로 다시 실행해주세요.':'요청을 처리하지 못했어요.');}
 if(!r.ok)throw new Error(typeof v?.detail==='string'?v.detail:'요청을 처리하지 못했어요. 다시 시도해주세요.');
 return v;
}
const time=(v:number)=>`${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`;
const chunksOf=(c:Clip):Unit[]=>c.chunks?.length?c.chunks:unitsFor(wordsFor(c),'chunk');

function ChunkBoard({clip,pack}:{clip:Clip;pack?:Pack}){
 const words=wordsFor(clip),units=chunksOf(clip);
 return <div className="chunk-board">
  {units.map((unit,i)=>{
   const detail=pack?.chunks.find(c=>c.index===i);
   return <div className="chunk-card" key={i}>
    <p lang="en">{words.slice(unit.first,unit.last+1).map((w,offset)=>{
     const index=unit.first+offset;
     const stressed=detail?.stressWordIndex===index;
     const weak=detail?.weakWords.includes(index);
     const linked=detail?.linkPoints.includes(index);
     return <React.Fragment key={index}>{offset>0?' ':''}
      <span className={'chunk-word'+(stressed?' is-stressed':'')+(weak?' is-weak':'')+(linked?' is-linked':'')}>{w.text}</span>
      {linked?<i className="chunk-link" aria-label="다음 단어와 이어짐">‿</i>:null}</React.Fragment>;})}</p>
    {detail&&<small>{detail.meaning}</small>}
    {i<units.length-1&&<span className="chunk-break" aria-hidden="true">|</span>}
   </div>;})}
 </div>;
}


// One picker for every step that studies a single sentence: arrows skim, Enter plays, icons show past marks.
function SentencePicker({label,clips,focus,marksFor,priorFor,onSelect,onPlay}:{label:string;clips:Clip[];focus?:Clip;
 marksFor:(clip:Clip)=>StudyMark[];priorFor:(clip:Clip)=>StudyMark[];onSelect:(id:string)=>void;onPlay:()=>void}){
 const index=clips.findIndex(c=>c.id===focus?.id);
 const move=(delta:number)=>{const next=clips[index+delta];if(next)onSelect(next.id);};
 const mine=focus?marksFor(focus):[];
 const prior=focus?priorFor(focus):[];
 const marker=(clip:Clip)=>marksFor(clip).length?'●':priorFor(clip).length?'○':'·';
 return <div className="study-focus-picker" tabIndex={0} onKeyDown={e=>{
   if(e.altKey||e.ctrlKey||e.metaKey||e.nativeEvent.isComposing)return;
   const tag=(e.target as HTMLElement).tagName;
   if(tag==='INPUT'||tag==='TEXTAREA')return;
   if(e.key==='Enter'){e.preventDefault();onPlay();return;}
   // A focused select already moves with the arrows; do not advance twice.
   if(tag==='SELECT')return;
   if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
   else if(e.key==='ArrowRight'){e.preventDefault();move(1);}
  }}>
  <div className="picker-row">
   <button type="button" className="picker-step" aria-label="이전 문장" disabled={index<=0} onClick={()=>move(-1)}><ChevronLeft size={17}/></button>
   <label>{label}
    <select value={focus?.id??''} onChange={e=>onSelect(e.target.value)}>
     {clips.map(c=><option key={c.id} value={c.id}>{time(c.start)} {marker(c)} {c.text.slice(0,44)}</option>)}
    </select></label>
   <button type="button" className="picker-step" aria-label="다음 문장" disabled={index<0||index>=clips.length-1} onClick={()=>move(1)}><ChevronRight size={17}/></button>
   <button type="button" className="lab-caption-time" onClick={onPlay}><Play size={13}/> 이 문장 듣기</button>
  </div>
  <div className="picker-meta">
   <span>{index>=0?index+1:0} / {clips.length}</span>
   {mine.length?<b className="picker-flag"><Flag size={12}/> 이번 회차 {[...new Set(mine.map(m=>m.step))].sort().join('·')}단계 표시</b>:null}
   {prior.length?<b className="picker-prior"><History size={12}/> 지난 회차에도 표시</b>:null}
   {!mine.length&&!prior.length?<span className="muted">표시 없음</span>:null}
   <span className="muted">← → 문장 이동 · Enter 재생</span>
  </div>
 </div>;
}

export default function StudyFlow({sourceId,onError,onOpenLibrary}:{sourceId?:string;onError:(message:string)=>void;onOpenLibrary:()=>void}){
 const [data,setData]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [step,setStep]=useState(1);
 const [playRequest,setPlayRequest]=useState(0),[playKind,setPlayKind]=useState<PlayKind>('range');
 const [range,setRange]=useState<{start:number;end:number}|null>(null);
 const [gapMs,setGapMs]=useState(700);
 const [position,setPosition]=useState({time:0,playing:false});
 const [listened,setListened]=useState(false),[seekDetected,setSeekDetected]=useState(false);
 const [revealOverride,setRevealOverride]=useState<boolean|null>(null);
 const [reason,setReason]=useState<MarkReason>('unheard');
 const [anchor,setAnchor]=useState<{clipId:string;word:Word}|null>(null);
 const [focusId,setFocusId]=useState('');
 const [mode,setMode]=useState<ShadowMode>('backward');
 const [rate,setRate]=useState(.75);
 const [drillIndex,setDrillIndex]=useState(0);
 const [recordings,setRecordings]=useState<Recording[]>([]);
 const [recording,setRecording]=useState(false),[recorderError,setRecorderError]=useState('');
 const [notice,setNotice]=useState('');
 const controls=useRef<PlayerControls|null>(null);
 const recorder=useRef<MediaRecorder|null>(null);
 const audio=useRef<HTMLAudioElement|null>(null);

 const load=useCallback(async()=>{
  if(!sourceId){setData(null);setLoading(false);return;}
  setLoading(true);
  try{setData(await api<Overview>('/study/'+sourceId));}catch(x){setData(null);onError((x as Error).message);}
  finally{setLoading(false);}
 },[sourceId,onError]);
 useEffect(()=>{void load();},[load]);

 const session=data?.session??null;
 const marks=data?.marks??[];
 const packs=data?.pack?.items??{};
 const clips=useMemo(()=>session&&data?clipsInRange(data.clips as any,session.range) as unknown as Clip[]:[],[data,session]);
 const maxTime=data?.clips.length?data.clips[data.clips.length-1].end:0;
 const steps=data?.listeningSteps??[1,2,3,4,5,6,7];
 const markSteps=data?.markSteps??[1,3,4,6,7];
 const stepDone=(n:number)=>!!session?.steps?.[String(n)]?.doneAt;
 const markedClipIds=useMemo(()=>new Set(marksForStep(marks,1).map(m=>m.clipId).filter(Boolean) as string[]),[marks]);
 const priorMarks=data?.priorMarks??[];
 const inClip=(list:StudyMark[],clip:Clip)=>list.filter(m=>m.end>clip.start+.001&&m.start<clip.end-.001);
 const marksOnClip=useCallback((clip:Clip)=>inClip(marks,clip),[marks]);
 const priorOnClip=useCallback((clip:Clip)=>inClip(priorMarks,clip),[priorMarks]);
 const focus=useMemo(()=>clips.find(c=>c.id===focusId)??clips.find(c=>markedClipIds.has(c.id))??clips[0],[clips,focusId,markedClipIds]);

 useEffect(()=>{if(session)setStep(session.currentStep||1);},[session?.id]);
 useEffect(()=>{
  if(!session)return;
  setRange({start:session.range.start,end:session.range.end});
  setListened(!!session.steps?.[String(step)]?.doneAt);
  setRevealOverride(null);
  setSeekDetected(false);setAnchor(null);setDrillIndex(0);setGapMs(700);
  setReason((STEP_REASONS[step]?.[0])??'unheard');
  controls.current?.stop();
 },[session?.id,step]);

 useEffect(()=>{
  if(!focus||step!==3&&step!==6){setRecordings([]);return;}
  let alive=true;
  recordingsFor(focus.id).then(rows=>{if(alive)setRecordings(rows);}).catch(()=>{if(alive)setRecordings([]);});
  return()=>{alive=false;};
 },[focus?.id,step]);

 const speaking=useMemo(()=>{
  const units=clips.flatMap(c=>chunksOf(c).map(u=>({...u,clipId:c.id})));
  return units.length&&position.playing?unitAt(units,position.time):undefined;
 },[clips,position]);

 function play(start:number,end:number,kind:PlayKind='range',gap=700){
  setGapMs(gap);setRange({start,end});setPlayKind(kind);setPlayRequest(v=>v+1);
 }
 async function saveStep(n:number,done:boolean,extra?:{seekDetected?:boolean}){
  if(!session)return;
  setBusy(true);
  try{await api('/study/sessions/'+session.id+'/step',{step:n,done,...extra});await load();}
  catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function toggleMark(target:{start:number;end:number},scope:'sentence'|'words'){
  if(!session)return;
  const existing=markAt(marks,step,target);
  setBusy(true);
  try{
   const r=await api<{marks:StudyMark[]}>('/study/sessions/'+session.id+'/marks',
    existing?{step,start:target.start,end:target.end,remove:true}
            :{step,start:target.start,end:target.end,scope,reason});
   setData(d=>d?{...d,marks:r.marks}:d);
  }catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function startSession(option:StudyRange){
  if(!sourceId)return;
  setBusy(true);
  try{await api('/study/'+sourceId+'/sessions',option);await load();}
  catch(x){onError((x as Error).message);}finally{setBusy(false);}
 }
 async function buildPack(clipId?:string){
  if(!session)return;
  setBusy(true);setNotice('AI가 문장을 뜯어보고 있어요.');
  try{
   const pack=await api<Overview['pack']>('/study/sessions/'+session.id+'/pack',clipId?{clipId}:{});
   setNotice(pack.status==='complete'?'설명을 준비했어요.':pack.lastError||'일부 문장만 준비했어요.');
   await load();
  }catch(x){setNotice('');onError((x as Error).message);}finally{setBusy(false);}
 }
 async function toggleForm(clipId:string,form:string,done:boolean){
  if(!session)return;
  try{const s=await api<Session>('/study/sessions/'+session.id+'/forms',{clipId,form,done});
   setData(d=>d?{...d,session:s}:d);}
  catch(x){onError((x as Error).message);}
 }
 async function rememberDrill(clipId:string,nextMode:ShadowMode,nextSpeed:number){
  if(!session)return;
  try{await api('/study/sessions/'+session.id+'/shadowing',{clipId,mode:nextMode,rate:nextSpeed});}
  catch{/* practice state is a convenience; a failure must not interrupt the drill */}
 }

 async function startRecording(){
  if(!focus)return;
  setRecorderError('');
  if(!supported()){setRecorderError('이 브라우저에서는 녹음을 지원하지 않아요.');return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   const chunks:Blob[]=[];const started=Date.now();
   const device=new MediaRecorder(stream);
   device.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   device.onstop=async()=>{
    stream.getTracks().forEach(t=>t.stop());
    try{
     await saveRecording({clipId:focus.id,sessionId:session?.id??'',step,
      seconds:(Date.now()-started)/1000,blob:new Blob(chunks,{type:device.mimeType||'audio/webm'})});
     setRecordings(await recordingsFor(focus.id));
    }catch{setRecorderError('녹음을 이 브라우저에 저장하지 못했어요.');}
   };
   recorder.current=device;device.start();setRecording(true);
  }catch{setRecorderError('마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요.');}
 }
 function stopRecording(){recorder.current?.stop();recorder.current=null;setRecording(false);}
 async function compareWithOriginal(entry:Recording){
  if(!focus)return;
  play(focus.start,focus.end);
  const url=URL.createObjectURL(entry.blob);
  const element=audio.current??new Audio();audio.current=element;
  element.src=url;
  window.setTimeout(()=>{void element.play().catch(()=>setRecorderError('녹음을 재생하지 못했어요.'));},
   Math.round((focus.end-focus.start)*1000)+400);
  element.onended=()=>{URL.revokeObjectURL(url);play(focus.start,focus.end);};
 }

 if(!sourceId)return <div className="page-content"><div className="page-heading"><h1>단계별 정독 청취</h1>
  <p>먼저 학습할 영상을 고르면, 한 구간을 단계별로 훑으며 들을 수 있습니다.</p></div>
  <button className="primary-button" onClick={onOpenLibrary}>내 영상에서 고르기 <ChevronRight size={17}/></button></div>;

 if(loading)return <div className="page-content"><p role="status">학습 구간을 불러오고 있어요.</p></div>;

 if(!session){
  const options=data?.clips.length?rangeOptions(data.clips as any,0):[];
  return <div className="page-content">
   <div className="page-heading"><h1>단계별 정독 청취</h1>
    <p>{data?.title} · 한 구간을 7단계로 나눠 듣고, 매 단계의 표시를 문장에 쌓습니다.</p></div>
   {!options.length?<div className="info-box"><CircleHelp size={20}/>
     <p>이 영상은 문장 분석이 아직 준비되지 않았어요. 소리 연습실에서 ‘자막·AI 분석 준비’를 먼저 실행해주세요.</p></div>:
    <section className="study-ranges">
     <div className="section-heading"><h2>학습할 범위를 고르세요</h2><span>문장이 끝나는 곳에서 멈춥니다</span></div>
     <div className="study-range-list">{options.map(option=><button key={option.minutes} disabled={busy} onClick={()=>void startSession(option)}>
      <b>{option.minutes}분 단위</b>
      <span>실제 약 {Math.max(1,Math.round(option.seconds/60))}분 · {option.sentenceCount}문장{option.paragraphCount?` · ${option.paragraphCount}문단`:''}</span>
      <small>{option.boundary==='paragraph'?'문단 경계에서 끝남':option.boundary==='end'?'영상 끝까지':'문장 경계(문단 중간)'}</small>
     </button>)}</div>
     <p className="muted">재생 시간은 자막 기반 추정입니다.</p>
    </section>}
   {!!data?.sessions.length&&<section className="study-past"><div className="section-heading"><h2>지난 회차</h2></div>
    {data.sessions.slice(0,5).map(s=><p key={s.id}>{time(s.range.start)}–{time(s.range.end)} · {s.range.sentenceCount}문장 · {s.status==='done'?'완료':'진행 중'}</p>)}</section>}
  </div>;
 }

 // Derived, not stored: finishing step one must open the script even if playback was never reported.
 const openByDefault=step===1?(listened||stepDone(1)):step===7?false:true;
 const revealed=revealOverride??openByDefault;
 const summary=compareSteps(marks,stepDone(7));
 const readingCompare=compareSteps(marks,stepDone(6),3,6);
 const first=clips[0];
 const covered=(step===1||step===7)&&!revealed;
 const focusPack=focus?packs[focus.id]:undefined;
 const drills:ShadowStep[]=focus?drillSteps(chunksOf(focus) as any,mode,repeatsFor(markedClipIds.has(focus.id))):[];
 const drill=drills[Math.min(drillIndex,Math.max(0,drills.length-1))];

 return <div className="study-flow">
  <div className="page-heading"><h1>단계별 정독 청취</h1>
   <p>{data?.title} · {time(session.range.start)}–{time(session.range.end)} · {session.range.sentenceCount}문장 · 자막 기반 추정 시간</p></div>

  <ol className="study-rail">{[1,2,3,4,5,6,7].map(n=>{
   const usable=steps.includes(n);
   return <li key={n} className={(n===step?'is-current ':'')+(stepDone(n)?'is-done ':'')+(usable?'':'is-pending')}>
    <button disabled={!usable} onClick={()=>setStep(n)}><b>{n}</b><span>{STEP_TITLES[n]}</span>
     {!usable?<small>준비 중</small>:stepDone(n)?<small>완료</small>:null}</button></li>;})}</ol>

  <div className="lab-layout">
   <div className="lab-listen">
    {first&&range&&<LoopPlayer clip={first} start={range.start} end={range.end} gapMs={gapMs}
      playRequest={playRequest} playKind={playKind} controls={controls} maxTime={maxTime}
      currentUnitEnd={()=>range.end}
      onPosition={(t,playing,_continuous,moved)=>{
       setPosition({time:t,playing});
       if(moved)setSeekDetected(true);
       if(t>=session.range.end-.25)setListened(true);
      }}/>}
    <p className="study-hint">{STEP_HINTS[step]}</p>
    <div className="button-row">
     <button className="secondary-button" onClick={()=>play(session.range.start,session.range.end)}>
      <RotateCcw size={15}/> {step===1&&!listened?'범위 듣기':'범위 다시 듣기'}</button>
     {step!==1&&step!==6&&<button className="secondary-button" onClick={()=>setRevealOverride(!revealed)}>
      <Eye size={15}/> {revealed?'스크립트 가리기':'스크립트 보기'}</button>}
     {step===1&&!revealed&&<button className="primary-button" disabled={!listened&&!stepDone(1)}
       onClick={()=>setRevealOverride(true)}>스크립트 펴기 <ChevronRight size={16}/></button>}
    </div>
    {step===1&&<p className="muted study-note">{listened
      ?(seekDetected?'재생 중 이동이 감지되었습니다.':'재생 중 이동이 감지되지 않았습니다. 작은 이동은 감지되지 않을 수 있어요.')
      :'끝까지 한 번 들으면 스크립트를 펼 수 있어요.'}</p>}
    {step===6&&<p className="muted study-note">6단계는 음원 없이 읽는 단계입니다. 재생 버튼을 쓰지 않고 소리 내어 읽어보세요.</p>}
    {step===6&&stepDone(6)&&readingCompare.comparable&&<div className="study-summary">
     <b>3단계에서 표시한 {readingCompare.before}곳 중 {readingCompare.resolved}곳은 6단계에서 표시하지 않았어요.</b>
     <span>{readingCompare.remaining}곳은 여전히 어색하고, 새로 표시한 곳이 {readingCompare.added}개 있습니다.</span></div>}
    {stepDone(7)&&summary.comparable&&<div className="study-summary">
     <b>1단계에서 못 들은 {summary.before}문장 중 {summary.resolved}개를 7단계에서 들었어요.</b>
     <span>{summary.remaining}개는 아직 어렵고, 7단계에서 새로 표시한 부분이 {summary.added}개 있습니다.</span></div>}
   </div>

   <div className="lab-notebook study-script">
    <div className="section-heading"><h2>{step}단계 · {STEP_TITLES[step]}</h2>
     {markSteps.includes(step)?<span>이 단계 표시 {marksForStep(marks,step).length}곳</span>:null}</div>

    {(step===2||step===3||step===5||step===6)&&<SentencePicker label={step===3||step===6?'읽을 문장':'연습할 문장'}
      clips={clips} focus={focus} marksFor={marksOnClip} priorFor={priorOnClip}
      onSelect={id=>{setFocusId(id);setDrillIndex(0);}}
      onPlay={()=>{if(focus)play(focus.start,focus.end);}}/>}

    {step===2&&<section className="study-pack">
     {!Object.keys(packs).length&&<div className="info-box"><CircleHelp size={18}/>
      <p>1단계에서 표시한 문장의 설명을 AI가 한 번에 준비합니다. 표시한 문장이 없으면 아래에서 이 문장만 준비할 수 있어요.</p></div>}
     <div className="button-row">
      <button className="secondary-button" disabled={busy} onClick={()=>void buildPack()}>
       {busy?<LoaderCircle className="spin" size={15}/>:<Sparkles size={15}/>} 표시한 문장 설명 준비</button>
      {focus&&!focusPack&&<button className="plain-button" disabled={busy} onClick={()=>void buildPack(focus.id)}>이 문장만 준비</button>}
     </div>
     {focus&&<>
      <ChunkBoard clip={focus} pack={focusPack}/>
      {focusPack?<>
       <p className="muted chunk-legend">굵은 글씨=강세 · ‿=다음 단어와 이어짐 · 흐린 글씨=약하게 발음. 자막 텍스트 기반 가설입니다.</p>
       <h3>어순</h3><p className="study-text">{focusPack.order}</p>
       <h3>문법</h3><p className="study-text">{focusPack.grammar}</p>
       <h3>이렇게 길어집니다</h3>
       <ol className="study-expansion">{focusPack.expansion.map(line=><li key={line} lang="en">{line}</li>)}</ol>
       {!!focusPack.variations.length&&<><h3>실생활 응용</h3>
        <ul className="study-expansion">{focusPack.variations.map(line=><li key={line} lang="en">{line}</li>)}</ul></>}
       <h3>문장 형식 연습</h3>
       <p className="muted">소리 내어 말한 뒤 체크하세요. 체크는 스스로 기록하는 것이며 채점하지 않습니다.</p>
       <ul className="study-forms">{(data?.forms??[]).map(form=>{
        const done=!!session.forms?.[focus.id]?.[form];
        return <li key={form}>
         <label><input type="checkbox" checked={done} onChange={e=>void toggleForm(focus.id,form,e.target.checked)}/>
          <b>{data?.formLabels?.[form]??form}</b></label>
         <span lang="en">{focusPack.forms[form]}</span></li>;})}</ul>
      </>:<p className="muted">이 문장은 아직 AI 설명이 없습니다. 위 버튼으로 준비하면 청크 뜻·강세·연음 표시가 함께 나옵니다.</p>}
     </>}
     {!!data?.pack?.rejected?.length&&<p className="muted">검증에서 걸러진 문장 {data.pack.rejected.length}개는 출제하지 않았습니다.</p>}
    </section>}

    {step===5&&focus&&<section className="study-shadow">
     <div className="cloze-filters">{(['backward','forward','echo'] as ShadowMode[]).map(m=>
      <button key={m} className={mode===m?'selected':''} onClick={()=>{setMode(m);setDrillIndex(0);void rememberDrill(focus.id,m,rate);}}>{MODE_LABELS[m]}</button>)}</div>
     <p className="muted">{MODE_HINTS[mode]} 덩어리 경계는 저장된 AI 청크이고, 쌓는 순서는 규칙 기반입니다.</p>
     <ChunkBoard clip={focus} pack={focusPack}/>
     <ol className="study-drill">{drills.map((s,i)=><li key={s.label} className={i===drillIndex?'is-current':''}>
      <button onClick={()=>{setDrillIndex(i);
        play(s.start,s.end,mode==='echo'?'loop':'range',mode==='echo'?echoGapMs(s,rate):700);}}>
       <b>{s.label}</b><span lang="en">{s.text}</span>
       <small>{s.chunkCount}덩어리 · {(s.end-s.start).toFixed(1)}초{s.repeat>1?` · ${s.repeat}회 반복`:''}</small></button></li>)}</ol>
     <div className="button-row">
      <span className="muted">속도</span>
      {SPEED_LADDER.map(v=><button key={v} className={'secondary-button'+(Math.abs(v-rate)<.001?' selected':'')}
       onClick={()=>{setRate(v);void rememberDrill(focus.id,mode,v);}}>{v}배속</button>)}
      <button className="plain-button" onClick={()=>{const v=nextRate(rate);setRate(v);void rememberDrill(focus.id,mode,v);}}>다음 속도로</button>
     </div>
     {drill&&mode==='echo'&&<p className="muted">따라 말하기는 덩어리를 재생한 뒤 약 {(echoGapMs(drill,rate)/1000).toFixed(1)}초를 비웁니다. 반복을 끄면 멈춥니다.</p>}
     <p className="muted">속도는 스스로 올립니다. 앱이 목소리를 듣고 판단하지 않습니다.</p>
    </section>}

    {(step===3||step===6)&&focus&&<section className="study-read">
     <ChunkBoard clip={focus} pack={focusPack}/>
     {step===3&&<div className="study-record">
      <div className="button-row">
       {!recording?<button className="secondary-button" onClick={()=>void startRecording()}><Mic size={15}/> 녹음 시작</button>
        :<button className="secondary-button" onClick={stopRecording}><Square size={14}/> 녹음 정지</button>}
       <button className="plain-button" onClick={()=>play(focus.start,focus.end)}><Play size={14}/> 원음 듣기</button>
      </div>
      <p className="muted">녹음은 이 브라우저에만 저장되고 백업에 포함되지 않습니다. 점수는 매기지 않습니다.</p>
      {recorderError&&<p className="inline-error">{recorderError}</p>}
      <ul className="study-recordings">{recordings.map(entry=><li key={entry.id}>
       <span>{new Date(entry.at).toLocaleTimeString('ko-KR')} · {entry.seconds.toFixed(1)}초</span>
       <button className="plain-button" onClick={()=>void compareWithOriginal(entry)}>원음과 번갈아 듣기</button>
       <button className="plain-button" onClick={async()=>{await removeRecording(entry.id);setRecordings(await recordingsFor(focus.id));}}>
        <Trash2 size={13}/> 삭제</button></li>)}</ul>
     </div>}
    </section>}

    {markSteps.includes(step)&&<>
     {(STEP_REASONS[step]?.length??0)>1&&<div className="reason-picker">
      <span className="muted">표시할 이유를 고른 뒤 문장이나 단어를 누르세요</span>
      <div className="cloze-filters">
       {STEP_REASONS[step].map(r=><button key={r} className={reason===r?'selected':''} onClick={()=>setReason(r)}>{REASON_LABELS[r]}</button>)}</div></div>}
     {covered?<p className="study-covered">스크립트를 덮어 두었습니다. {step===1?'끝까지 들은 뒤 펴세요.':'필요할 때만 펴세요.'}</p>:
      <ol className="study-sentences">{clips.map(c=>{
       const words=wordsFor(c);
       const mine=markAt(marks,step,{start:c.start,end:c.end});
       const marked=marks.filter(m=>m.end>c.start+.001&&m.start<c.end-.001);
       const active=speaking&&speaking.start>=c.start-.001&&speaking.end<=c.end+.001?speaking:undefined;
       return <li key={c.id} className={(mine?'is-marked ':'')+(active?'is-speaking':'')}>
        <div className="study-sentence-head">
         <button className="lab-caption-time" onClick={()=>play(c.start,c.end)}>{time(c.start)}</button>
         <button className={'mark-chip'+(mine?' is-on':'')} disabled={busy}
          title={mine?'이 문장의 표시를 해제합니다':`이 문장을 ${REASON_LABELS[reason]}(으)로 표시합니다`}
          onClick={()=>void toggleMark({start:c.start,end:c.end},'sentence')}>
          {mine?<><Flag size={11}/> {REASON_LABELS[mine.reason]} 표시됨 · 해제</>:<>＋ {REASON_LABELS[reason]} 표시</>}</button>
         {active&&<span className="pill">재생 중</span>}
        </div>
        <p lang="en">{words.map((w,i)=>{
         const inMark=marked.some(m=>w.end>m.start+.001&&w.start<m.end-.001);
         const inChunk=!!active&&w.end>active.start+.001&&w.start<active.end-.001;
         // The leading space lives inside the button so a marked run reads as one stretch, not a row of boxes.
         return <button key={i} className={'study-word'+(inMark?' is-marked':'')+(inChunk?' is-speaking':'')}
           onClick={()=>{
            if(!anchor||anchor.clipId!==c.id){setAnchor({clipId:c.id,word:w});return;}
            void toggleMark(selectedRange(anchor.word,w),'words');setAnchor(null);
           }}>{i>0?' ':''}{w.text}</button>;})}</p>
        {!!marked.length&&<small className="study-mark-list">{marked.map(m=>`${m.step}단계 ${REASON_LABELS[m.reason]}`).join(' · ')}</small>}
       </li>;})}</ol>}
     {anchor&&<p className="inline-notice" role="status">시작: “{anchor.word.text}” · 마지막 단어를 눌러 범위를 표시하세요.
      <button className="plain-button" onClick={()=>setAnchor(null)}>취소</button></p>}
    </>}

    <div className="button-row study-actions">
     <button className="primary-button" disabled={busy}
      onClick={()=>void saveStep(step,!stepDone(step),step===1?{seekDetected}:undefined)}>
      {busy?<LoaderCircle className="spin" size={16}/>:null} {stepDone(step)?'이 단계 완료 취소':'이 단계 완료'}</button>
     <span className="muted">표시와 체크는 저장됩니다.</span>
    </div>
    {notice&&<p className="inline-notice" role="status">{notice}</p>}
   </div>
  </div>
 </div>;
}
