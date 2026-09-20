export type TimedClip={id:string;sourceId:string;start:number;end:number;text:string;words?:{text:string;start:number;end:number}[]};
export type Word={text:string;start:number;end:number;index:number};
export type Unit={text:string;start:number;end:number;first:number;last:number;candidate:boolean};

// No acoustic alignment is available. Every derived boundary is an estimate.
export function wordsFor(clip:TimedClip):Word[]{
 if(clip.words?.length)return clip.words.map((w,index)=>({...w,index}));
 const tokens=clip.text.trim().split(/\s+/).filter(Boolean);
 const weights=tokens.map(t=>Math.max(2,t.replace(/[^\p{L}\p{N}]/gu,'').length));
 const total=weights.reduce((a,b)=>a+b,0);let elapsed=0;
 return tokens.map((text,index)=>{const start=clip.start+(clip.end-clip.start)*elapsed/total;elapsed+=weights[index];return {text,index,start,end:index===tokens.length-1?clip.end:clip.start+(clip.end-clip.start)*elapsed/total};});
}
export function unitsFor(words:Word[],mode:'chunk'|'sentence'):Unit[]{
 const result:Unit[]=[];let first=0;
 const push=(last:number,candidate:boolean)=>{result.push({text:words.slice(first,last+1).map(w=>w.text).join(' '),first,last,start:words[first].start,end:words[last].end,candidate});first=last+1;};
 for(let i=0;i<words.length;i++){
  const terminal=/[.!?]["'”’)]*$/.test(words[i].text)&&!/^\d+\.$/.test(words[i].text)&&! /^(Mr|Mrs|Ms|Dr|Prof|vs|etc)\.$/i.test(words[i].text);
  const count=i-first+1;
  const phraseBreak=/[,;:]["'”’)]*$/.test(words[i].text)||/^(and|but|because|when|if|which|that|where|while|so|what|from)$/i.test(words[i+1]?.text||'');
  if(terminal||(mode==='chunk'&&((count>=3&&phraseBreak)||count>=6))||i===words.length-1)push(i,mode==='chunk'||!terminal);
 }
 return result;
}
export function selectedRange(a:Word,b:Word){return {start:Math.min(a.start,b.start),end:Math.max(a.end,b.end)};}

// Half-open intervals choose the next unit at a shared boundary; gaps choose the next spoken unit.
export function unitAt<T extends {start:number;end:number}>(units:T[],time:number):T|undefined{
 return units.find(u=>u.start<=time&&time<u.end)??units.find(u=>u.start>time)??units[units.length-1];
}

// Keep a continuous remembered phrase in one marker, including its spaces.
export function highlightRuns(words:Word[],range:{start:number;end:number}|null){
 const runs:{text:string;highlighted:boolean}[]=[];
 for(const word of words){
  const highlighted=!!range&&word.end>range.start+.001&&word.start<range.end-.001;
  const last=runs[runs.length-1];
  if(last&&last.highlighted===highlighted)last.text+=' '+word.text;
  else runs.push({text:word.text,highlighted});
 }
 return runs;
}

export function transitionMemory(
 from:'chunk'|'sentence'|'paragraph'|'word',to:typeof from,
 listened:{start:number;end:number}|null,previous:{start:number;end:number}|null
){
 if(from===to)return previous;
 if((from==='chunk'&&to==='sentence')||(from==='sentence'&&to==='paragraph'))return listened;
 return null;
}
