export type PlaybackSample={time:number;wall:number;playing:boolean;rate:number};
// Allow elapsed playback (including background timer delays), detect a seek in either direction.
export function jumped(previous:PlaybackSample|null,current:PlaybackSample){
 if(!previous)return false;
 const elapsed=Math.max(0,(current.wall-previous.wall)/1000);
 const expected=previous.playing?elapsed*Math.max(previous.rate,current.rate):0;
 const delta=current.time-previous.time;
 return delta<-.35||delta>expected+.75;
}
