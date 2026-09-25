import test from 'node:test';
import assert from 'node:assert/strict';
import {maskedRuns,clozeProgress,nextUnanswered,chunkFor,wordWindow} from '../src/blanks.ts';

const words=["We","haven't","confirmed","the","cause","yet."].map((text,i)=>({text,start:i,end:i+1}));
const item=(id,state,goal='polarity')=>({id,clipId:id,goal,start:0,end:6,masked:'',maskIndex:1,
 paragraphId:'p0',words,chunks:[],state});

test('the blank hides only the chosen word and keeps its punctuation',()=>{
 assert.deepEqual(maskedRuns(words,1),[
  {text:'We',blank:false},{text:'',blank:true},{text:'confirmed the cause yet.',blank:false}]);
 assert.deepEqual(maskedRuns(words,0),[{text:'',blank:true},{text:"haven't confirmed the cause yet.",blank:false}]);
 assert.deepEqual(maskedRuns(words,5),[{text:"We haven't confirmed the cause",blank:false},{text:'.',blank:true}]);
 assert.deepEqual(maskedRuns(words,null),[{text:"We haven't confirmed the cause yet.",blank:false}]);
});

test('progress counts answers, wrong answers and skips separately',()=>{
 const items=[item('a','correct'),item('b','wrong'),item('c','skipped'),item('d','open')];
 assert.deepEqual(clozeProgress(items),{total:4,correct:1,wrong:1,answered:2,skipped:1,open:1});
 assert.deepEqual(clozeProgress([]),{total:0,correct:0,wrong:0,answered:0,skipped:0,open:0});
});

test('resume prefers the first unanswered sentence, then skipped ones',()=>{
 assert.equal(nextUnanswered([item('a','correct'),item('b','skipped'),item('c','open')]).id,'c');
 assert.equal(nextUnanswered([item('a','correct'),item('b','skipped')]).id,'b');
 assert.equal(nextUnanswered([item('a','correct'),item('b','wrong')]),undefined);
});

test('the chunk around the blank comes from the stored analysis',()=>{
 const chunks=[{text:"We haven't",start:0,end:2,first:0,last:1},{text:'confirmed the cause yet.',start:2,end:6,first:2,last:5}];
 assert.equal(chunkFor(chunks,1).text,"We haven't");
 assert.equal(chunkFor(chunks,4).text,'confirmed the cause yet.');
 assert.equal(chunkFor(chunks,null),undefined);
 assert.equal(chunkFor([],1),undefined);
});

test('the word window is padded, stays inside the sentence and is labelled an estimate',()=>{
 const middle=wordWindow(words,2);
 assert.equal(middle.precision,'estimate');
 assert.ok(Math.abs(middle.start-1.65)<1e-9&&Math.abs(middle.end-3.35)<1e-9);
 const first=wordWindow(words,0);
 assert.equal(first.start,0);
 assert.ok(first.end<=words[words.length-1].end);
 const last=wordWindow(words,5);
 assert.equal(last.end,6);
 const short=[{text:'No.',start:10,end:10.2}];
 const clamped=wordWindow(short,0);
 assert.equal(clamped.start,10);
 assert.equal(clamped.end,10.2);
 assert.ok(wordWindow(words,3).end-wordWindow(words,3).start>=1);
});

test('adding a listening target needs no change here',()=>{
 const extra=[item('a','open','emphasis'),item('b','correct','pattern')];
 assert.deepEqual(clozeProgress(extra),{total:2,correct:1,wrong:0,answered:1,skipped:0,open:1});
 assert.equal(nextUnanswered(extra).goal,'emphasis');
});
