import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeFor,rangeOptions,nextStartIndex,clipsInRange,RANGE_MINUTES} from '../src/studyRange.ts';

// One sentence every 20s; a paragraph every 9 sentences (180s).
const clips=Array.from({length:60},(_,i)=>({id:'v:rev:'+i,start:i*20,end:i*20+20,
 text:'sentence '+i,paragraphId:'v:rev:p'+Math.floor(i/9)}));

test('a range ends on a whole sentence and prefers a nearby paragraph end',()=>{
 const six=rangeFor(clips,0,6);
 assert.equal(six.boundary,'paragraph');
 assert.equal(six.end,clips.find(c=>c.paragraphId!==clips[clips.indexOf(c)+1]?.paragraphId&&c.end>300).end);
 assert.equal(six.end%20,0);
 assert.equal(six.start,0);
 assert.ok(Math.abs(six.seconds-360)<=360*.25);
 assert.equal(six.sentenceCount,clipsInRange(clips,six).length);
});

test('every offered length starts where asked and counts its own sentences and paragraphs',()=>{
 const options=rangeOptions(clips,9);
 assert.deepEqual(options.map(o=>o.minutes),RANGE_MINUTES);
 for(const option of options){
  assert.equal(option.start,clips[9].start);
  assert.equal(option.firstClipId,clips[9].id);
  assert.ok(option.end>option.start);
  assert.equal(option.sentenceCount,clipsInRange(clips,option).length);
  assert.ok(option.paragraphCount>=1);
  assert.ok(clips.some(c=>c.end===option.end&&c.id===option.lastClipId));
 }
});

test('a request longer than the video stops at the last sentence',()=>{
 const twenty=rangeFor(clips,0,20);
 assert.equal(twenty.end,clips[clips.length-1].end);
 assert.equal(twenty.boundary,'end');
 const short=rangeFor(clips.slice(0,3),0,20);
 assert.equal(short.end,60);
 assert.equal(short.sentenceCount,3);
 assert.equal(short.boundary,'end');
});

test('without paragraph data it still ends on a sentence',()=>{
 const plain=clips.map(({paragraphId,...rest})=>rest);
 const range=rangeFor(plain,0,3);
 assert.equal(range.boundary,'sentence');
 assert.equal(range.paragraphCount,0);
 assert.ok(plain.some(c=>c.end===range.end));
 const single=rangeFor(clips.map(c=>({...c,paragraphId:'only'})),0,3);
 assert.equal(single.paragraphCount,1);
});

test('the next range starts after the previous one, and stops at the end',()=>{
 const first=rangeFor(clips,0,3);
 const index=nextStartIndex(clips,first.end);
 assert.ok(index>0);
 assert.ok(clips[index].start>=first.end);
 assert.equal(nextStartIndex(clips,clips[clips.length-1].end+1),-1);
 assert.equal(rangeFor(clips,-1,3),null);
 assert.equal(rangeFor([],0,3),null);
});
