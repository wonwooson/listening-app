import test from 'node:test';
import assert from 'node:assert/strict';
import {backwardBuildup,forwardAccumulation,echoSteps,echoGapMs,drillSteps,nextRate,repeatsFor,
 SPEED_LADDER,MODE_LABELS} from '../src/shadowing.ts';

// "We used a laser | to align | the parts."
const chunks=[{text:'We used a laser',start:0,end:4,first:0,last:3},
 {text:'to align',start:4,end:6,first:4,last:5},
 {text:'the parts.',start:6,end:8,first:6,last:7}];

test('backward buildup grows from the last chunk to the whole sentence',()=>{
 const steps=backwardBuildup(chunks);
 assert.deepEqual(steps.map(s=>s.text),
  ['the parts.','to align the parts.','We used a laser to align the parts.']);
 assert.deepEqual(steps.map(s=>[s.start,s.end]),[[6,8],[4,8],[0,8]]);
 assert.deepEqual(steps.map(s=>s.chunkCount),[1,2,3]);
 assert.equal(steps[steps.length-1].end,chunks[chunks.length-1].end);
});

test('forward accumulation grows in the order a listener hears it',()=>{
 const steps=forwardAccumulation(chunks);
 assert.deepEqual(steps.map(s=>s.text),
  ['We used a laser','We used a laser to align','We used a laser to align the parts.']);
 assert.deepEqual(steps.map(s=>[s.start,s.end]),[[0,4],[0,6],[0,8]]);
 assert.equal(steps[0].start,chunks[0].start);
});

test('echo practice walks one chunk at a time',()=>{
 const steps=echoSteps(chunks);
 assert.deepEqual(steps.map(s=>s.text),chunks.map(c=>c.text));
 assert.ok(steps.every(s=>s.chunkCount===1));
});

test('the silence matches the chunk, with a floor and a ceiling',()=>{
 assert.equal(echoGapMs({start:0,end:4}),4000);
 assert.equal(echoGapMs({start:0,end:2}),2000);
 // A very short chunk still leaves time to speak.
 assert.equal(echoGapMs({start:0,end:.2}),600);
 // A long one is capped so the drill never stalls.
 assert.equal(echoGapMs({start:0,end:30}),4000);
 // Slower playback means a longer sentence to repeat.
 assert.equal(echoGapMs({start:0,end:2},.75),2667);
});

test('every mode is offered, and an empty sentence yields nothing',()=>{
 for(const mode of ['backward','forward','echo']){
  assert.equal(drillSteps(chunks,mode).length,3);
  assert.ok(MODE_LABELS[mode]);
 }
 assert.deepEqual(drillSteps([],'backward'),[]);
 assert.deepEqual(drillSteps(chunks,'echo',2).map(s=>s.repeat),[2,2,2]);
});

test('the speed ladder only moves up and stops at normal speed',()=>{
 assert.deepEqual(SPEED_LADDER,[.75,.85,1]);
 assert.equal(nextRate(.75),.85);
 assert.equal(nextRate(.85),1);
 assert.equal(nextRate(1),1);
 assert.equal(nextRate(0.5),.85);
});

test('sentences the learner marked are heard twice',()=>{
 assert.equal(repeatsFor(true),2);
 assert.equal(repeatsFor(false),1);
});
