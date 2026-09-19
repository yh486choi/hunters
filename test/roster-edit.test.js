import test from 'node:test';
import assert from 'node:assert/strict';
import edit from '../firebase/functions-v2/roster-edit.js';
const current = [{name:'A',num:'1'},{name:'B',num:'2'}];
const payload = {players:current,positions:{P:'A',C:'B'},startingList:[{name:'A',pos:'P'}],excludedPlayers:['B']};
const orders = [['game','timestamp',JSON.stringify(payload)]];
test('batch name swaps update every order reference without merging identities',() => {
  const changes = edit.prepareEdit(current,current,[{name:'B'},{name:'A'}],['A','B'],orders);
  assert.equal(changes.length,1);
  assert.deepEqual(changes[0].payload,{players:[{name:'B',num:'1'},{name:'A',num:'2'}],positions:{P:'B',C:'A'},startingList:[{name:'B',pos:'P'}],excludedPlayers:['A']});
});
test('rejects stale snapshots and duplicate original identities',() => {
  assert.throws(() => edit.prepareEdit(current,[{name:'A'}],current,['A','B'],orders),/목록이 변경/);
  assert.throws(() => edit.prepareEdit(current,current,current,['A','A'],orders),/중복/);
});
test('in-use deletions reject entire batch; unused deletions and additions work',() => {
  assert.throws(() => edit.prepareEdit(current,current,[{name:'A'}],['A'],orders),/삭제할 수 없습니다/);
  assert.deepEqual(edit.prepareEdit(current,current,[{name:'C'}],[null],[]),[]);
});
test('handedness is included in snapshot and ability blanks normalize to zero',() => {
  assert.throws(() => edit.prepareEdit([{name:'A',throws:'R'}],[{name:'A',throws:'L'}],[{name:'A'}],['A'],[]),/목록이 변경/);
  assert.deepEqual(edit.prepareEdit([{name:'A',p:''}],[{name:'A',p:'0'}],[{name:'A'}],['A'],[]),[]);
});
