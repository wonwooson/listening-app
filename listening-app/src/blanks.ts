export type ClozeWord={text:string;start:number;end:number};
export type ClozeChunk={text:string;start:number;end:number;first:number;last:number};
export type ClozeState='open'|'correct'|'wrong'|'skipped';
export type ClozeItem={id:string;clipId:string|null;goal:string;start:number;end:number;masked:string;
 maskIndex:number|null;paragraphId:string|null;words:ClozeWord[];chunks:ClozeChunk[];state:ClozeState};

// A blank run carries only the trailing punctuation that follows the hidden word.
export function maskedRuns(words:ClozeWord[],maskIndex:number|null):{text:string;blank:boolean}[]{
 const runs:{text:string;blank:boolean}[]=[];
 words.forEach((word,index)=>{
  if(index===maskIndex){runs.push({text:word.text.match(/[.?!…]+$/)?.[0]??'',blank:true});return;}
  const last=runs[runs.length-1];
  if(last&&!last.blank)last.text+=' '+word.text; else runs.push({text:word.text,blank:false});
 });
 return runs;
}

export function clozeProgress(items:ClozeItem[]){
 const count=(state:ClozeState)=>items.filter(i=>i.state===state).length;
 const correct=count('correct'),wrong=count('wrong');
 return {total:items.length,correct,wrong,answered:correct+wrong,skipped:count('skipped'),open:count('open')};
}

export function nextUnanswered(items:ClozeItem[]):ClozeItem|undefined{
 return items.find(i=>i.state==='open')??items.find(i=>i.state==='skipped');
}

export function chunkFor(chunks:ClozeChunk[],maskIndex:number|null):ClozeChunk|undefined{
 return maskIndex===null?undefined:chunks.find(c=>c.first<=maskIndex&&maskIndex<=c.last);
}

// Word times are interpolated inside caption intervals, so a single word is never cut exactly.
export function wordWindow(words:ClozeWord[],maskIndex:number,pad=.35,minimum=1){
 const word=words[maskIndex],first=words[0],last=words[words.length-1];
 let start=Math.max(first.start,word.start-pad),end=Math.min(last.end,word.end+pad);
 if(end-start<minimum){
  const middle=(word.start+word.end)/2;
  start=Math.max(first.start,middle-minimum/2);
  end=Math.min(last.end,Math.max(start+minimum,end));
  start=Math.max(first.start,Math.min(start,end-minimum));
 }
 return {start,end,precision:'estimate' as const};
}
