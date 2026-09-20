import test from 'node:test';
import assert from 'node:assert/strict';
import games from '../firebase/functions-v2/game-contract.js';
import {scheduleText} from '../js/game-meta.js';
import edit from '../firebase/functions-v2/roster-edit.js';
test('legacy records recover dates/opponents but never invent times',()=>{
  assert.deepEqual(games.legacyGame('NBL_260304_Overflow'),{date:'2026-03-04',time:'',opponent:'Overflow'});
  assert.deepEqual(games.legacyGame('26-04-12 유신리그 vs 다발라스'),{date:'2026-04-12',time:'',opponent:'다발라스'});
  assert.deepEqual(games.legacyGame('free text'),{date:'',time:'',opponent:''});
});
test('date/time validation and weekday formatting are timezone independent',()=>{
  const valid={date:'2026-09-20',time:'12:00',opponent:'상대팀'};
  assert.equal(games.validateGame(valid),'');
  assert.equal(scheduleText(valid),'2026-09-20 (일) 12:00');
  for(const game of [{...valid,date:'2026-02-30'},{...valid,time:'24:00'},{...valid,time:'12:05'},{...valid,time:'23:59'},{...valid,time:''},{...valid,opponent:' '}])assert.ok(games.validateGame(game));
  assert.equal(games.validateGame({...valid,time:'00:00'}),'');assert.equal(games.validateGame({...valid,time:'23:50'}),'');
});
test('IDs survive schedule edits and old identifiers round-trip without display fields',()=>{
  for(const key of ['NBL_260304_Overflow',games.newId()])assert.equal(games.toKey(games.toId(key)),key);
  const game={date:'2026-09-20',time:'12:00',opponent:'상대팀'};
  const result=games.record(['NBL_260304_Overflow','revision',JSON.stringify({game})]);
  assert.deepEqual(result.game,game);assert.equal(result.orderName,undefined);assert.equal(result.savedAt,undefined);
  assert.throws(()=>games.toKey('bad-id'));
});
test('bulk player rename preserves game metadata',()=>{
  const game={date:'2026-09-20',time:'12:00',opponent:'상대팀'},players=[{name:'A'}];
  const changes=edit.prepareEdit(players,players,[{name:'B'}],['A'],[['id','version',JSON.stringify({game,players})]]);
  assert.deepEqual(changes[0].payload.game,game);
});
