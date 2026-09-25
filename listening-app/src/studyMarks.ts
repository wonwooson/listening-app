// Marks the learner leaves in each step. Time is the identity; clip ids change whenever the analysis is re-run.
export type MarkReason='unheard'|'linking'|'stress'|'unknown-word';
export type MarkScope='sentence'|'words';
export type StudyMark={sessionId:string;step:number;start:number;end:number;scope:MarkScope;
 reason:MarkReason;clipId?:string|null;text?:string;wordFirst?:number|null;wordLast?:number|null;
 note?:string;at?:string};
export type TimedWord={text:string;start:number;end:number};

export const REASON_LABELS:Record<MarkReason,string>={'unheard':'안 들림','linking':'연음','stress':'강세','unknown-word':'생소한 단어'};
export const STEP_REASONS:Record<number,MarkReason[]>={1:['unheard'],3:['linking','stress','unknown-word'],
 4:['linking','stress'],6:['linking','stress'],7:['unheard']};

export function markKey(sessionId:string,step:number,start:number,end:number){
 return `study-mark:${sessionId}:${step}:${Math.round(start*1000)}-${Math.round(end*1000)}`;
}

export function overlaps(a:{start:number;end:number},b:{start:number;end:number}){
 return a.end>b.start+.001&&a.start<b.end-.001;
}

export function marksForStep(marks:StudyMark[],step:number){
 return marks.filter(m=>m.step===step).sort((a,b)=>a.start-b.start);
}

export function markAt(marks:StudyMark[],step:number,range:{start:number;end:number}){
 return marks.find(m=>m.step===step&&Math.round(m.start*1000)===Math.round(range.start*1000)
  &&Math.round(m.end*1000)===Math.round(range.end*1000));
}

// Word indices are recomputed from time, because a re-split sentence renumbers its words.
export function wordsInRange(words:TimedWord[],range:{start:number;end:number}){
 const inside=words.map((w,index)=>({w,index})).filter(({w})=>overlaps(w,range));
 return inside.length?{first:inside[0].index,last:inside[inside.length-1].index}:null;
}

// Did the parts missed in the first listen come through by the last one?
// An unfinished last listen has no marks yet, which must never be read as "heard it now".
export function compareSteps(marks:StudyMark[],done:boolean,from=1,to=7){
 const before=marksForStep(marks,from),after=marksForStep(marks,to);
 if(!done)return {before:before.length,remaining:before.length,resolved:0,added:0,comparable:false};
 const remaining=before.filter(b=>after.some(a=>overlaps(a,b)));
 return {before:before.length,remaining:remaining.length,resolved:before.length-remaining.length,
  added:after.filter(a=>!before.some(b=>overlaps(a,b))).length,comparable:true};
}
