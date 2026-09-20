import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,Copy,Save} from 'lucide-react';
import {wordsFor,unitsFor,selectedRange,unitAt,highlightRuns,transitionMemory} from './transcript';
import {jumped} from './playback';
import type {PlaybackSample} from './playback';
import type {Word,Unit} from './transcript';

type Clip={id:string;sourceId:string;start:number;end:number;text:string;sentenceStatus?:'edited'|'ai-reviewed'|'original'|'candidate'|'runtime-ai';words?:{text:string;start:number;end:number}[];chunks?:Unit[];paragraphId?:string};
type KeyboardItem={clip:Clip;text:string;start:number;end:number;word?:Word};
type PlayKind='range'|'once'|'continuous';
type PlayerControls={snapshot:()=>{time:number;playing:boolean;continuous:boolean};finishAt:(end:number)=>void};
type Note={exerciseId:string;start:number;end:number;heard:string;target:string;feedback:string;reheard:string};
type Source={id:string;title:string;status?:string;message?:string;revision?:string};
function clipUnits(c:Clip,mode:'chunk'|'sentence'|'paragraph'|'word'):Unit[]{
 if(mode==='chunk'&&c.chunks)return c.chunks;
 if(mode==='sentence'||mode==='paragraph')return [{text:c.text,start:c.start,end:c.end,first:0,last:wordsFor(c).length-1,candidate:c.sentenceStatus==='candidate'}];
 return unitsFor(wordsFor(c),'chunk');
}
function paragraphClips(clips:Clip[]):Clip[]{
 const groups=new Map<string,Clip[]>();
 for(const c of clips){if(!c.paragraphId)continue;const group=groups.get(c.paragraphId)||[];group.push(c);groups.set(c.paragraphId,group);}
 return [...groups.values()].map(g=>({...g[0],end:g[g.length-1].end,text:g.map(c=>c.text).join(' '),words:g.flatMap(c=>c.words||[])}));
}
function HighlightedText({words,range}:{words:Word[];range:{start:number;end:number}|null}){
 return <>{highlightRuns(words,range).map((run,i)=><React.Fragment key={i}>{i>0?' ':''}{run.highlighted?<mark className="continuity-memory">{run.text}</mark>:run.text}</React.Fragment>)}</>;
}
async function request(path:string,data?:unknown){
 const r=await fetch('/api/sound-lab'+path,{cache:'no-store',method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 const v=await r.json();if(!r.ok)throw new Error(v.detail||'요청을 처리하지 못했어요.');return v;
}
const time=(v:number)=>`${Math.floor(v/60)}:${(v%60).toFixed(1).padStart(4,'0')}`;
let loading:Promise<void>|undefined;
function loadPlayer(){return loading??=new Promise<void>((resolve,reject)=>{
 if(window.YT?.Player){resolve();return;}
 const prior=window.onYouTubeIframeAPIReady;
 window.onYouTubeIframeAPIReady=()=>{prior?.();resolve();};
 const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>{loading=undefined;reject(new Error('영상 플레이어 연결 실패. 페이지를 새로고침해주세요.'));};document.head.appendChild(s);
});}

function LoopPlayer({clip,start,end,playRequest,playKind,controls,onPosition,maxTime}:{clip:Clip;start:number;end:number;playRequest:number;playKind:PlayKind;controls:React.MutableRefObject<PlayerControls|null>;maxTime:number;onPosition:(time:number,playing:boolean,continuous:boolean,moved:boolean,rangeEnd:number)=>void}){
 const slot=useRef<HTMLDivElement>(null),player=useRef<any>(null);
 const [ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false),[rate,setRate]=useState(1),[rates,setRates]=useState<number[]>([1]),[error,setError]=useState('');
 const [continuous,setContinuous]=useState(true);
 const continuousRef=useRef(true),sample=useRef<PlaybackSample|null>(null);
 const state=useRef({start,end,loop,rate});state.current={start,end,loop,rate};
 const valid=Number.isFinite(start)&&Number.isFinite(end)&&end-start>=.1999&&start>=0&&end<=maxTime;
 const positionCallback=useRef(onPosition);positionCallback.current=onPosition;
 const stopAt=useRef<number|null>(null);
 const active=useRef(false),seeking=useRef(false),pending=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 function stop(){stopAt.current=null;seeking.current=false;active.current=false;clearTimeout(pending.current);pending.current=undefined;player.current?.pauseVideo?.();setPlaying(false);}
 function explore(){
  stopAt.current=null;
  active.current=false;seeking.current=false;clearTimeout(pending.current);pending.current=undefined;
  continuousRef.current=true;setContinuous(true);setLoop(false);
 }
 function begin(kind:PlayKind='range'){
  clearTimeout(pending.current);pending.current=undefined;
  const p=player.current,s=state.current;if(!p||!ready||!valid)return;
  stopAt.current=null;if(kind!=='range'){setLoop(false);state.current.loop=false;}continuousRef.current=kind==='continuous';setContinuous(kind==='continuous');sample.current=null;active.current=kind!=='continuous';seeking.current=true;p.seekTo(s.start,true);p.setPlaybackRate(s.rate);p.playVideo();
 }
 controls.current={snapshot:()=>({time:player.current?.getCurrentTime?.()??start,playing:player.current?.getPlayerState?.()===1,continuous:continuousRef.current}),finishAt:(boundary)=>{
  clearTimeout(pending.current);pending.current=undefined;setLoop(false);state.current.loop=false;
  stopAt.current=boundary;active.current=true;seeking.current=false;continuousRef.current=false;setContinuous(false);
 }};
 useEffect(()=>{
  let disposed=false;setReady(false);
  loadPlayer().then(()=>{
   if(disposed||!slot.current)return;
   const div=document.createElement('div');slot.current.replaceChildren(div);
   player.current=new window.YT.Player(div,{width:'100%',height:'100%',videoId:clip.sourceId,playerVars:{origin:location.origin,playsinline:1,rel:0},events:{
    onReady:()=>{if(disposed)return;setReady(true);setRates(player.current.getAvailablePlaybackRates());player.current.cueVideoById({videoId:clip.sourceId,startSeconds:state.current.start});},
    onStateChange:(ev:any)=>{
     if(disposed)return;setPlaying(ev.data===1);
     if(ev.data===1&&!active.current&&!seeking.current)explore();
     // A native pause releases the old range. Buffering (3) does not.
     if(ev.data===2&&!pending.current&&!seeking.current)active.current=false;
    },
    onAutoplayBlocked:()=>{if(!disposed){active.current=false;seeking.current=false;setError('브라우저가 자동 재생을 막았어요. 영상의 재생 버튼을 한 번 눌러주세요.');}},
    onError:()=>{if(!disposed){active.current=false;seeking.current=false;setError('이 영상은 앱에서 재생할 수 없어요. 아래 원본 링크로 확인해주세요.');}}
   }});
  }).catch(e=>{if(!disposed)setError(e.message);});
  const tick=setInterval(()=>{
   const p=player.current,s=state.current;
   if(!p?.getCurrentTime||!p?.getPlayerState)return;
   const now:PlaybackSample={time:p.getCurrentTime(),wall:performance.now(),playing:p.getPlayerState()===1,rate:p.getPlaybackRate?.()||s.rate};
   const moved=!seeking.current&&jumped(sample.current,now);
   if(moved)explore();
   if(!seeking.current)sample.current=now;
   positionCallback.current(now.time,now.playing,continuousRef.current,moved,stopAt.current??s.end);
   if(seeking.current){if(now.time<s.end){seeking.current=false;sample.current=now;}else return;}
   if(!active.current||pending.current)return;
   if((p.getPlayerState()===1&&p.getCurrentTime()>=(stopAt.current??s.end))||p.getPlayerState()===0){
    p.pauseVideo();setPlaying(false);
    if(s.loop&&stopAt.current===null){pending.current=setTimeout(()=>{pending.current=undefined;if(disposed||!active.current)return;sample.current=null;seeking.current=true;p.seekTo(state.current.start,true);p.setPlaybackRate(state.current.rate);p.playVideo();},700);}
    else active.current=false;
   }
  },60);
  return()=>{disposed=true;active.current=false;clearInterval(tick);clearTimeout(pending.current);player.current?.destroy();player.current=null;};
 },[clip.sourceId]);
 useEffect(()=>{stop();},[clip.id,start,end]);
 useEffect(()=>{if(ready&&playRequest>0)begin(playKind);},[ready,playRequest]);
 useEffect(()=>{if(!loop){if(pending.current)active.current=false;clearTimeout(pending.current);pending.current=undefined;}},[loop]);
 return <section className="lab-player">
  <div className="video-slot" ref={slot}/>
  <div className="lab-transport">
   <label><input type="checkbox" checked={loop} onChange={e=>{setLoop(e.target.checked);if(e.target.checked)begin();}}/> 반복 · 0.7초 쉬기</label>
   <select aria-label="재생 속도" value={rate} onChange={e=>{setRate(Number(e.target.value));player.current?.setPlaybackRate(Number(e.target.value));}}>{rates.map(r=><option key={r} value={r}>{r}배속</option>)}</select>
   <button className="primary-button" disabled={!ready||!valid} onClick={()=>playing||pending.current?stop():begin()}>{playing?<Pause size={17}/>:<Play size={17}/>} {playing?'멈추기':'선택 구간 듣기'}</button>
  </div>
  <p className="lab-playback-mode">{continuous?'이어 듣기':'구간 연습'}</p>
  {error&&<p role="alert" className="inline-error">{error}</p>}
  {!valid&&<p role="alert" className="inline-error">오른쪽 자막에서 재생할 구간을 다시 선택해주세요.</p>}
  <a className="text-link" href={`https://www.youtube.com/watch?v=${clip.sourceId}&t=${Math.floor(start)}s`} target="_blank" rel="noreferrer">YouTube 원본 열기</a>
 </section>;
}

export default function SoundLab({sources,activeSource,ai}:{sources:Source[];activeSource?:string;ai:boolean}){
 const [clips,setClips]=useState<Clip[]>([]),[notes,setNotes]=useState<Note[]>([]),[selected,setSelected]=useState(''),[source,setSource]=useState(activeSource||''),[loaded,setLoaded]=useState(false);
 const [start,setStart]=useState(0),[end,setEnd]=useState(1),[target,setTarget]=useState(''),[heard,setHeard]=useState(''),[feedback,setFeedback]=useState(''),[reheard,setReheard]=useState('');
 const [show,setShow]=useState(false),[search,setSearch]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[promptVisible,setPromptVisible]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [mode,setMode]=useState<'chunk'|'sentence'|'paragraph'|'word'>('sentence'),[playRequest,setPlayRequest]=useState(0);
 const [playKind,setPlayKind]=useState<PlayKind>('range');
 const playerControls=useRef<PlayerControls|null>(null);
 const [keyboardTime,setKeyboardTime]=useState<number|null>(null);
 const [position,setPosition]=useState({time:0,playing:false}),[anchor,setAnchor]=useState<{clip:Clip;word:Word}|null>(null);
 const [selection,setSelection]=useState<{start:number;end:number}|null>(null);
 const [focusTime,setFocusTime]=useState<number|null>(null),[previousRange,setPreviousRange]=useState<{start:number;end:number}|null>(null),[scrollRequest,setScrollRequest]=useState(0);
 const hasListeningPosition=useRef(false);
 const [guideOpen,setGuideOpen]=useState(()=>{try{return localStorage.getItem('listening-guide-seen')!=='1';}catch{return true;}});
 const learningStarted=useRef(false);
 function startLearning(){
  if(learningStarted.current)return;
  learningStarted.current=true;setGuideOpen(false);
  try{localStorage.setItem('listening-guide-seen','1');}catch{}
 }
 function toggleGuide(){setGuideOpen(v=>!v);try{localStorage.setItem('listening-guide-seen','1');}catch{}}

 const [followPlayback,setFollowPlayback]=useState(true);
 const captionScroll=useRef<HTMLDivElement>(null);
 const sourceClips=clips.filter(c=>c.sourceId===source);
 const displayedClips=mode==='paragraph'?paragraphClips(sourceClips):sourceClips;
 const focusPoint=position.playing?position.time:focusTime;
 const focusClip=focusPoint===null?undefined:unitAt(displayedClips,focusPoint);
 const focusUnit=focusClip&&focusPoint!==null?(mode==='word'?unitAt(wordsFor(focusClip),focusPoint):unitAt(clipUnits(focusClip,mode),focusPoint)):undefined;
 useEffect(()=>{if(!followPlayback)return;const frame=requestAnimationFrame(()=>{const list=captionScroll.current;const item=list?.querySelector<HTMLElement>('[data-continuity="true"]');if(list&&item){const a=list.getBoundingClientRect(),b=item.getBoundingClientRect();list.scrollTop+=b.top-a.top-list.clientHeight/3;}});return()=>cancelAnimationFrame(frame);},[mode,scrollRequest,focusClip?.id,focusUnit?.start,followPlayback]);
 function changeMode(next:typeof mode,point=position.playing?position.time:focusTime??selection?.start??start){
  const oldClip=unitAt(displayedClips,point);
  const oldUnit=oldClip?unitAt(clipUnits(oldClip,mode),point):undefined;
  setPreviousRange(previous=>transitionMemory(mode,next,hasListeningPosition.current?oldUnit??null:null,previous));
  setFollowPlayback(true);setFocusTime(point);setMode(next);setAnchor(null);setSearch('');setScrollRequest(v=>v+1);
 }
 const keyboardItems=displayedClips.filter(c=>c.text.toLowerCase().includes(search.toLowerCase())).flatMap<KeyboardItem>(c=>
  mode==='word'?wordsFor(c).map(word=>({clip:c,...word,word})):clipUnits(c,mode).map(u=>({clip:c,...u,word:undefined as Word|undefined})));
 const keyboardItem=keyboardTime===null?undefined:unitAt(keyboardItems,keyboardTime);
 useEffect(()=>{
  if(!keyboardItem)return;
  const frame=requestAnimationFrame(()=>{const list=captionScroll.current,item=list?.querySelector<HTMLElement>('[data-keyboard="true"]');if(list&&item){const a=list.getBoundingClientRect(),b=item.getBoundingClientRect();if(b.top<a.top||b.bottom>a.bottom)list.scrollTop+=b.top-a.top-list.clientHeight/3;}});
  return()=>cancelAnimationFrame(frame);
 },[keyboardItem?.start,mode,search]);
 function captionKey(e:React.KeyboardEvent<HTMLDivElement>){
  if(e.altKey||e.ctrlKey||e.metaKey||e.nativeEvent.isComposing||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();if(busy||changing.current||!keyboardItems.length||e.repeat&&e.key==='Enter')return;
  const live=playerControls.current?.snapshot();
  const point=keyboardTime??live?.time??focusTime??start;
  const item=unitAt(keyboardItems,point)!;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
   const index=keyboardItems.indexOf(item),next=keyboardItems[Math.max(0,Math.min(keyboardItems.length-1,index+(e.key==='ArrowDown'?1:-1)))];
   setKeyboardTime(next.start);setFollowPlayback(false);captionScroll.current?.focus({preventScroll:true});return;
  }
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   const modes=['word','chunk','sentence','paragraph'] as const;
   const next=modes[Math.max(0,Math.min(modes.length-1,modes.indexOf(mode)+(e.key==='ArrowRight'?1:-1)))];
   changeMode(next,item.start);setKeyboardTime(item.start);setFollowPlayback(false);captionScroll.current?.focus({preventScroll:true});return;
  }
  if(!e.shiftKey&&live?.playing&&live.continuous){
   const all=displayedClips.flatMap<{start:number;end:number}>(c=>mode==='word'?wordsFor(c):clipUnits(c,mode));
   const playingUnit=unitAt<{start:number;end:number}>(all,live.time);
   if(playingUnit){playerControls.current?.finishAt(playingUnit.end);setKeyboardTime(playingUnit.start);setStatus('현재 항목의 끝까지 듣고 멈춥니다.');}
   return;
  }
  setKeyboardTime(item.start);
  if(mode==='word'&&!e.shiftKey&&item.word)void Promise.resolve(wordClick(item.clip,item.word,'once')).then(()=>captionScroll.current?.focus({preventScroll:true}));
  else void choose(item.clip,item,item.text,e.shiftKey?'continuous':'once').then(()=>captionScroll.current?.focus({preventScroll:true}));
 }
 const maxTime=Math.max(1,...sourceClips.map(c=>c.end));
 const changing=useRef(false);
 const clip=clips.find(c=>c.id===selected);
 const activeCaption=sourceClips.find(c=>position.time>=c.start&&position.time<c.end);
 const activeUnit=activeCaption?clipUnits(activeCaption,mode).find(u=>position.time>=u.start&&position.time<u.end):undefined;
 const revision=sources.map(s=>s.id+':'+s.status+':'+s.revision).join('|');
 useEffect(()=>{let alive=true;request('').then(v=>{if(alive){setClips(v.clips);setNotes(v.notes);setLoaded(true);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[revision]);
 useEffect(()=>{let alive=true;request('').then(v=>{if(!alive)return;setClips(v.clips);setNotes(v.notes);setLoaded(true);const first=v.clips.find((c:Clip)=>c.sourceId===source);if(first){let n=v.notes.find((n:Note)=>n.exerciseId===first.id);try{const raw=localStorage.getItem('sound-draft:'+first.id);if(raw){n=JSON.parse(raw);setDirty(true);}}catch{}setSelected(first.id);setStart(n?.start??first.start);setEnd(n?.end??first.end);setTarget(n?.target??'');setHeard(n?.heard??'');setFeedback(n?.feedback??'');setReheard(n?.reheard??'');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const data={exerciseId:selected,start,end,target,heard,feedback,reheard};
 useEffect(()=>{if(!dirty||!selected)return;try{localStorage.setItem('sound-draft:'+selected,JSON.stringify(data));}catch{setError('임시 기록을 보관하지 못했어요. 메뉴 이동 전에 저장해주세요.');}},[selected,start,end,target,heard,feedback,reheard,dirty]);
 async function save(){const saved=await request('/notes',data);setNotes(n=>[...n.filter(x=>x.exerciseId!==selected),saved]);try{localStorage.removeItem('sound-draft:'+selected);}catch{}setDirty(false);setStatus('이 구간의 기록을 저장했어요.');return saved;}
 async function choose(c:Clip,range={start:c.start,end:c.end},text=c.text,kind:PlayKind='range'){
  if(changing.current)return;changing.current=true;setBusy(true);
  try{
   if(c.id!==selected){
    if(dirty)await save();let draft:Note|undefined;
    try{const raw=localStorage.getItem('sound-draft:'+c.id);if(raw)draft=JSON.parse(raw);}catch{}
    const n=draft??notes.find(n=>n.exerciseId===c.id);
    setSelected(c.id);setHeard(n?.heard??'');setFeedback(n?.feedback??'');setReheard(n?.reheard??'');setShow(false);setPromptVisible(false);
   }
   const safeStart=Math.round(range.start*1000)/1000;
   const safeEnd=Math.min(maxTime,Math.round(Math.max(range.end,safeStart+.2)*1000)/1000);
   setStart(safeStart);setEnd(safeEnd);setTarget(text);setSelection({start:range.start,end:range.end});
   startLearning();setKeyboardTime(range.start);setFollowPlayback(true);hasListeningPosition.current=true;setFocusTime(range.start);setPreviousRange(null);setPosition({time:range.start,playing:false});setDirty(true);setStatus('선택한 부분을 재생합니다. 변경한 구간은 노트와 함께 저장할 수 있어요.');setError('');setAnchor(null);setPlayKind(kind);setPlayRequest(v=>v+1);
  }catch(e){setError((e as Error).message);}finally{changing.current=false;setBusy(false);}
 }
 function wordClick(c:Clip,word:Word,kind:PlayKind='range'){
  if(!anchor){setAnchor({clip:c,word});return;}
  const range=selectedRange(anchor.word,word);
  const first=anchor.word.start<=word.start?anchor.clip:c;
  const text=first.id===c.id&&anchor.clip.id===c.id?wordsFor(c).filter(w=>w.start>=range.start&&w.end<=range.end).map(w=>w.text).join(' '):sourceClips.filter(c=>c.end>range.start&&c.start<range.end).flatMap(c=>wordsFor(c).filter(w=>w.start>=range.start&&w.end<=range.end).map(w=>w.text)).join(' ');
  return choose(first,range,text,kind);
 }
 function edit(action:()=>void){action();setDirty(true);setStatus('아직 저장하지 않은 변경이 있어요.');}
 const prompt=clip?`영어 듣기 피드백을 한국어로 해주세요. 문법·번역보다 소리를 식별하는 연습이 목적입니다.
영상: https://www.youtube.com/watch?v=${clip.sourceId}&t=${Math.floor(start)}s
선택 시간: ${start}초 ~ ${end}초 (선택한 자막 구간이며 정확한 음성 경계는 미검증)
주변 자막(오류 가능): ${clip.text}
집중할 영어 구절: ${target||'아직 특정하지 못함 — 문맥에서 임의로 확정하지 말아주세요.'}
처음 내 귀에 들린 소리: ${heard||'(아직 기록하지 않음)'}
이전 피드백: ${feedback||'없음'}
다시 듣고 들린 소리: ${reheard||'아직 없음'}
원음을 직접 확인하지 않았다면 들었다고 하지 말고, 자막과 내 한글 표기에 근거한 발음 가설임을 밝혀주세요. 한글 표기는 정확한 발음 기호가 아니라 내 청각 인상의 기록입니다. 어떤 단어 경계·연결·약화·강세 때문에 그렇게 들릴 수 있는지 가능한 설명 1~2개와 불확실성을 알려주세요. 필요하면 혀·입술·성대 움직임을 설명하고, 다음 재청취에서 확인할 소리 단서 하나를 주세요. 내 발음 점수나 실제 화자의 발음을 확정하지 말아주세요.`:'';
 return <div className="sound-lab"><div className="page-heading"><h1>내 귀에는 이렇게 들렸어요.</h1><p>짧게 반복하고, 들린 소리를 적고, 피드백을 참고해 다시 들어보세요.</p></div>
  <div className="lab-source"><label htmlFor="lab-source">연습할 영상</label><select id="lab-source" value={source} disabled={busy} onChange={async e=>{const next=e.target.value;try{if(dirty)await save();setSource(next);setKeyboardTime(null);hasListeningPosition.current=false;setFocusTime(null);setPreviousRange(null);setPosition({time:0,playing:false});setSelected('');setSearch('');setAnchor(null);setSelection(null);setPlayRequest(0);}catch(x){setError((x as Error).message);}}}><option value="">영상 선택</option>{sources.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <p role="status">{sources.find(s=>s.id===source)?.message}</p>
  {source&&<button className="secondary-button" disabled={busy||['fetching','analyzing'].includes(sources.find(s=>s.id===source)?.status||'')} onClick={async()=>{try{const r=await fetch('/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:`https://www.youtube.com/watch?v=${source}`})});if(!r.ok)throw new Error('준비 요청에 실패했어요.');setStatus('자막과 AI 분석 준비를 요청했어요.');}catch(e){setError((e as Error).message);}}}>자막·AI 분석 준비</button>}
  <div className="lab-layout"><div className="lab-listen">
   {clip?<><LoopPlayer key={clip.sourceId} clip={clip} start={start} end={end} maxTime={maxTime} playRequest={playRequest} playKind={playKind} controls={playerControls} onPosition={(time,playing,continuous,moved,rangeEnd)=>{if(playing||moved){startLearning();hasListeningPosition.current=true;setFocusTime(continuous?time:Math.min(time,rangeEnd-.001));}if(moved){setKeyboardTime(null);setFollowPlayback(true);setPreviousRange(null);setSearch('');setAnchor(null);setScrollRequest(v=>v+1);}setPosition(p=>Math.abs(p.time-time)>.08||p.playing!==playing?{time,playing}:p);}}/><div className="lab-now"><b>{position.playing?'재생 중':'현재 위치'} {time(position.time)}</b><span>{activeUnit?.text||(hasListeningPosition.current?'이 위치에는 자막이 없습니다.':target||clip.text)}</span><small>단어·청크·문장 위치는 자막 시간 기반 추정</small></div>
   </>:<div className="lab-empty"><h2>오른쪽 자막을 누르면 바로 재생됩니다.</h2><p>청크·문장·문단을 선택하거나, 시작 단어와 마지막 단어를 골라 들을 수 있어요.</p></div>}
  </div><section className="lab-clips lab-captions" aria-label="자막 선택">
   <div className="section-heading"><h2>자막을 눌러 바로 듣기</h2><span>{sourceClips.length}개 구간</span></div>
   <div className="lab-modes" aria-label="선택 단위">{([['chunk','청크'],['sentence','문장'],['paragraph','문단'],['word','단어 범위']] as const).map(([value,label])=><button key={value} aria-pressed={mode===value} disabled={busy} onClick={()=>changeMode(value)}>{label}</button>)}</div>
   <div className="lab-caption-actions"><button type="button" onClick={()=>changeMode(mode)}>현재 위치로 돌아가기</button><button type="button" aria-expanded={guideOpen} aria-controls="lab-guide" onClick={toggleGuide}>사용 안내 {guideOpen?'접기':'보기'}</button></div>
   {guideOpen&&<div id="lab-guide" className="lab-guide">
   <p className="lab-timing-note">자막 목록에서 ↑↓ 항목 이동 · ←→ 단어/청크/문장/문단 전환 · Enter 한 항목 듣기 · Shift+Enter 연속 재생. 연속 재생 중 Enter는 현재 항목 끝에서 멈춥니다. 단어 보기에서는 Enter 두 번으로 범위를 고릅니다. 점선은 키보드 탐색 위치입니다.</p>
   <p className="lab-continuity-note">단위를 바꿔도 재생은 이어집니다. 노란색은 상위 보기로 옮기기 직전에 듣던 부분, 파란 테두리는 현재 위치, 파란 밑줄은 재생 중인 부분입니다. 새 구간을 누르면 노란색은 사라집니다. 반복 범위는 자막을 누를 때 바뀝니다.</p>
   {mode==='paragraph'&&!displayedClips.length&&<p>AI 분석이 완료되면 의미에 따라 묶은 문단을 선택할 수 있어요.</p>}
   {(mode==='chunk'||mode==='sentence')&&sourceClips.some(c=>!c.chunks)&&<p>아직 AI 청크 분석이 없는 구간은 규칙으로 나눈 임시 청크입니다.</p>}
   <p className="lab-timing-note">{mode==='word'?'시작 단어 → 마지막 단어를 누르면 두 단어를 포함해 재생합니다.':(mode==='paragraph'?'문장을 누르면 그 문장만, 시간 옆 ▶를 누르면 문단 전체를 재생합니다.':mode==='sentence'?'청크를 누르면 그 청크만, 시간 옆 ▶를 누르면 문장 전체를 재생합니다.':'청크를 누르면 해당 청크를 바로 재생합니다.')}<br/>{sourceClips.some(c=>c.sentenceStatus==='runtime-ai')?'앱에서 AI가 전체 자막을 분석한 결과입니다.':sourceClips.some(c=>c.sentenceStatus==='ai-reviewed')?'기존에 저장한 문장 분석입니다. 새 AI 청크·문단 분석은 별도로 준비하세요.':'AI 분석 전 자료입니다. 자막 경계를 실제 문장 경계로 확정하지 않습니다.'} 원본 자막의 오류는 남아 있을 수 있으며, 재생 시간은 추정입니다.</p>
   <p className="lab-timing-note">영상에서 위치를 찾으면 자막이 따라갑니다. 영상의 ▶는 이어 듣기, 자막 선택은 구간 연습입니다. 자막을 직접 스크롤한 뒤에는 ‘현재 위치로 돌아가기’로 다시 따라갈 수 있습니다.</p>
   </div>}
   {anchor&&<div className="lab-anchor" role="status">시작: “{anchor.word.text}” · 마지막 단어를 선택하세요.<button onClick={()=>setAnchor(null)}>선택 취소</button></div>}
   <input aria-label="자막 검색" placeholder="찾고 싶은 영어 단어로 검색" value={search} onChange={e=>{setSearch(e.target.value);setKeyboardTime(null);}}/>
   <div className="lab-caption-scroll" ref={captionScroll} tabIndex={0} role="region" aria-label="키보드 자막 탐색" onKeyDown={captionKey} onWheel={()=>setFollowPlayback(false)} onTouchMove={()=>setFollowPlayback(false)} onPointerDown={()=>setFollowPlayback(false)}>{displayedClips.filter(c=>c.text.toLowerCase().includes(search.toLowerCase())).map(c=>{
    const words=wordsFor(c);const current=position.playing&&position.time>=c.start&&position.time<c.end;
    return <article key={c.id} className={'lab-caption '+(c.id===selected?'selected ':'')+(current?'is-current':'')}>
     <button className="lab-caption-time" disabled={busy} onClick={()=>void choose(c)} aria-label={`${time(c.start)} 자막 전체 재생`}>{time(c.start)} – {time(c.end)} <Play size={12}/>{notes.some(n=>n.exerciseId===c.id)&&<small>기록 있음</small>}</button>
     <div className="lab-units" lang="en">{mode==='word'?words.map(w=>{
      const now=current&&position.time>=w.start&&position.time<w.end;
      const chosen=selection&&w.start>=selection.start&&w.end<=selection.end;
      return <button key={w.index} data-keyboard={keyboardItem?.clip.id===c.id&&keyboardItem.start===w.start?'true':undefined} data-continuity={c.id===focusClip?.id&&w.start===focusUnit?.start?'true':undefined} disabled={busy} aria-label={`${w.text} (${time(w.start)}) 단어`} aria-pressed={!!chosen} aria-current={now?'true':undefined} className={(now?'speaking ':'')+(chosen?'range-selected ':'')+(anchor?.clip.id===c.id&&anchor.word.index===w.index?'anchor-word':'')} onClick={()=>wordClick(c,w)}>{w.text}</button>;
     }):clipUnits(c,mode).map((u,i)=>{
      const focused=c.id===focusClip?.id&&u.start===focusUnit?.start&&u.end===focusUnit?.end;
      const memory=previousRange&&previousRange.start>=u.start-.001&&previousRange.end<=u.end+.001?previousRange:null;
      if(mode==='chunk')return <button key={i} data-keyboard={keyboardItem?.clip.id===c.id&&keyboardItem.start===u.start?'true':undefined} data-continuity={focused?'true':undefined} disabled={busy} className={focused?'continuity-focus':''} aria-current={current&&position.time>=u.start&&position.time<u.end?'true':undefined} onClick={()=>void choose(c,u,u.text)}><HighlightedText words={words.filter(w=>w.end>u.start&&w.start<u.end)} range={memory}/></button>;
      const children=mode==='paragraph'
       ?sourceClips.filter(sentence=>sentence.paragraphId===c.paragraphId).map(sentence=>({clip:sentence,unit:clipUnits(sentence,'sentence')[0]}))
       :clipUnits(c,'chunk').map(unit=>({clip:c,unit}));
      const whole=!!memory&&memory.start<=u.start+.001&&memory.end>=u.end-.001;
      const content=children.map(({clip:childClip,unit:child},j)=>{
       const now=current&&position.time>=child.start&&position.time<child.end;
       const chosen=!!selection&&Math.abs(child.start-selection.start)<.01&&Math.abs(child.end-selection.end)<.01;
       return <React.Fragment key={j}>{j>0?' ':''}<button type="button" className="lab-inline-unit" disabled={busy} aria-label={`${mode==='paragraph'?'문장':'청크'} 재생: ${child.text}`} aria-current={now?'true':undefined} aria-pressed={chosen} onClick={()=>void choose(childClip,child,child.text)}><HighlightedText words={wordsFor(childClip).filter(w=>w.end>child.start&&w.start<child.end)} range={whole?null:memory}/></button></React.Fragment>;
      });
      return <div key={i} data-keyboard={keyboardItem?.clip.id===c.id&&keyboardItem.start===u.start?'true':undefined} data-continuity={focused?'true':undefined} className={'lab-context '+(focused?'continuity-focus':'')}>
       {whole?<mark className="continuity-memory">{content}</mark>:content}
       {mode==='sentence'&&(c.sentenceStatus==='candidate'||(!c.sentenceStatus&&u.candidate))&&<small>경계 미확인 · 임시 구간</small>}
      </div>;
     })}</div>
    </article>;
   })}{!loaded?<p>구간을 불러오고 있어요.</p>:!sourceClips.length?<p>‘내 영상’에서 영상을 추가하거나 준비 상태를 확인해주세요.</p>:!sourceClips.some(c=>c.text.toLowerCase().includes(search.toLowerCase()))&&<p>검색 결과가 없어요.</p>}</div>
  </section></div><aside className="lab-notebook">{clip?<>
   <h2>소리를 비교하는 노트</h2><label htmlFor="heard">1. 처음 들린 소리</label><textarea id="heard" maxLength={12000} value={heard} onChange={e=>edit(()=>setHeard(e.target.value))} placeholder="맞는 철자를 찾지 말고, 들리는 그대로 한글로 적어보세요. 안 들린 곳은 (…)로 남겨도 돼요."/>
   <button className="plain-button" onClick={()=>setShow(!show)}>{show?'주변 자막 접기':'주변 자막 확인하기'}</button>{show&&<div className="lab-transcript"><p lang="en">{clip.text}</p><small>수집한 자막 · 원음 대조 전</small></div>}
   <label htmlFor="target">집중할 영어 구절</label><input id="target" maxLength={12000} value={target} onChange={e=>edit(()=>setTarget(e.target.value))} placeholder="예: what it does"/>
   <label htmlFor="feedback">2. 발음 피드백</label><p className="lab-hint">자막과 한글 기록으로 가능한 발음을 추론합니다. 실제 화자의 소리를 확인한 결과는 아니에요.</p>
   <div className="button-row"><button className="secondary-button" disabled={!heard.trim()||busy} onClick={async()=>{try{await save();await navigator.clipboard.writeText(prompt);setStatus('질문을 복사했어요. ChatGPT 대화에 붙여넣어 주세요.');}catch(e){setPromptVisible(true);setError('자동 복사 또는 저장에 실패했어요. 아래 질문을 직접 복사하고 저장 상태를 확인해주세요.');}}}><Copy size={15}/> ChatGPT 질문 복사</button>{ai&&<button className="secondary-button" disabled={busy||!heard.trim()} onClick={async()=>{setBusy(true);setError('');try{await save();const r=await request('/feedback',data);edit(()=>setFeedback(r.feedback));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'발음 가설 준비 중…':'로컬 AI 피드백'}</button>}</div>
   {promptVisible&&<textarea aria-label="직접 복사할 질문" readOnly value={prompt} onFocus={e=>e.target.select()}/>}
   <textarea id="feedback" maxLength={12000} value={feedback} onChange={e=>edit(()=>setFeedback(e.target.value))} placeholder="대화에서 받은 피드백을 여기에 붙여넣으세요."/>
   <label htmlFor="reheard">3. 피드백을 참고해 다시 들은 소리</label><textarea id="reheard" maxLength={12000} value={reheard} onChange={e=>edit(()=>setReheard(e.target.value))} placeholder="처음과 달리 들리는 부분, 여전히 안 들리는 부분을 적으세요. 이 기록도 다음 질문에 포함됩니다."/>
   <button className="primary-button" disabled={busy} onClick={()=>void save().catch(e=>setError(e.message))}><Save size={16}/> 구간과 기록 저장</button><p className="lab-hint" role="status">{status||'구간을 바꿀 때 기록을 저장합니다. 메뉴 이동 전에는 저장 버튼을 눌러주세요.'}</p>
  </>:<><h2>소리를 비교하는 노트</h2><p>구간을 고르면 내가 들은 소리와 피드백, 다시 들은 소리를 나란히 남길 수 있어요.</p><p>한글 표기는 정답이 아니라 내 귀에 어떻게 들렸는지를 확인하는 기록이에요.</p></>}</aside>
 </div>;
}
