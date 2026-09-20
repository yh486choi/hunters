import { ABILITY_FIELDS, HAND_FIELDS, normalizeRoster } from './player-roster.js';

export function setupRosterEditor({ readApi, writeApi, status, writable, onSaved }) {
  const $ = id => document.getElementById(id);
  const fields = [['name','이름'],['num','배번'],...HAND_FIELDS,...ABILITY_FIELDS];
  let baseline = [], edits = [], loaded = false, busy = false;
  let sort = { field:'name', direction:1 };
  const changed = entry => !entry.original || fields.some(([key]) => entry.player[key] !== entry.original[key]);
  const dirty = () => edits.length !== baseline.length || edits.some(changed);
  function controls() {
    const deleted = baseline.filter(p => !edits.some(e => e.original?.name === p.name)).length;
    const modified = edits.filter(changed).length;
    $('rosterChanges').textContent = dirty() ? `변경 ${modified}명 · 삭제 ${deleted}명 — 전체 저장을 눌러 반영하세요.` : '표에서 직접 수정하세요. 열 제목을 누르면 정렬됩니다.';
    $('saveRosterButton').disabled = !loaded || !writable || busy || !dirty();
    $('resetRosterButton').disabled = busy;
    $('newPlayerButton').disabled = !loaded || !writable || busy;
    $('savePlayerButton').disabled = !loaded || !writable || busy;
  }
  function load(players) {
    baseline = normalizeRoster(players);
    edits = baseline.map(player => ({ original:player, player:{...player} }));
    loaded = true;
    onSaved(baseline);
    render();
  }
  function render() {
    const query = $('playerSearch').value.trim().toLowerCase();
    const visible = edits.filter(({player:p}) => p.name.toLowerCase().includes(query) || p.num.includes(query));
    visible.sort((a,b) => {
      const key = sort.field, av = a.player[key], bv = b.player[key];
      const numeric = key === 'num' || ABILITY_FIELDS.some(([field]) => field === key);
      const result = numeric ? Number(av || 0) - Number(bv || 0) : av.localeCompare(bv,'ko',{numeric:true});
      return (result || a.player.name.localeCompare(b.player.name,'ko')) * sort.direction;
    });
    const table = document.createElement('table'); table.className = 'player-admin-table roster-edit-table';
    const head = table.createTHead().insertRow();
    for (const [key,label] of fields) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.setAttribute('aria-sort',sort.field === key ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'table-sort-button';
      button.textContent = `${label} ${sort.field === key ? (sort.direction === 1 ? '▲' : '▼') : '↕'}`;
      button.addEventListener('click',() => { sort = {field:key,direction:sort.field === key ? -sort.direction : 1}; render(); });
      th.append(button); head.append(th);
    }
    const actionHead = document.createElement('th'); actionHead.textContent = '관리'; head.append(actionHead);
    const body = table.createTBody();
    for (const entry of visible) {
      const row = body.insertRow(); row.classList.toggle('modified',changed(entry));
      for (const [key,label] of fields) {
        const cell = row.insertCell();
        const input = document.createElement(key === 'name' || key === 'num' ? 'input' : 'select');
        input.setAttribute('aria-label',`${entry.original?.name || entry.player.name || '새 선수'} ${label}`);
        input.dataset.field = key;
        if (input.tagName === 'INPUT') { input.type = 'text'; input.maxLength = key === 'name' ? 40 : 20; }
        else {
          const options = HAND_FIELDS.some(([field]) => field === key) ? [['','-'],['R','우'],['L','좌']] : [['0','🔴 -'],['1','🟡 부'],['2','🟢 주']];
          options.forEach(([value,text]) => input.add(new Option(text,value)));
        }
        input.value = entry.player[key]; input.disabled = busy || !writable;
        input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change',() => {
          entry.player[key] = input.value;
          row.classList.toggle('modified',changed(entry)); controls();
        });
        cell.append(input);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button danger-button'; remove.textContent = '삭제'; remove.disabled = busy || !writable;
      remove.addEventListener('click',() => {
        if (!confirm(`${entry.player.name || '새 선수'} 선수를 삭제 목록에 넣을까요? 전체 저장 전에는 DB에 반영되지 않습니다.`)) return;
        edits = edits.filter(item => item !== entry); render();
      });
      row.insertCell().append(remove);
    }
    if (!visible.length) { const cell = body.insertRow().insertCell(); cell.colSpan = fields.length + 1; cell.textContent = loaded ? '표시할 선수가 없습니다.' : '선수 목록을 불러오는 중입니다.'; }
    $('playerList').replaceChildren(table); controls();
  }
  $('playerSearch').addEventListener('input',render);
  $('newPlayerButton').addEventListener('click',() => {
    $('playerForm').reset();
    for (const [id,group,options] of [
      ['playerAbilityFields',ABILITY_FIELDS,[['0','🔴 -'],['1','🟡 부'],['2','🟢 주']]],
      ['playerHandFields',HAND_FIELDS,[['','-'],['R','우'],['L','좌']]]
    ]) {
      $(id).replaceChildren();
      for (const [key,label] of group) {
        const wrapper = document.createElement('label'); wrapper.textContent = label;
        const select = document.createElement('select'); select.name = key;
        options.forEach(([value,text]) => select.add(new Option(text,value)));
        wrapper.append(select); $(id).append(wrapper);
      }
    }
    $('playerForm').hidden = false; $('editPlayerName').focus();
  });
  $('cancelPlayerButton').addEventListener('click',() => { $('playerForm').hidden = true; });
  $('playerForm').addEventListener('submit',event => {
    event.preventDefault();
    if (busy || !loaded) return;
    const player = {name:$('editPlayerName').value.trim(),num:$('editPlayerNumber').value.trim()};
    for (const [key] of [...ABILITY_FIELDS,...HAND_FIELDS]) player[key] = $('playerForm').elements.namedItem(key).value;
    try {
      normalizeRoster([...edits.map(e => e.player),player]);
      edits.push({original:null,player:normalizeRoster([player])[0]});
      $('playerSearch').value = ''; $('playerForm').hidden = true; render();
      status('목록에 추가했습니다. 전체 저장을 눌러 DB에 반영하세요.');
    } catch(error) { status(error.message,true); }
  });
  $('resetRosterButton').addEventListener('click',async () => {
    if (dirty() && !confirm('저장하지 않은 변경사항을 버리고 최신 선수 목록을 불러올까요?')) return;
    busy = true; render();
    try { load(await readApi('getPlayersV2')); $('playerForm').hidden = true; status('최신 선수 목록을 불러왔습니다.'); }
    catch(error) { status(error.message,true); }
    finally { busy = false; render(); }
  });
  $('saveRosterButton').addEventListener('click',async () => {
    if (busy || !dirty() || !loaded) return;
    let players;
    try { players = normalizeRoster(edits.map(e => e.player)); }
    catch(error) { return status(error.message,true); }
    const password = prompt('관리자 비밀번호를 입력하세요.'); if (!password) return;
    busy = true; render(); status('선수 변경사항을 저장하는 중입니다.');
    try {
      await writeApi('updatePlayersV2',{players,expectedPlayers:baseline,originalNames:edits.map(e => e.original?.name ?? null),password});
      load(players);
      status('모든 선수 변경사항을 저장했습니다.');
    } catch(error) { status(error.message,true); }
    finally { busy = false; render(); }
  });
  window.addEventListener('beforeunload',event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  render();
  return { load };
}
