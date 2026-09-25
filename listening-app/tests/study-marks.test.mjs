import test from 'node:test';
import assert from 'node:assert/strict';
import {markKey,overlaps,marksForStep,markAt,wordsInRange,compareSteps,STEP_REASONS,REASON_LABELS} from '../src/studyMarks.ts';

const mark=(step,start,end,reason='unheard')=>({sessionId:'s1',step,start,end,scope:'sentence',reason});

test('the key is derived from time so re-marking the same part overwrites',()=>{
 assert.equal(markKey('s1',1,12.34,15.6),markKey('s1',1,12.3404,15.5996));
 assert.notEqual(markKey('s1',1,12.34,15.6),markKey('s1',7,12.34,15.6));
 assert.notEqual(markKey('s1',1,12.34,15.6),markKey('s2',1,12.34,15.6));
 assert.equal(markKey('s1',4,0,3.2),'study-mark:s1:4:0-3200');
});

test('marks are found by exact range and listed per step in time order',()=>{
 const marks=[mark(1,30,33),mark(1,10,12),mark(7,10,12)];
 assert.deepEqual(marksForStep(marks,1).map(m=>m.start),[10,30]);
 assert.ok(markAt(marks,7,{start:10,end:12}));
 assert.equal(markAt(marks,7,{start:10,end:13}),undefined);
 assert.equal(markAt(marks,4,{start:10,end:12}),undefined);
});

test('word indices come from time overlap, not stored numbers',()=>{
 const words=[{text:'We',start:0,end:1},{text:"haven't",start:1,end:2},{text:'confirmed',start:2,end:3}];
 assert.deepEqual(wordsInRange(words,{start:1,end:3}),{first:1,last:2});
 assert.deepEqual(wordsInRange(words,{start:0,end:3}),{first:0,last:2});
 assert.equal(wordsInRange(words,{start:9,end:10}),null);
 assert.equal(overlaps({start:0,end:1},{start:1,end:2}),false);
});

test('the last listen is compared with the first by overlap, and only once it is finished',()=>{
 const marks=[mark(1,10,12),mark(1,30,33),mark(1,50,52),mark(7,31,32),mark(7,80,82)];
 assert.deepEqual(compareSteps(marks,true),{before:3,remaining:1,resolved:2,added:1,comparable:true});
 assert.deepEqual(compareSteps([],true),{before:0,remaining:0,resolved:0,added:0,comparable:true});
 // Silence before the last listen is done is not evidence of hearing anything.
 assert.deepEqual(compareSteps(marks,false),{before:3,remaining:3,resolved:0,added:0,comparable:false});
 assert.deepEqual(compareSteps([mark(1,10,12)],true),{before:1,remaining:0,resolved:1,added:0,comparable:true});
});

test('each step offers only the reasons that make sense there',()=>{
 assert.deepEqual(STEP_REASONS[1],['unheard']);
 assert.deepEqual(STEP_REASONS[7],['unheard']);
 assert.ok(STEP_REASONS[4].includes('linking')&&STEP_REASONS[4].includes('stress'));
 for(const step of Object.keys(STEP_REASONS))
  for(const reason of STEP_REASONS[step]) assert.ok(REASON_LABELS[reason]);
});
