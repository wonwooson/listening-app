import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,RotateCcw,Copy,Save} from 'lucide-react';
import {wordsFor,unitsFor,selectedRange} from './transcript';
import type {Word,Unit} from './transcript';

type Clip={id:string;sourceId:string;start:number;end:number;text:string;sentenceStatus?:'edited'|'ai-reviewed'|'original'|'candidate'|'runtime-ai';words?:{text:string;start:number;end:number}[];chunks?:Unit[];paragraphId?:string};
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

function LoopPlayer({clip,start,end,onBoundary,playRequest,onPosition,maxTime}:{clip:Clip;start:number;end:number;playRequest:number;maxTime:number;onPosition:(time:number,playing:boolean)=>void;onBoundary:(which:'start'|'end',value:number)=>void}){
 const slot=useRef<HTMLDivElement>(null),player=useRef<any>(null);
 const [ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false),[rate,setRate]=useState(1),[rates,setRates]=useState<number[]>([1]),[error,setError]=useState(''),[count,setCount]=useState(0);
 const state=useRef({start,end,loop,rate});state.current={start,end,loop,rate};
 const valid=Number.isFinite(start)&&Number.isFinite(end)&&end-start>=.1999&&start>=0&&end<=maxTime;
 const positionCallback=useRef(onPosition);positionCallback.current=onPosition;
 const active=useRef(false),seeking=useRef(false),pending=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 function stop(){active.current=false;clearTimeout(pending.current);pending.current=undefined;player.current?.pauseVideo?.();setPlaying(false);}
 function begin(){
  clearTimeout(pending.current);pending.current=undefined;
  const p=player.current,s=state.current;if(!p||!ready||!valid)return;
  active.current=true;seeking.current=true;p.seekTo(s.start,true);p.setPlaybackRate(s.rate);p.playVideo();setCount(v=>v+1);
 }
 useEffect(()=>{
  let disposed=false;setReady(false);
  loadPlayer().then(()=>{
   if(disposed||!slot.current)return;
   const div=document.createElement('div');slot.current.replaceChildren(div);
   player.current=new window.YT.Player(div,{width:'100%',height:'100%',videoId:clip.sourceId,playerVars:{origin:location.origin,playsinline:1,rel:0},events:{
    onReady:()=>{if(disposed)return;setReady(true);setRates(player.current.getAvailablePlaybackRates());player.current.cueVideoById({videoId:clip.sourceId,startSeconds:state.current.start});},
    onStateChange:(ev:any)=>{if(disposed)return;setPlaying(ev.data===1);if(ev.data===1)active.current=true;},
    onAutoplayBlocked:()=>{if(!disposed)setError('브라우저가 자동 재생을 막았어요. 영상의 재생 버튼을 한 번 눌러주세요.');},
    onError:()=>{if(!disposed){active.current=false;setError('이 영상은 앱에서 재생할 수 없어요. 아래 원본 링크로 확인해주세요.');}}
   }});
  }).catch(e=>{if(!disposed)setError(e.message);});
  const tick=setInterval(()=>{
   const p=player.current,s=state.current;
   if(p?.getCurrentTime)positionCallback.current(p.getCurrentTime(),p.getPlayerState?.()===1);
   if(!active.current||!p?.getPlayerState||pending.current)return;
   if(seeking.current){if(p.getCurrentTime()<s.end)seeking.current=false;else return;}
   if((p.getPlayerState()===1&&p.getCurrentTime()>=s.end)||p.getPlayerState()===0){
    p.pauseVideo();setPlaying(false);
    if(s.loop){pending.current=setTimeout(()=>{pending.current=undefined;if(disposed||!active.current)return;seeking.current=true;p.seekTo(state.current.start,true);p.setPlaybackRate(state.current.rate);p.playVideo();setCount(v=>v+1);},700);}
    else active.current=false;
   }
  },60);
  return()=>{disposed=true;active.current=false;clearInterval(tick);clearTimeout(pending.current);player.current?.destroy();player.current=null;};
 },[clip.sourceId]);
 useEffect(()=>{stop();setCount(0);},[clip.id,start,end]);
 useEffect(()=>{if(ready&&playRequest>0)begin();},[ready,playRequest]);
 useEffect(()=>{if(!loop){clearTimeout(pending.current);pending.current=undefined;}},[loop]);
 return <section className="lab-player">
  <div className="video-slot" ref={slot}/>
  <div className="lab-transport"><button className="primary-button" disabled={!ready||!valid} onClick={()=>playing||pending.current?stop():begin()}>{playing?<Pause size={17}/>:<Play size={17}/>} {playing?'멈추기':'선택 구간 듣기'}</button><button className="secondary-button" disabled={!ready||!valid} onClick={begin}><RotateCcw size={16}/> 처음부터</button>
   <label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/> 반복 · 0.7초 쉬기</label>
   <select aria-label="재생 속도" value={rate} onChange={e=>{setRate(Number(e.target.value));player.current?.setPlaybackRate(Number(e.target.value));}}>{rates.map(r=><option key={r} value={r}>{r}배속</option>)}</select>
  </div>
  <div className="lab-boundary"><span>{time(start)} – {time(end)} · 재생 요청 {count}회</span><button disabled={!ready} onClick={()=>onBoundary('start',player.current.getCurrentTime())}>현재 위치를 시작으로</button><button disabled={!ready} onClick={()=>onBoundary('end',player.current.getCurrentTime())}>현재 위치를 끝으로</button></div>
  {error&&<p role="alert" className="inline-error">{error}</p>}
  {!valid&&<p role="alert" className="inline-error">자막이 있는 영상 범위 안에서, 시작과 끝을 0.2초 이상 간격으로 입력해주세요.</p>}
  <a className="text-link" href={`https://www.youtube.com/watch?v=${clip.sourceId}&t=${Math.floor(start)}s`} target="_blank" rel="noreferrer">YouTube 원본 열기</a>
 </section>;
}

