import {useId,useState} from 'react';
import type {ReactNode} from 'react';
import {ChevronDown,ChevronRight} from 'lucide-react';
import {groupHistory} from './historyGroups';
import type {DatedRecord,DateGroup} from './historyGroups';
export default function DateArchive<T extends DatedRecord>({records,renderItem,expandMatches=false}:{records:T[];renderItem:(item:T,index:number)=>ReactNode;expandMatches?:boolean}){
 const groups=groupHistory(records),prefix=useId();
 const [open,setOpen]=useState<Record<string,boolean>>({});
 function setAll(value:boolean){const next:Record<string,boolean>={};function walk(nodes:DateGroup<T>[]){for(const n of nodes){next[n.id]=value;if(n.children)walk(n.children);}}walk(groups);setOpen(next);}
 function renderGroup(group:DateGroup<T>,depth:number):ReactNode{
  const expanded=open[group.id]??(expandMatches||group.current),id=prefix+'-'+group.id;
  return <div className={`archive-group archive-level-${depth}`} key={group.id}>
   <button type="button" className="archive-heading" aria-expanded={expanded} aria-controls={id} onClick={()=>setOpen(v=>({...v,[group.id]:!expanded}))}>
    {expanded?<ChevronDown size={16}/>:<ChevronRight size={16}/>}<span>{group.label}</span>{group.current&&<em>{['이번 달','이번 주','오늘'][depth]}</em>}<small>{group.count}개</small>
   </button>
   {expanded&&<div id={id} className="archive-content">{group.children?group.children.map(g=>renderGroup(g,depth+1)):group.items?.map(renderItem)}</div>}
  </div>;
 }
 return <div className="date-archive"><div className="archive-tools"><small>월 → 주 → 일 · 월요일 시작 · 기기 시간 기준</small><button type="button" onClick={()=>setAll(false)}>모두 접기</button><button type="button" onClick={()=>setAll(true)}>모두 펼치기</button></div>{groups.map(g=>renderGroup(g,0))}</div>;
}
