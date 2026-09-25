import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause} from 'lucide-react';
import {jumped} from './playback';
import type {PlaybackSample} from './playback';
import type {Unit} from './transcript';

// Moved out of SoundLab unchanged so every listening screen shares one range player and one API loader.
export type Clip={id:string;sourceId:string;start:number;end:number;text:string;sentenceStatus?:'edited'|'ai-reviewed'|'original'|'candidate'|'runtime-ai';words?:{text:string;start:number;end:number}[];chunks?:Unit[];paragraphId?:string};
export type PlayKind='range'|'once'|'continuous'|'loop';
export type TransportMode='stopped'|'loop'|'continuous'|'once';
export type PlayerControls={setMode:(mode:'loop'|'continuous')=>void;stop:()=>void;engaged:()=>boolean;snapshot:()=>{time:number;playing:boolean;continuous:boolean};finishAt:(end:number)=>void};

let loading:Promise<void>|undefined;
export function loadPlayer(){return loading??=new Promise<void>((resolve,reject)=>{
 if(window.YT?.Player){resolve();return;}
 const prior=window.onYouTubeIframeAPIReady;
 window.onYouTubeIframeAPIReady=()=>{prior?.();resolve();};
 const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>{loading=undefined;reject(new Error('영상 플레이어 연결 실패. 페이지를 새로고침해주세요.'));};document.head.appendChild(s);
});}

export default function LoopPlayer({clip,start,end,playRequest,playKind,controls,onPosition,maxTime,currentUnitEnd,gapMs=700}:{clip:Clip;start:number;end:number;playRequest:number;playKind:PlayKind;controls:React.MutableRefObject<PlayerControls|null>;maxTime:number;currentUnitEnd:(time:number)=>number;gapMs?:number;onPosition:(time:number,playing:boolean,continuous:boolean,moved:boolean,rangeEnd:number,transport:TransportMode)=>void}){
 const slot=useRef<HTMLDivElement>(null),player=useRef<any>(null);
 const [ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false),[rate,setRate]=useState(1),[rates,setRates]=useState<number[]>([1]),[error,setError]=useState('');
 const [continuous,setContinuous]=useState(true);
 const continuousRef=useRef(true),sample=useRef<PlaybackSample|null>(null);
 const state=useRef({start,end,loop,rate,gapMs});state.current={start,end,loop,rate,gapMs};
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
  stopAt.current=null;if(kind!=='range'){setLoop(kind==='loop');state.current.loop=kind==='loop';}continuousRef.current=kind==='continuous';setContinuous(kind==='continuous');sample.current=null;active.current=kind!=='continuous';seeking.current=true;p.seekTo(s.start,true);p.setPlaybackRate(s.rate);p.playVideo();
 }
 function toggleMode(){
  const p=player.current;if(!p||!ready)return;
  const next=!continuousRef.current;
  clearTimeout(pending.current);pending.current=undefined;setLoop(false);state.current.loop=false;
  continuousRef.current=next;setContinuous(next);
  stopAt.current=next?null:currentUnitEnd(p.getCurrentTime());
  active.current=!next;seeking.current=false;sample.current=null;
  p.playVideo();
 }
 controls.current={setMode:mode=>{
  const p=player.current;if(!p||!ready)return;
  if(mode==='loop'){begin('loop');return;}
  clearTimeout(pending.current);pending.current=undefined;
  stopAt.current=null;active.current=false;seeking.current=false;sample.current=null;
  setLoop(false);state.current.loop=false;continuousRef.current=true;setContinuous(true);
  p.playVideo();
 },stop,engaged:()=>seeking.current||active.current||!!pending.current||[1,3].includes(player.current?.getPlayerState?.()),snapshot:()=>({time:player.current?.getCurrentTime?.()??start,playing:player.current?.getPlayerState?.()===1,continuous:continuousRef.current}),finishAt:(boundary)=>{
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
   positionCallback.current(now.time,now.playing,continuousRef.current,moved,stopAt.current??s.end,(seeking.current||active.current||pending.current||[1,3].includes(p.getPlayerState()))?(continuousRef.current?'continuous':s.loop?'loop':'once'):'stopped');
   if(seeking.current){if(now.time<s.end){seeking.current=false;sample.current=now;}else return;}
   if(!active.current||pending.current)return;
   if((p.getPlayerState()===1&&p.getCurrentTime()>=(stopAt.current??s.end))||p.getPlayerState()===0){
    p.pauseVideo();setPlaying(false);
    if(s.loop&&stopAt.current===null){pending.current=setTimeout(()=>{pending.current=undefined;if(disposed||!active.current)return;sample.current=null;seeking.current=true;p.seekTo(state.current.start,true);p.setPlaybackRate(state.current.rate);p.playVideo();},Math.max(0,state.current.gapMs));}
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
   <label><input type="checkbox" checked={loop} onChange={e=>{setLoop(e.target.checked);if(e.target.checked)begin();}}/> 반복 · {(gapMs/1000).toFixed(1)}초 쉬기</label>
   <select aria-label="재생 속도" value={rate} onChange={e=>{setRate(Number(e.target.value));player.current?.setPlaybackRate(Number(e.target.value));}}>{rates.map(r=><option key={r} value={r}>{r}배속</option>)}</select>
   <button type="button" className={"lab-mode-badge"+(continuous?" is-continuous":"")} aria-pressed={continuous} disabled={!ready} onClick={toggleMode} title={continuous?"현재 구간 끝까지 듣고 멈추기":"현재 위치부터 계속 이어 듣기"}>{continuous?"계속 이어 듣기":loop?"구간 반복":"구간 한 번 듣기"}</button>
   <button className="primary-button" disabled={!ready||!valid} onClick={()=>playing||pending.current?stop():begin()}>{playing?<Pause size={17}/>:<Play size={17}/>} {playing?'멈추기':'선택 구간 듣기'}</button>
  </div>
  {error&&<p role="alert" className="inline-error">{error}</p>}
  {!valid&&<p role="alert" className="inline-error">오른쪽 자막에서 재생할 구간을 다시 선택해주세요.</p>}
  <a className="text-link" href={`https://www.youtube.com/watch?v=${clip.sourceId}&t=${Math.floor(start)}s`} target="_blank" rel="noreferrer">YouTube 원본 열기</a>
 </section>;
}
