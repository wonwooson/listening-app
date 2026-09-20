import test from 'node:test';
import assert from 'node:assert/strict';
import {swipeMode} from '../src/mobileGestures.ts';
test('vertical scroll, diagonal movement and short taps do not switch the caption mode',()=>{
 for(const [x,y] of [[0,200],[70,100],[59,0],[-40,-5]])assert.equal(swipeMode('sentence',x,y),null);
});
test('left and right swipes traverse chunk, sentence, paragraph and word without wrapping',()=>{
 assert.equal(swipeMode('chunk',-100,10),'sentence');
 assert.equal(swipeMode('sentence',-100,10),'paragraph');
 assert.equal(swipeMode('paragraph',-100,10),'word');
 assert.equal(swipeMode('word',100,-10),'paragraph');
 assert.equal(swipeMode('paragraph',100,-10),'sentence');
 assert.equal(swipeMode('sentence',100,-10),'chunk');
 assert.equal(swipeMode('chunk',100,0),'chunk');
 assert.equal(swipeMode('word',-100,0),'word');
});
