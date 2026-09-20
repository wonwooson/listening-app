import test from 'node:test';
import assert from 'node:assert/strict';
import {groupHistory} from '../src/historyGroups.ts';
const stamp=(y,m,d,h=12)=>new Date(y,m-1,d,h).toISOString();
const leaves=groups=>groups.flatMap(g=>g.children?leaves(g.children):g.items);
test('month/week/day archive preserves all records and sorts newest first without mutating input',()=>{
 const records=[{id:'old',at:stamp(2026,8,31)},{id:'new',at:stamp(2026,9,20)},{id:'same',at:stamp(2026,9,20,9)}];
 const groups=groupHistory(records,new Date(2026,8,20));
 assert.deepEqual(groups.map(g=>g.id),['2026-09','2026-08']);
 assert.deepEqual(leaves(groups).map(n=>n.id),['new','same','old']);
 assert.equal(groups.reduce((sum,g)=>sum+g.count,0),3);
 assert.deepEqual(records.map(n=>n.id),['old','new','same']);
});
test('only this month, this Monday-based week and today open by default',()=>{
 const groups=groupHistory([20,19,13].map(d=>({at:stamp(2026,9,d)})).concat({at:stamp(2026,8,30)}),new Date(2026,8,20));
 assert.equal(groups[0].current,true);assert.equal(groups[1].current,false);
 assert.equal(groups[0].children[0].label,'9/14–9/20');
 assert.equal(groups[0].children[0].current,true);assert.equal(groups[0].children[1].current,false);
 assert.deepEqual(groups[0].children[0].children.map(g=>g.current),[true,false]);
});
test('weeks crossing months and years stay within each month with no duplicates',()=>{
 const records=[{at:stamp(2026,1,1)},{at:stamp(2025,12,31)},{at:stamp(2026,9,1)},{at:stamp(2026,8,31)}];
 const groups=groupHistory(records,new Date(2026,0,1));
 assert.deepEqual(groups.map(g=>g.children[0].label),['9/1–9/6','8/31–8/31','1/1–1/4','12/29–12/31']);
 assert.equal(leaves(groups).length,4);
});
test('missing or invalid dates remain accessible after the dated months',()=>{
 const records=[{id:'missing'},{id:'invalid',at:'not a date'},{id:'valid',at:stamp(2026,9,20)}];
 const groups=groupHistory(records);
 assert.equal(groups.at(-1).id,'undated');assert.equal(groups.at(-1).count,2);
 assert.equal(leaves(groups).length,3);assert.deepEqual(groupHistory([]),[]);
});
test('local midnight determines the day and leap days are retained',()=>{
 const records=[{at:stamp(2024,2,29,23)},{at:stamp(2024,3,1,0)}];
 const groups=groupHistory(records,new Date(2024,2,1));
 assert.equal(groups[0].children[0].children[0].id,'2024-03-01');
 assert.equal(groups[1].children[0].children[0].id,'2024-02-29');
});
