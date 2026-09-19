import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrder, toPayload, validateOrder, assignPosition, setBattingPlayer,
  setExcluded, removePlayer, waitingPlayers
} from '../js/order-model.js';

const sample = {
  players: [
    { name: '김민수', num: '7' }, { name: '박철수', num: '12' },
    { name: '이영희', num: '18' }, { name: '최준호', num: '25' }
  ],
  positions: { CF: '', LF: '', RF: '', SS: '김민수', '2B': '박철수', '3B': '', '1B': '', P: '이영희', C: '', DH: '' },
  startingList: [
    { name: '김민수', pos: '유격수(SS)' }, { name: '박철수', pos: '2루수(2B)' },
    ...Array.from({ length: 7 }, () => ({ name: '', pos: '' })),
    { name: '이영희', pos: '투수(P)' }
  ],
  excludedPlayers: ['최준호']
};

test('legacy payload loads and saves with the same shape', () => {
  const state = createOrder(sample);
  assert.deepEqual(toPayload(state), sample);
  assert.deepEqual(validateOrder(state), []);
});

test('occupied positions swap for two batting players', () => {
  const state = assignPosition(createOrder(sample), '2B', '김민수');
  assert.equal(state.positions.SS, '박철수');
  assert.equal(state.positions['2B'], '김민수');
  assert.equal(state.startingList[0].pos, '2루수(2B)');
  assert.equal(state.startingList[1].pos, '유격수(SS)');
  assert.deepEqual(validateOrder(state), []);
});

test('bench player replaces the occupant in the batting order', () => {
  const state = assignPosition(createOrder(sample), 'SS', '최준호');
  assert.equal(state.positions.SS, '최준호');
  assert.equal(state.startingList[0].name, '최준호');
  assert.deepEqual(state.excludedPlayers, []);
  assert.deepEqual(validateOrder(state), []);
});

test('batting swap preserves positions and pitcher row', () => {
  const state = setBattingPlayer(createOrder(sample), 0, '박철수');
  assert.deepEqual(state.startingList.slice(0, 2).map(row => row.name), ['박철수', '김민수']);
  assert.equal(state.startingList[9].name, '이영희');
  assert.deepEqual(validateOrder(state), []);
});

test('pitcher replacement updates the dedicated row', () => {
  const state = assignPosition(createOrder(sample), 'P', '최준호');
  assert.equal(state.startingList[9].name, '최준호');
  assert.equal(state.startingList[9].pos, '투수(P)');
  assert.deepEqual(validateOrder(state), []);
});

test('excluded waiting player survives serialization, then removal clears references', () => {
  const state = createOrder(sample);
  assert.deepEqual(waitingPlayers(state).map(p => p.name), ['최준호']);
  assert.deepEqual(toPayload(setExcluded(state, '최준호', false)).excludedPlayers, []);
  const removed = removePlayer(state, '최준호');
  assert.deepEqual(removed.excludedPlayers, []);
  assert.deepEqual(validateOrder(removed), []);
});

test('older payload without excluded players or all positions loads', () => {
  const state = createOrder({ players: sample.players, positions: { SS: '김민수' }, startingList: [{ name: '김민수' }] });
  assert.equal(state.positions.CF, '');
  assert.equal(state.startingList.length, 10);
  assert.deepEqual(state.excludedPlayers, []);
  assert.deepEqual(validateOrder(state), []);
});

test('pitcher can bat as DH and later hand DH to another player', () => {
  let state = assignPosition(createOrder(sample), 'DH', '이영희');
  assert.equal(state.positions.P, '이영희');
  assert.equal(state.positions.DH, '이영희');
  state = setBattingPlayer(state, 2, '이영희');
  assert.equal(state.startingList[2].pos, '지명타자(DH)');
  assert.deepEqual(validateOrder(state), []);
  state = setBattingPlayer(state, 2, '최준호');
  assert.equal(state.positions.P, '이영희');
  assert.equal(state.positions.DH, '최준호');
  assert.deepEqual(validateOrder(state), []);
});
