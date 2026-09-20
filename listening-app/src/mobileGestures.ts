export type CaptionMode='chunk'|'sentence'|'paragraph'|'word';
export function swipeMode(mode:CaptionMode,dx:number,dy:number):CaptionMode|null{
 if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.6)return null;
 const modes:CaptionMode[]=['chunk','sentence','paragraph','word'];
 return modes[Math.max(0,Math.min(3,modes.indexOf(mode)+(dx<0?1:-1)))];
}
