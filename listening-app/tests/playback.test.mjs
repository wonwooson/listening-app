import test from 'node:test';
import assert from 'node:assert/strict';
import {jumped} from '../src/playback.ts';
const sample=(time,wall,playing=true,rate=1)=>({time,wall,playing,rate});
test('normal playback and delayed timers never look like user seeks',()=>{
 assert.equal(jumped(null,sample(60,0)),false);
 assert.equal(jumped(sample(10,0),sample(10.06,60)),false);
 assert.equal(jumped(sample(10,0),sample(30,20000)),false);
 assert.equal(jumped(sample(10,0,true,2),sample(10.12,60,true,2)),false);
 assert.equal(jumped(sample(10,0,true,1),sample(10.1,60,true,2)),false);
});
test('forward, backward and paused scrubbing release the old playback range',()=>{
 assert.equal(jumped(sample(10,0),sample(70,60)),true);
 assert.equal(jumped(sample(70,0),sample(10,60)),true);
 assert.equal(jumped(sample(10,0,false),sample(40,60,false)),true);
 assert.equal(jumped(sample(10,0,false),sample(10,5000,false)),false);
});
