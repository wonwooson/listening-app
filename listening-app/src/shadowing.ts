// Chunking and phrasing drills. Every step below is built from the stored chunk boundaries, so it is rule-based,
// not an acoustic analysis. No intonation curve is drawn, because nothing here has listened to the audio.
export type ShadowChunk={text:string;start:number;end:number;first:number;last:number};
export type ShadowMode='backward'|'forward'|'echo';
export type ShadowStep={label:string;text:string;start:number;end:number;chunkCount:number;repeat:number};

export const SPEED_LADDER=[.75,.85,1];
export const MODE_LABELS:Record<ShadowMode,string>={backward:'거꾸로 쌓기',forward:'앞으로 누적',echo:'따라 말하기'};
export const MODE_HINTS:Record<ShadowMode,string>={
 backward:'문장의 마지막 덩어리부터 앞으로 붙여 갑니다. 끝부분의 리듬이 무너지지 않게 잡아줍니다.',
 forward:'첫 덩어리부터 하나씩 더해 갑니다. 실제로 듣는 순서대로 이해하는 연습입니다.',
 echo:'덩어리를 듣고, 같은 길이만큼 비워 둔 사이에 따라 말합니다.'};

const span=(chunks:ShadowChunk[],from:number,to:number)=>({
 text:chunks.slice(from,to+1).map(c=>c.text).join(' '),
 start:chunks[from].start,end:chunks[to].end,chunkCount:to-from+1});

// Last chunk first, then growing leftwards: "...the parts" → "to align the parts" → the whole sentence.
export function backwardBuildup(chunks:ShadowChunk[],repeat=1):ShadowStep[]{
 return chunks.map((_,i)=>{
  const from=chunks.length-1-i;
  return {label:`뒤에서 ${i+1}덩어리`,repeat,...span(chunks,from,chunks.length-1)};
 });
}

// First chunk first, then growing rightwards: the order a listener actually meets the sentence in.
export function forwardAccumulation(chunks:ShadowChunk[],repeat=1):ShadowStep[]{
 return chunks.map((_,i)=>({label:`앞에서 ${i+1}덩어리`,repeat,...span(chunks,0,i)}));
}

export function echoSteps(chunks:ShadowChunk[],repeat=1):ShadowStep[]{
 return chunks.map((c,i)=>({label:`${i+1}번째 덩어리`,repeat,text:c.text,start:c.start,end:c.end,chunkCount:1}));
}

// The silence after a chunk matches the chunk itself, so there is room to say it back at the same speed.
export function echoGapMs(step:{start:number;end:number},rate=1,minimum=600,maximum=4000){
 const spoken=(step.end-step.start)*1000/Math.max(.25,rate);
 return Math.round(Math.min(maximum,Math.max(minimum,spoken)));
}

export function drillSteps(chunks:ShadowChunk[],mode:ShadowMode,repeat=1):ShadowStep[]{
 if(!chunks.length)return [];
 if(mode==='backward')return backwardBuildup(chunks,repeat);
 if(mode==='forward')return forwardAccumulation(chunks,repeat);
 return echoSteps(chunks,repeat);
}

export function nextRate(rate:number){
 const index=SPEED_LADDER.findIndex(v=>Math.abs(v-rate)<.001);
 return SPEED_LADDER[Math.min(SPEED_LADDER.length-1,(index<0?0:index)+1)];
}

// Sentences the learner marked as hard are heard twice; the rest once.
export function repeatsFor(marked:boolean){return marked?2:1;}
