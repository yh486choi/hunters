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
    orderName:'수정 중인 오더', currentName:'기존 오더',
    currentSavedAt:'2026-09-19T10:00:00.000Z', draft
  });
  const restored = loadDraft(storage);
  assert.equal(restored.orderName, '수정 중인 오더');
  assert.equal(restored.currentName, '기존 오더');
  assert.equal(restored.currentSavedAt, '2026-09-19T10:00:00.000Z');
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
