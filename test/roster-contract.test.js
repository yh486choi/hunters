import test from 'node:test';
import assert from 'node:assert/strict';
import roster from '../firebase/functions-v2/roster-contract.js';

const player = { name:'김민수', num:'07', p:'2', c:'0', '1b':'0',
  '2b':'0', '3b':'0', ss:'1', of:'0', throws:'R', bats:'L' };

test('roster replacement rejects empty, duplicate, and invalid position data', () => {
  assert.match(roster.validatePlayers([]), /비어/);
  assert.match(roster.validatePlayers([player,{ ...player, name:' 김민수 ' }]), /중복/);
  assert.match(roster.validatePlayers([{ ...player, p:'3' }]), /포지션/);
  assert.equal(roster.validatePlayers([player]), '');
});

test('roster replacement uses one atomic batch and clears trailing cells', () => {
  const requests = roster.buildRosterRequests({
    sheetId:7, gridProperties:{ rowCount:10, columnCount:11 }
  },[player]);
  assert.equal(requests.length,1);
  const update = requests[0].updateCells;
  assert.deepEqual(update.range,{sheetId:7,startRowIndex:0,endRowIndex:10,
    startColumnIndex:0,endColumnIndex:11});
  assert.equal(update.fields,'userEnteredValue');
  assert.equal(update.rows.length,2);
  assert.equal(update.rows[1].values[1].userEnteredValue.stringValue,'07');
});

test('roster replacement expands a small sheet in the same batch', () => {
  const requests = roster.buildRosterRequests({
    sheetId:7, gridProperties:{ rowCount:1, columnCount:4 }
  },[player]);
  assert.deepEqual(requests.slice(0,2),[
    {appendDimension:{sheetId:7,dimension:'ROWS',length:1}},
    {appendDimension:{sheetId:7,dimension:'COLUMNS',length:7}}
  ]);
  assert.equal(requests[2].updateCells.range.endRowIndex,2);
});
