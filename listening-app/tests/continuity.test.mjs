import test from 'node:test';
import assert from 'node:assert/strict';
import {unitAt,highlightRuns,wordsFor,transitionMemory} from '../src/transcript.ts';
import {readFileSync} from 'node:fs';
const baseline=JSON.parse(readFileSync(new URL('../../sync-baselines/2026-09-20_UVnck7nWaB4/analysis.json',import.meta.url),'utf8'));
test('confirmed baseline maps every chunk into its sentence and paragraph',()=>{
 for(const sentence of baseline.clips){
  const group=baseline.clips.filter(c=>c.paragraphId===sentence.paragraphId);
  for(const chunk of sentence.chunks){
   const time=(chunk.start+chunk.end)/2;
   assert.equal(unitAt(baseline.clips,time).id,sentence.id);
   assert.equal(unitAt(sentence.chunks,time),chunk);
   assert.ok(group[0].start<=time && time<group.at(-1).end);
  }
 }
});
test('boundary, silence, final position and empty lists resolve predictably',()=>{
 const units=[{start:1,end:2},{start:2,end:3},{start:4,end:5}];
 assert.equal(unitAt(units,2),units[1]);
 assert.equal(unitAt(units,3.5),units[2]);
 assert.equal(unitAt(units,5),units[2]);
 assert.equal(unitAt(units,0),units[0]);
 assert.equal(unitAt([],0),undefined);
});

test('a whole remembered phrase produces one marker with spaces, not word boxes',()=>{
 const words=wordsFor({start:0,end:6,text:"that's just a witnessing the whole thing."});
 const middle={start:words[1].start,end:words[5].end};
 const runs=highlightRuns(words,middle);
 assert.equal(runs.filter(r=>r.highlighted).length,1);
 assert.equal(runs.find(r=>r.highlighted).text,'just a witnessing the whole');
 assert.equal(runs.map(r=>r.text).join(' '),words.map(w=>w.text).join(' '));
 assert.deepEqual(highlightRuns(words,{start:0,end:6}),[{text:words.map(w=>w.text).join(' '),highlighted:true}]);
 assert.ok(highlightRuns(words,{start:7,end:8}).every(r=>!r.highlighted));
});

test('all baseline sentences retain every word when rendered as clickable chunks',()=>{
 for(const sentence of baseline.clips){
  const words=wordsFor(sentence);
  const rendered=sentence.chunks.flatMap(c=>words.filter(w=>w.end>c.start&&w.start<c.end));
  assert.deepEqual(rendered,words);
  for(const chunk of sentence.chunks){
   const runs=highlightRuns(words,chunk);
   assert.equal(runs.filter(r=>r.highlighted).length,1);
  }
 }
});

test('yellow memory requires listening and an upward chunk/sentence transition',()=>{
 const heard={start:2,end:4};
 assert.equal(transitionMemory('chunk','sentence',heard,null),heard);
 assert.equal(transitionMemory('sentence','paragraph',heard,null),heard);
 assert.equal(transitionMemory('chunk','sentence',null,null),null);
 assert.equal(transitionMemory('sentence','paragraph',null,null),null);
 for(const mode of ['chunk','sentence','word'])assert.equal(transitionMemory('paragraph',mode,heard,heard),null);
 assert.equal(transitionMemory('sentence','chunk',heard,heard),null);
 assert.equal(transitionMemory('chunk','paragraph',heard,heard),null);
 assert.equal(transitionMemory('paragraph','paragraph',heard,null),null);
 assert.equal(transitionMemory('sentence','sentence',heard,heard),heard);
});
