import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder } from '../js/order-model.js';
import { renderOrderImage } from '../js/capture.js';

test('share image contains the order, field positions, lineup and excluded waiting player', async () => {
  const drawn = [];
  const context = {
    beginPath() {}, roundRect() {}, fill() {}, fillRect() {}, save() {}, clip() {},
    drawImage() { drawn.push('field'); }, restore() {},
    fillText(value) { drawn.push(String(value)); },
    measureText(value) { return { width:String(value).length * 15 }; }
  };
  const canvas = { width:0, height:0, getContext:() => context };
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  globalThis.document = { createElement:tag => tag === 'canvas' ? canvas : null };
  globalThis.Image = class { set src(_) { queueMicrotask(() => this.onload()); } };
  try {
    const state = createOrder({
      players:[{name:'김민수',num:'7'},{name:'박철수',num:'12'},{name:'최준호',num:'25'}],
      positions:{SS:'김민수',P:'박철수'},
      startingList:[{name:'김민수'},...Array.from({length:8},() => ({name:''})),{name:'박철수'}],
      excludedPlayers:['최준호']
    });
    const result = await renderOrderImage(state,'연습 경기');
    assert.equal(result,canvas);
    assert.equal(canvas.width,1080);
    assert.equal(canvas.height,1920);
    for (const expected of ['연습 경기','field','SS','김민수','박철수  #12','대기 명단','최준호  #25']) {
      assert.ok(drawn.includes(expected),`${expected} missing`);
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.Image = originalImage;
  }
});
