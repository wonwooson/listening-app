// Range picking for the step-by-step study flow. Times come from caption estimates, never audio alignment.
export type StudyClip={id:string;start:number;end:number;text:string;paragraphId?:string};
export type RangeBoundary='paragraph'|'sentence'|'end';
export type StudyRange={minutes:number;start:number;end:number;firstClipId:string;lastClipId:string;
 seconds:number;sentenceCount:number;paragraphCount:number;boundary:RangeBoundary};

export const RANGE_MINUTES=[3,6,10,20];
const NEAR=.25;

function paragraphEnd(clips:StudyClip[],index:number){
 const here=clips[index]?.paragraphId,next=clips[index+1]?.paragraphId;
 return !!here&&here!==next;
}

function build(clips:StudyClip[],first:number,last:number,minutes:number,boundary:RangeBoundary):StudyRange{
 const span=clips.slice(first,last+1);
 const paragraphs=new Set(span.map(c=>c.paragraphId).filter(Boolean));
 return {minutes,start:span[0].start,end:span[span.length-1].end,firstClipId:span[0].id,
  lastClipId:span[span.length-1].id,seconds:span[span.length-1].end-span[0].start,
  sentenceCount:span.length,paragraphCount:paragraphs.size,boundary};
}

// A range always ends on a whole sentence, and prefers a paragraph end close to the requested length.
export function rangeFor(clips:StudyClip[],startIndex:number,minutes:number):StudyRange|null{
 if(!clips.length||startIndex<0||startIndex>=clips.length)return null;
 const target=clips[startIndex].start+minutes*60;
 const tolerance=minutes*60*NEAR;
 let sentence=clips.length-1,paragraph=-1;
 for(let i=startIndex;i<clips.length;i++){
  if(Math.abs(clips[i].end-target)<Math.abs(clips[sentence].end-target))sentence=i;
  if(paragraphEnd(clips,i)&&Math.abs(clips[i].end-target)<=tolerance
    &&(paragraph<0||Math.abs(clips[i].end-target)<Math.abs(clips[paragraph].end-target)))paragraph=i;
 }
 const last=paragraph>=0?paragraph:sentence;
 return build(clips,startIndex,last,minutes,
  last===clips.length-1?'end':paragraph>=0?'paragraph':'sentence');
}

export function rangeOptions(clips:StudyClip[],startIndex=0):StudyRange[]{
 return RANGE_MINUTES.map(m=>rangeFor(clips,startIndex,m)).filter((r):r is StudyRange=>!!r);
}

// Where "이어서 다음 구간" starts: the first sentence that begins after the previous range.
export function nextStartIndex(clips:StudyClip[],previousEnd:number){
 const index=clips.findIndex(c=>c.start>=previousEnd-.001);
 return index<0?-1:index;
}

export function clipsInRange(clips:StudyClip[],range:{start:number;end:number}){
 return clips.filter(c=>c.end>range.start+.001&&c.start<range.end-.001);
}
