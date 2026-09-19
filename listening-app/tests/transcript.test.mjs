import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wordsFor,unitsFor,selectedRange} from '../src/transcript.ts';
const clip={id:'x',sourceId:'v',start:10,end:20,text:'What it does is focus the jet. Then it moves.'};
test('provided sentence word times survive punctuation and display projection',()=>{
 const words=[{text:'Hello,',start:0,end:.3},{text:"I'm",start:.3,end:.6},{text:'Gav.',start:.6,end:1}];
 const w=wordsFor({...clip,start:0,end:1,text:"Hello, I'm Gav.",words});
 assert.equal(w[1].start,.3);assert.equal(unitsFor(w,'sentence')[0].text,"Hello, I'm Gav.");
});
test('word estimates stay contiguous and inside caption bounds',()=>{
 const w=wordsFor(clip);assert.equal(w[0].start,10);assert.equal(w.at(-1).end,20);
 w.forEach((v,i)=>{assert.ok(v.end>v.start);if(i)assert.equal(v.start,w[i-1].end);});
});
test('sentences cover all words without dropping trailing text',()=>{
 const w=wordsFor(clip),s=unitsFor(w,'sentence');assert.equal(s.length,2);assert.equal(s[0].text,'What it does is focus the jet.');assert.equal(s[1].end,20);
 assert.equal(unitsFor(wordsFor({...clip,text:'no punctuation here'}),'sentence')[0].candidate,true);
 assert.deepEqual(unitsFor([],'sentence'),[]);
});
test('chunks cover every word and do not cross sentence endings',()=>{
 const w=wordsFor(clip),s=unitsFor(w,'chunk');assert.equal(s.map(v=>v.text).join(' '),clip.text);assert.ok(s.every(v=>v.last-v.first<6));
});
test('range includes both endpoints including backwards and across captions',()=>{
 const w=wordsFor(clip);assert.deepEqual(selectedRange(w[4],w[1]),{start:w[1].start,end:w[4].end});
 const other=wordsFor({...clip,start:21,end:30});assert.deepEqual(selectedRange(w[0],other[2]),{start:10,end:other[2].end});
});
