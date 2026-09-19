import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../firebase/functions-v2/order-contract.js';
import { createOrder, toPayload, assignPosition } from '../js/order-model.js';

const players = [
  { name:'김민수', num:'7' }, { name:'박철수', num:'12' }, { name:'이영희', num:'18' }
];
const original = toPayload(createOrder({
  players,
  positions:{ SS:'김민수', '2B':'박철수', P:'이영희' },
  startingList:[{ name:'김민수' },{ name:'박철수' },...Array(7).fill({ name:'' }),{ name:'이영희' }]
}));

test('v2 endpoint accepts the client model before and after a position swap', () => {
  assert.equal(contract.validatePayload(original),'');
  assert.equal(contract.validatePayload(toPayload(assignPosition(createOrder(original),'2B','김민수'))),'');
});

test('v2 endpoint rejects malformed or contradictory order data', () => {
  assert.match(contract.validatePayload({}),/형식/);
  assert.match(contract.validatePayload({ ...original, startingList:[] }),/10행/);
  assert.match(contract.validatePayload({ ...original, positions:{ ...original.positions, SS:'없는선수' } }),/포지션/);
  const wrongPitcher = structuredClone(original);
  wrongPitcher.startingList[9].name = '박철수';
  assert.match(contract.validatePayload(wrongPitcher),/투수/);
});

test('save target requires an unchanged version before overwriting', () => {
  const rows = [['첫 경기','2026-09-19T10:00:00.000Z','{}']];
  assert.deepEqual(contract.resolveSaveTarget(rows,'새 경기',null),{ rowNumber:-1 });
  assert.deepEqual(contract.resolveSaveTarget(rows,'첫 경기',rows[0][1]),{ rowNumber:2 });
  assert.match(contract.resolveSaveTarget(rows,'첫 경기',null).error,/변경/);
  assert.match(contract.resolveSaveTarget(rows,'첫 경기','2026-09-19T09:00:00.000Z').error,/변경/);
  assert.match(contract.resolveSaveTarget(rows,'새 경기','2026-09-19T10:00:00.000Z').error,/삭제/);
});

test('v2 accepts only the P and DH two-way assignment', () => {
  const twoWay = structuredClone(original);
  twoWay.positions.DH = '이영희';
  assert.equal(contract.validatePayload(twoWay), '');
  twoWay.positions.SS = '이영희';
  assert.match(contract.validatePayload(twoWay), /중복/);
});