export default function SoundLab({sources,activeSource,ai}:{sources:Source[];activeSource?:string;ai:boolean}){
 const [clips,setClips]=useState<Clip[]>([]),[notes,setNotes]=useState<Note[]>([]),[selected,setSelected]=useState(''),[source,setSource]=useState(activeSource||''),[loaded,setLoaded]=useState(false);
 const [start,setStart]=useState(0),[end,setEnd]=useState(1),[target,setTarget]=useState(''),[heard,setHeard]=useState(''),[feedback,setFeedback]=useState(''),[reheard,setReheard]=useState('');
 const [show,setShow]=useState(false),[search,setSearch]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[promptVisible,setPromptVisible]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [mode,setMode]=useState<'chunk'|'sentence'|'paragraph'|'word'>('sentence'),[playRequest,setPlayRequest]=useState(0);
 const [position,setPosition]=useState({time:0,playing:false}),[anchor,setAnchor]=useState<{clip:Clip;word:Word}|null>(null);
 const [selection,setSelection]=useState<{start:number;end:number}|null>(null);
 const sourceClips=clips.filter(c=>c.sourceId===source);
 const displayedClips=mode==='paragraph'?paragraphClips(sourceClips):sourceClips;
 const maxTime=Math.max(1,...sourceClips.map(c=>c.end));
 const changing=useRef(false);
 const clip=clips.find(c=>c.id===selected);
 const activeCaption=clip&&position.time>=clip.start&&position.time<clip.end?clip:sourceClips.find(c=>c.start>=start&&position.time>=c.start&&position.time<c.end);
 const activeUnit=activeCaption?clipUnits(activeCaption,mode).find(u=>position.time>=u.start&&position.time<u.end):undefined;
 const revision=sources.map(s=>s.id+':'+s.status+':'+s.revision).join('|');
 useEffect(()=>{let alive=true;request('').then(v=>{if(alive){setClips(v.clips);setNotes(v.notes);setLoaded(true);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[revision]);
 useEffect(()=>{let alive=true;request('').then(v=>{if(!alive)return;setClips(v.clips);setNotes(v.notes);setLoaded(true);const first=v.clips.find((c:Clip)=>c.sourceId===source);if(first){let n=v.notes.find((n:Note)=>n.exerciseId===first.id);try{const raw=localStorage.getItem('sound-draft:'+first.id);if(raw){n=JSON.parse(raw);setDirty(true);}}catch{}setSelected(first.id);setStart(n?.start??first.start);setEnd(n?.end??first.end);setTarget(n?.target??'');setHeard(n?.heard??'');setFeedback(n?.feedback??'');setReheard(n?.reheard??'');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const data={exerciseId:selected,start,end,target,heard,feedback,reheard};
 useEffect(()=>{if(!dirty||!selected)return;try{localStorage.setItem('sound-draft:'+selected,JSON.stringify(data));}catch{setError('임시 기록을 보관하지 못했어요. 메뉴 이동 전에 저장해주세요.');}},[selected,start,end,target,heard,feedback,reheard,dirty]);
 async function save(){const saved=await request('/notes',data);setNotes(n=>[...n.filter(x=>x.exerciseId!==selected),saved]);try{localStorage.removeItem('sound-draft:'+selected);}catch{}setDirty(false);setStatus('이 구간의 기록을 저장했어요.');return saved;}
 async function choose(c:Clip,range={start:c.start,end:c.end},text=c.text){
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
   setPosition({time:range.start,playing:false});setDirty(true);setStatus('선택한 부분을 재생합니다. 변경한 구간은 노트와 함께 저장할 수 있어요.');setError('');setAnchor(null);setPlayRequest(v=>v+1);
  }catch(e){setError((e as Error).message);}finally{changing.current=false;setBusy(false);}
 }
 function wordClick(c:Clip,word:Word){
  if(!anchor){setAnchor({clip:c,word});return;}
  const range=selectedRange(anchor.word,word);
  const first=anchor.word.start<=word.start?anchor.clip:c;
  const text=first.id===c.id&&anchor.clip.id===c.id?wordsFor(c).filter(w=>w.start>=range.start&&w.end<=range.end).map(w=>w.text).join(' '):sourceClips.filter(c=>c.end>range.start&&c.start<range.end).flatMap(c=>wordsFor(c).filter(w=>w.start>=range.start&&w.end<=range.end).map(w=>w.text)).join(' ');
  void choose(first,range,text);
 }
 function edit(action:()=>void){action();setDirty(true);setStatus('아직 저장하지 않은 변경이 있어요.');}
 function boundary(which:'start'|'end',v:number){if(!clip)return;v=Math.round(v*10)/10;if(v<0||v>maxTime||(which==='start'?end-v:v-start)<.2){setError('자막이 있는 영상 범위 안에서 시작이 끝보다 0.2초 이상 앞서도록 맞춰주세요.');return;}edit(()=>which==='start'?setStart(v):setEnd(v));setError('');}
 const prompt=clip?`영어 듣기 피드백을 한국어로 해주세요. 문법·번역보다 소리를 식별하는 연습이 목적입니다.
영상: https://www.youtube.com/watch?v=${clip.sourceId}&t=${Math.floor(start)}s
선택 시간: ${start}초 ~ ${end}초 (내가 조정한 구간이며 정확한 음성 경계는 미검증)
주변 자막(오류 가능): ${clip.text}
집중할 영어 구절: ${target||'아직 특정하지 못함 — 문맥에서 임의로 확정하지 말아주세요.'}
처음 내 귀에 들린 소리: ${heard||'(아직 기록하지 않음)'}
이전 피드백: ${feedback||'없음'}
다시 듣고 들린 소리: ${reheard||'아직 없음'}
원음을 직접 확인하지 않았다면 들었다고 하지 말고, 자막과 내 한글 표기에 근거한 발음 가설임을 밝혀주세요. 한글 표기는 정확한 발음 기호가 아니라 내 청각 인상의 기록입니다. 어떤 단어 경계·연결·약화·강세 때문에 그렇게 들릴 수 있는지 가능한 설명 1~2개와 불확실성을 알려주세요. 필요하면 혀·입술·성대 움직임을 설명하고, 다음 재청취에서 확인할 소리 단서 하나를 주세요. 내 발음 점수나 실제 화자의 발음을 확정하지 말아주세요.`:'';
 return <div className="sound-lab"><div className="page-heading"><h1>내 귀에는 이렇게 들렸어요.</h1><p>짧게 반복하고, 들린 소리를 적고, 피드백을 참고해 다시 들어보세요.</p></div>
  <div className="lab-source"><label htmlFor="lab-source">연습할 영상</label><select id="lab-source" value={source} disabled={busy} onChange={async e=>{const next=e.target.value;try{if(dirty)await save();setSource(next);setSelected('');setSearch('');setAnchor(null);setSelection(null);setPlayRequest(0);}catch(x){setError((x as Error).message);}}}><option value="">영상 선택</option>{sources.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <p role="status">{sources.find(s=>s.id===source)?.message}</p>
  {source&&<button className="secondary-button" disabled={busy||['fetching','analyzing'].includes(sources.find(s=>s.id===source)?.status||'')} onClick={async()=>{try{const r=await fetch('/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:`https://www.youtube.com/watch?v=${source}`})});if(!r.ok)throw new Error('준비 요청에 실패했어요.');setStatus('자막과 AI 분석 준비를 요청했어요.');}catch(e){setError((e as Error).message);}}}>자막·AI 분석 준비</button>}
  <div className="lab-layout"><div className="lab-listen">
   {clip?<><LoopPlayer key={clip.sourceId} clip={clip} start={start} end={end} onBoundary={boundary} maxTime={maxTime} playRequest={playRequest} onPosition={(time,playing)=>setPosition(p=>Math.abs(p.time-time)>.08||p.playing!==playing?{time,playing}:p)}/><div className="lab-now"><b>{position.playing?'재생 중':'현재 위치'} {time(position.time)}</b><span>{position.playing?activeUnit?.text||target||clip.text:target||clip.text}</span><small>단어·청크·문장 위치는 자막 시간 기반 추정</small></div>
    <section className="lab-range"><h2>안 들리는 만큼만 잘라 듣기</h2><p>문장이나 청크의 시작·끝을 직접 맞추세요. 자막 구간이 문장 경계와 같지는 않아요.</p><div className="lab-range-inputs"><label>시작 (초)<input type="number" step="0.1" min={0} max={end-.2} value={Number.isFinite(start)?start:''} onChange={e=>edit(()=>setStart(e.target.valueAsNumber))}/></label><label>끝 (초)<input type="number" step="0.1" min={start+.2} max={maxTime} value={Number.isFinite(end)?end:''} onChange={e=>edit(()=>setEnd(e.target.valueAsNumber))}/></label><button className="secondary-button" onClick={()=>edit(()=>{setStart(clip.start);setEnd(clip.end);})}>자막 구간으로 복원</button></div><small>선택한 부분의 소리가 잘리면 시작·끝을 0.1초씩 조정하세요. 단어 시간은 추정이며 YouTube 탐색에도 오차가 있을 수 있어요.</small></section>
   </>:<div className="lab-empty"><h2>오른쪽 자막을 누르면 바로 재생됩니다.</h2><p>자막 목록에서 찾은 뒤, 실제 소리를 들으며 문장이나 청크의 범위를 조정할 수 있어요.</p></div>}
  </div><section className="lab-clips lab-captions" aria-label="자막 선택">
   <div className="section-heading"><h2>자막을 눌러 바로 듣기</h2><span>{sourceClips.length}개 구간</span></div>
   <div className="lab-modes" aria-label="선택 단위">{([['chunk','청크'],['sentence','문장'],['paragraph','문단'],['word','단어 범위']] as const).map(([value,label])=><button key={value} aria-pressed={mode===value} onClick={()=>{setMode(value);setAnchor(null);}}>{label}</button>)}</div>
   {mode==='paragraph'&&!displayedClips.length&&<p>AI 분석이 완료되면 의미에 따라 묶은 문단을 선택할 수 있어요.</p>}
   {mode==='chunk'&&sourceClips.some(c=>!c.chunks)&&<p>아직 AI 청크 분석이 없는 구간은 규칙으로 나눈 임시 청크입니다.</p>}
   <p className="lab-timing-note">{mode==='word'?'시작 단어 → 마지막 단어를 누르면 두 단어를 포함해 재생합니다.':`${mode==='paragraph'?'문단':mode==='chunk'?'청크':'문장'}을 누르면 해당 범위를 바로 재생합니다.`}<br/>{sourceClips.some(c=>c.sentenceStatus==='runtime-ai')?'앱에서 AI가 전체 자막을 분석한 결과입니다.':sourceClips.some(c=>c.sentenceStatus==='ai-reviewed')?'기존에 저장한 문장 분석입니다. 새 AI 청크·문단 분석은 별도로 준비하세요.':'AI 분석 전 자료입니다. 자막 경계를 실제 문장 경계로 확정하지 않습니다.'} 원본 자막의 오류는 남아 있을 수 있으며, 재생 시간은 추정입니다.</p>
   {anchor&&<div className="lab-anchor" role="status">시작: “{anchor.word.text}” · 마지막 단어를 선택하세요.<button onClick={()=>setAnchor(null)}>선택 취소</button></div>}
   <input aria-label="자막 검색" placeholder="찾고 싶은 영어 단어로 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
   <div className="lab-caption-scroll">{displayedClips.filter(c=>c.text.toLowerCase().includes(search.toLowerCase())).map(c=>{
    const words=wordsFor(c);const current=position.playing&&position.time>=c.start&&position.time<c.end;
    return <article key={c.id} className={'lab-caption '+(c.id===selected?'selected ':'')+(current?'is-current':'')}>
     <button className="lab-caption-time" disabled={busy} onClick={()=>void choose(c)} aria-label={`${time(c.start)} 자막 전체 재생`}>{time(c.start)} – {time(c.end)} <Play size={12}/>{notes.some(n=>n.exerciseId===c.id)&&<small>기록 있음</small>}</button>
     <div className="lab-units" lang="en">{mode==='word'?words.map(w=>{
      const now=current&&position.time>=w.start&&position.time<w.end;
      const chosen=selection&&w.start>=selection.start&&w.end<=selection.end;
      return <button key={w.index} disabled={busy} aria-label={`${w.text} (${time(w.start)}) 단어`} aria-pressed={!!chosen} aria-current={now?'true':undefined} className={(now?'speaking ':'')+(chosen?'range-selected ':'')+(anchor?.clip.id===c.id&&anchor.word.index===w.index?'anchor-word':'')} onClick={()=>wordClick(c,w)}>{w.text}</button>;
     }):clipUnits(c,mode).map((u,i)=>{
      const now=current&&position.time>=u.start&&position.time<u.end;
      const chosen=selection&&Math.abs(u.start-selection.start)<.01&&Math.abs(u.end-selection.end)<.01;
      return <button key={i} disabled={busy} className={(now?'speaking ':'')+(chosen?'range-selected':'')} aria-current={now?'true':undefined} aria-pressed={!!chosen} onClick={()=>void choose(c,u,u.text)}><span>{u.text}</span>{mode==='sentence'&&(c.sentenceStatus==='candidate'||(!c.sentenceStatus&&u.candidate))&&<small>경계 미확인 · 임시 구간</small>}</button>;
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
