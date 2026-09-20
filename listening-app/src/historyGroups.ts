export type DatedRecord={at?:string};
export type DateGroup<T>={id:string;label:string;count:number;current:boolean;children?:DateGroup<T>[];items?:T[]};
const pad=(n:number)=>String(n).padStart(2,'0');
const monthKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const dayKey=(d:Date)=>`${monthKey(d)}-${pad(d.getDate())}`;
function monday(d:Date){const result=new Date(d.getFullYear(),d.getMonth(),d.getDate());result.setDate(result.getDate()-(result.getDay()+6)%7);return result;}
const shortDate=(d:Date)=>`${d.getMonth()+1}/${d.getDate()}`;
export function groupHistory<T extends DatedRecord>(records:T[],now=new Date()):DateGroup<T>[]{
 const months=new Map<string,DateGroup<T>>(),weeks=new Map<string,DateGroup<T>>(),days=new Map<string,DateGroup<T>>();
 const unknown:T[]=[];
 const dated=records.map(item=>({item,date:new Date(item.at||'')})).sort((a,b)=>(Number.isFinite(b.date.getTime())?b.date.getTime():-Infinity)-(Number.isFinite(a.date.getTime())?a.date.getTime():-Infinity));
 for(const {item,date} of dated){
  if(!Number.isFinite(date.getTime())){unknown.push(item);continue;}
  const monthId=monthKey(date),weekStart=monday(date),weekId=`${monthId}/${dayKey(weekStart)}`,dayId=dayKey(date);
  let month=months.get(monthId);
  if(!month){month={id:monthId,label:`${date.getFullYear()}년 ${date.getMonth()+1}월`,count:0,current:monthId===monthKey(now),children:[]};months.set(monthId,month);}
  month.count++;
  let week=weeks.get(weekId);
  if(!week){
   const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);
   const start=new Date(Math.max(weekStart.getTime(),new Date(date.getFullYear(),date.getMonth(),1).getTime()));
   const end=new Date(Math.min(weekEnd.getTime(),new Date(date.getFullYear(),date.getMonth()+1,0).getTime()));
   week={id:weekId,label:`${shortDate(start)}–${shortDate(end)}`,count:0,current:dayKey(weekStart)===dayKey(monday(now)),children:[]};weeks.set(weekId,week);month.children!.push(week);
  }
  week.count++;
  let day=days.get(dayId);
  if(!day){day={id:dayId,label:date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'}),count:0,current:dayId===dayKey(now),items:[]};days.set(dayId,day);week.children!.push(day);}
  day.count++;day.items!.push(item);
 }
 const result=[...months.values()];
 if(unknown.length)result.push({id:'undated',label:'날짜 없는 기록',count:unknown.length,current:false,items:unknown});
 return result;
}
