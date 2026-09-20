import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, addPlayer, assignPosition } from '../js/order-model.js';
import { DRAFT_KEY, saveDraft, loadDraft, clearDraft } from '../js/draft-store.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

test('unfinished order and original edit target survive a reload', () => {
  const storage = memoryStorage();
  const draft = assignPosition(addPlayer(createOrder(), { name:'김민수', num:'7' }), 'SS', '김민수');
  saveDraft(storage, {
    game:{date:'2026-09-20',time:'12:00',opponent:'상대팀'}, currentId:'game-id',
    currentVersion:'version-one', draft
  });
  const restored = loadDraft(storage);
  assert.deepEqual(restored.game,{date:'2026-09-20',time:'12:00',opponent:'상대팀'});
  assert.equal(restored.currentId, 'game-id');
  assert.equal(restored.currentVersion, 'version-one');
  assert.equal(restored.draft.positions.SS, '김민수');
  clearDraft(storage);
  assert.equal(loadDraft(storage), null);
});

test('corrupt and incompatible drafts are ignored', () => {
  const storage = memoryStorage();
  storage.setItem(DRAFT_KEY, '{broken');
  assert.equal(loadDraft(storage), null);
  storage.setItem(DRAFT_KEY, JSON.stringify({ version:2, payload:{} }));
  assert.equal(loadDraft(storage), null);
  storage.setItem(DRAFT_KEY, JSON.stringify({ version:1, orderName:'', currentName:'', currentSavedAt:'',
    payload:{players:[{name:'김민수'}], positions:{SS:'없는 선수'}, startingList:[]} }));
  assert.equal(loadDraft(storage), null);
});

test('old drafts preserve the lineup and version for safe migration',()=>{
  const storage=memoryStorage();
  storage.setItem(DRAFT_KEY,JSON.stringify({version:1,orderName:'old title',currentName:'NBL_260915_레퍼즈',currentSavedAt:'original-version',payload:{players:[],positions:{},startingList:[]}}));
  const restored=loadDraft(storage);
  assert.equal(restored.legacyName,'NBL_260915_레퍼즈');
  assert.equal(restored.currentVersion,'original-version');
  assert.equal(restored.draft.startingList.length,10);
});
