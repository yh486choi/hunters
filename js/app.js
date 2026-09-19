import {
  POSITIONS, createOrder, toPayload, validateOrder, assignPosition,
  setBattingPlayer, addPlayer, removePlayer, setExcluded, waitingPlayers
} from './order-model.js';
import { READ_API_BASE, WRITE_API_BASE, DEMO_MODE } from './config.js';
import { downloadOrderImage } from './capture.js';
import { saveDraft, loadDraft, clearDraft } from './draft-store.js';
import { ABILITY_FIELDS, normalizeRoster } from './player-roster.js';

const $ = id => document.getElementById(id);
const coords = { CF:[50,16], LF:[18,28], RF:[82,28], SS:[33,48], '2B':[65,48], '3B':[18,67], '1B':[82,67], P:[50,69], C:[50,87], DH:[84,88] };
const abilities = { P:'p', C:'c', '1B':'1b', '2B':'2b', '3B':'3b', SS:'ss', LF:'of', CF:'of', RF:'of' };
let orders = [];
let roster = [];
let editingPlayerName = null;
let draft = createOrder();
let currentName = '';
let currentSavedAt = '';
let view = 'home';
let sheetPosition = '';
let rosterSort = { field:'name', direction:1 };

function status(message = '', error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
async function readApi(path) {
  const response = await fetch(`${READ_API_BASE}/${path}`);
  if (!response.ok) throw new Error(`조회 오류 (${response.status})`);
  return response.json();
}
async function writeApi(path, body) {
  if (!WRITE_API_BASE) throw new Error('새 쓰기 API가 아직 설정되지 않았습니다.');
  const response = await fetch(`${WRITE_API_BASE}/${path}`, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || data.status !== '성공') throw new Error(data.error || `저장 오류 (${response.status})`);
  return data;
}
function show(next) {
  view = next;
  for (const name of ['home','orders','players','detail','editor']) $(`${name}View`).hidden = name !== next;
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === next));
  refreshDraftNotice();
  if (['home','orders','players'].includes(next) && location.search) history.replaceState(null,'',location.pathname);
  window.scrollTo(0,0);
}
function dateText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR', { dateStyle:'medium', timeStyle:'short' });
}
function refreshDraftNotice() {
  const saved = loadDraft(localStorage);
  $('draftNotice').hidden = !saved || view === 'editor';
  if (saved) {
    const name = saved.orderName.trim() || '이름 없는 오더';
    const when = dateText(saved.updatedAt);
    $('draftNoticeText').textContent = `${name}${when ? ` · 마지막 저장 ${when}` : ''}`;
  }
}
function persistDraft() {
  try {
    saveDraft(localStorage, { orderName:$('orderName').value, currentName, currentSavedAt, draft });
    refreshDraftNotice();
  } catch {
    status('브라우저에 초안을 저장하지 못했습니다. 저장 공간 설정을 확인하세요.',true);
  }
}
function makeOrderButton(order) {
  const row=document.createElement('div'); row.className='order-row';
  const open=document.createElement('button'); open.type='button'; open.className='order-open';
  const title=document.createElement('span'); const strong=document.createElement('strong'); strong.textContent=order.orderName;
  const small=document.createElement('small'); small.textContent=dateText(order.savedAt); title.append(strong,small);
  const arrow=document.createElement('span'); arrow.textContent='→'; open.append(title,arrow); open.addEventListener('click',()=>openOrder(order.orderName));
  const remove=document.createElement('button'); remove.type='button'; remove.className='text-button danger-button'; remove.textContent=String.fromCharCode(49325,51228); remove.disabled=!WRITE_API_BASE; remove.addEventListener('click',()=>deleteOrder(order.orderName));
  row.append(open,remove); return row;
}
function renderOrders() {
  for (const [id, list] of [['recentOrders',orders.slice(0,4)],['allOrders',orders]]) {
    const container = $(id);
    container.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '표시할 오더가 없습니다.';
      container.append(empty);
    } else list.forEach(order => container.append(makeOrderButton(order)));
  }
}
function playerAbilityText(player) {
  const names = { p:'P', c:'C', '1b':'1B', '2b':'2B', '3b':'3B', ss:'SS', of:'OF' };
  const main = Object.entries(names).filter(([key]) => Number(player[key]) === 2).map(([,label]) => label);
  const secondary = Object.entries(names).filter(([key]) => Number(player[key]) === 1).map(([,label]) => label);
  return [main.length ? `주 ${main.join(' · ')}` : '', secondary.length ? `부 ${secondary.join(' · ')}` : ''].filter(Boolean).join(' / ') || '포지션 정보 없음';
}
function renderRoster() {
  const query=$('playerSearch').value.trim().toLowerCase(); const container=$('playerList'); container.replaceChildren();
  const fields=[['name','\uC774\uB984'],['num','\uBC30\uBC88'],...ABILITY_FIELDS.map(([key,label])=>[key,label])];
  const visible=roster.filter(p=>p.name.toLowerCase().includes(query)||String(p.num).includes(query)).slice().sort((a,b)=>{ const av=a[rosterSort.field]??'', bv=b[rosterSort.field]??''; const numeric=rosterSort.field!=='name'; const result=numeric?(Number(av||0)-Number(bv||0)):String(av).localeCompare(String(bv),'ko',{numeric:true}); return (result||a.name.localeCompare(b.name,'ko'))*rosterSort.direction; });
  const table=document.createElement('table'); table.className='player-admin-table'; const thead=document.createElement('thead'); const headRow=document.createElement('tr');
  fields.push(['actions','\uAD00\uB9AC']); fields.forEach(([field,label])=>{ const th=document.createElement('th'); if(field==='actions'){ th.textContent=label; } else { const button=document.createElement('button'); button.type='button'; button.className='table-sort-button'; button.textContent=label+' '+(rosterSort.field===field?(rosterSort.direction===1?'▲':'▼'):'↕'); button.addEventListener('click',()=>{ if(rosterSort.field===field)rosterSort.direction*=-1; else {rosterSort.field=field;rosterSort.direction=1;} renderRoster(); }); th.append(button); } headRow.append(th); }); thead.append(headRow); table.append(thead);
  const tbody=document.createElement('tbody'); visible.forEach(player=>{ const row=document.createElement('tr'); const name=document.createElement('td'); name.textContent=player.name; row.append(name); const num=document.createElement('td'); num.textContent=player.num||'—'; row.append(num);
    for(const [key] of ABILITY_FIELDS){ const cell=document.createElement('td'); cell.textContent=Number(player[key])===2?'\uC8FC':Number(player[key])===1?'\uBD80':'-'; cell.className=Number(player[key])===2?'primary-ability':Number(player[key])===1?'secondary-ability':''; row.append(cell); }
    const actions=document.createElement('td'); actions.className='table-actions'; const edit=document.createElement('button'); edit.type='button'; edit.className='text-button'; edit.textContent='\uC218\uC815'; edit.disabled=!WRITE_API_BASE; edit.addEventListener('click',()=>openPlayerForm(player)); const remove=document.createElement('button'); remove.type='button'; remove.className='text-button danger-button'; remove.textContent='\uC0AD\uC81C'; remove.disabled=!WRITE_API_BASE; remove.addEventListener('click',()=>deletePlayer(player.name)); actions.append(edit,remove); row.append(actions); tbody.append(row); });
  table.append(tbody); container.append(table);
}
function openPlayerForm(player = null) {
  editingPlayerName = player?.name ?? null;
  $('playerFormTitle').textContent = player ? '선수 수정' : '선수 추가';
  $('editPlayerName').value = player?.name ?? '';
  $('editPlayerNumber').value = player?.num ?? '';
  const fields = $('playerAbilityFields'); fields.replaceChildren();
  for (const [key, label] of ABILITY_FIELDS) {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const select = document.createElement('select'); select.name = key;
    [['0','-'],['1','부'],['2','주']].forEach(([value, label]) => select.add(new Option(label,value)));
    select.value = String(player?.[key] ?? '0');
    wrapper.append(select); fields.append(wrapper);
  }
  $('playerForm').hidden = false;
  $('editPlayerName').focus();
}
function closePlayerForm() { $('playerForm').hidden = true; editingPlayerName = null; }
async function savePlayer(event) {
  event.preventDefault(); const candidate={name:$('editPlayerName').value.trim(),num:$('editPlayerNumber').value.trim()};
  for(const [key] of ABILITY_FIELDS) candidate[key]=$('playerAbilityFields').querySelector('[name="'+key+'"]').value;
  let updated; try { updated=normalizeRoster(editingPlayerName?roster.map(player=>player.name===editingPlayerName?candidate:player):[...roster,candidate]); } catch(error){ return status(error.message,true); }
  const password=prompt('Admin password'); if(!password)return;
  if(editingPlayerName&&editingPlayerName!==candidate.name&&!confirm('이름 변경 시 기존 오더도 함께 변경됩니다. 계속할까요?'))return;
  $('savePlayerButton').disabled=true; try { if(editingPlayerName&&editingPlayerName!==candidate.name) await writeApi('renamePlayerV2',{oldName:editingPlayerName,newName:candidate.name,password}); await writeApi('updatePlayersV2',{players:updated,password}); roster=normalizeRoster(await readApi('getPlayers')); closePlayerForm(); renderRoster(); status('선수 목록을 저장했습니다.'); } catch(error){ status(error.message,true); } finally { $('savePlayerButton').disabled=false; }
}
async function deletePlayer(name){ if(!confirm(name+' 선수를 삭제할까요?'))return; const password=prompt('Admin password'); if(!password)return; try { await writeApi('deletePlayerV2',{name,password}); roster=normalizeRoster(await readApi('getPlayers')); renderRoster(); status('선수를 삭제했습니다.'); } catch(error){ status(error.message,true); } }
function displayName(name, state) {
  if (!name) return '';
  const player = state.players.find(p => p.name === name);
  return player?.num ? `${name} #${player.num}` : name;
}
function renderField(id, state, interactive) {
  const field = $(id); field.replaceChildren();
  for (const pos of POSITIONS) {
    const node = document.createElement(interactive ? 'button' : 'div');
    node.className = 'position';
    node.style.left = `${coords[pos][0]}%`; node.style.top = `${coords[pos][1]}%`;
    const label = document.createElement('strong'); label.textContent = pos;
    const player = document.createElement('small'); player.textContent = state.positions[pos] || (interactive ? '선택' : '—');
    node.append(label, player);
    if (interactive) { node.type = 'button'; node.setAttribute('aria-label', `${pos} 선수 선택`); node.addEventListener('click', () => openSheet(pos)); }
    field.append(node);
  }
}
function renderDetail() {
  $('detailTitle').textContent = currentName;
  $('detailDate').textContent = dateText(currentSavedAt);
  renderField('detailField', draft, false);
  const lineup = $('detailLineup'); lineup.replaceChildren();
  draft.startingList.slice(0,9).forEach(row => {
    const li = document.createElement('li');
    li.textContent = displayName(row.name, draft) || '—';
    const pos = document.createElement('span'); pos.textContent = row.pos || '';
    li.append(pos); lineup.append(li);
  });
  const pitcher = document.createElement('li'); pitcher.textContent = `투수 · ${displayName(draft.startingList[9].name, draft) || '—'}`; lineup.append(pitcher);
  const waiting = $('detailWaiting'); waiting.replaceChildren();
  waitingPlayers(draft).forEach(player => {
    const chip = document.createElement('span'); chip.className = 'waiting-chip';
    if (draft.excludedPlayers.includes(player.name)) chip.classList.add('excluded');
    chip.textContent = displayName(player.name, draft); waiting.append(chip);
  });
}
function renderEditor() {
  renderField('editorField', draft, true);
  const lineup = $('editorLineup'); lineup.replaceChildren();
  draft.startingList.slice(0,9).forEach((row,index) => {
    const wrapper = document.createElement('div'); wrapper.className = 'lineup-row';
    const label = document.createElement('label'); label.textContent = `${index+1}번`; label.htmlFor = `batting${index}`;
    const select = document.createElement('select'); select.id = `batting${index}`;
    const blank = new Option('선수 선택', ''); select.add(blank);
    draft.players.forEach(p => select.add(new Option(displayName(p.name,draft),p.name)));
    select.value = row.name;
    select.addEventListener('change', () => mutate(() => setBattingPlayer(draft,index,select.value)));
    wrapper.append(label,select); lineup.append(wrapper);
  });
  const pitcher = document.createElement('p'); pitcher.className = 'muted'; pitcher.textContent = `투수 · ${displayName(draft.positions.P,draft) || '미지정'} (그라운드 P에서 선택)`; lineup.append(pitcher);
  const add = $('addPlayerSelect'); add.replaceChildren();
  const present = new Set(draft.players.map(p => p.name));
  roster.filter(p => !present.has(p.name)).forEach(p => add.add(new Option(displayName(p.name,{players:roster}),p.name)));
  $('addPlayerButton').disabled = !add.options.length;
  const container = $('editorPlayers'); container.replaceChildren();
  draft.players.forEach(player => {
    const row = document.createElement('div'); row.className = 'editor-player';
    const name = document.createElement('strong'); name.textContent = displayName(player.name,draft);
    const actions = document.createElement('div'); actions.className = 'actions';
    const waiting = waitingPlayers(draft).some(p => p.name === player.name);
    if (waiting) {
      const label = document.createElement('label');
      const box = document.createElement('input'); box.type = 'checkbox'; box.checked = draft.excludedPlayers.includes(player.name);
      box.addEventListener('change', () => mutate(() => setExcluded(draft,player.name,box.checked)));
      label.append(box,'제외'); actions.append(label);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
    remove.addEventListener('click', () => mutate(() => removePlayer(draft,player.name)));
    actions.append(remove); row.append(name,actions); container.append(row);
  });
}
function mutate(action) {
  try { draft = action(); renderEditor(); status(); persistDraft(); }
  catch (error) { status(error.message,true); renderEditor(); }
}
function openSheet(pos) {
  sheetPosition = pos;
  $('sheetTitle').textContent = `${pos} 선수 선택`;
  $('sheetSearch').value = '';
  renderSheet();
  $('sheetBackdrop').hidden = $('playerSheet').hidden = false;
  $('sheetSearch').focus();
}
function closeSheet() { $('sheetBackdrop').hidden = $('playerSheet').hidden = true; sheetPosition = ''; }
function renderSheet() {
  const container = $('sheetPlayers'); container.replaceChildren();
  const clear = document.createElement('button'); clear.className = 'sheet-player'; clear.textContent = '포지션 비우기';
  clear.addEventListener('click', () => { mutate(() => assignPosition(draft,sheetPosition,'')); closeSheet(); }); container.append(clear);
  const query = $('sheetSearch').value.trim().toLowerCase();
  const key = abilities[sheetPosition];
  draft.players.filter(p => p.name.toLowerCase().includes(query) || String(p.num).includes(query))
    .sort((a,b) => (Number(b[key] || 0) - Number(a[key] || 0)) || a.name.localeCompare(b.name,'ko'))
    .forEach(player => {
      const button = document.createElement('button'); button.className = 'sheet-player'; button.type = 'button';
      const label = document.createElement('span'); label.textContent = displayName(player.name,draft);
      const detail = document.createElement('small');
      detail.textContent = key ? ({2:'주포지션',1:'부포지션'}[Number(player[key])] || '') : '';
      button.append(label,detail);
      button.addEventListener('click', () => { mutate(() => assignPosition(draft,sheetPosition,player.name)); closeSheet(); });
      container.append(button);
    });
}
async function deleteOrder(name){ if(!confirm(name+' 오더를 삭제할까요?'))return; const password=prompt('Admin password'); if(!password)return; try { await writeApi('deleteOrderV2',{name,password}); orders=orders.filter(order=>order.orderName!==name); renderOrders(); if(currentName===name){currentName='';currentSavedAt='';draft=createOrder();show('orders');} status('오더를 삭제했습니다.'); } catch(error){ status(error.message,true); } }
async function openOrder(name) {
  status('오더를 불러오는 중입니다.');
  try {
    const data = await readApi(`getOrder?name=${encodeURIComponent(name)}`);
    if (!data?.payload) throw new Error('오더 데이터가 없습니다.');
    draft = createOrder(data.payload);
    currentName = data.orderName || name;
    currentSavedAt = data.savedAt || '';
    history.replaceState(null,'',`?orderName=${encodeURIComponent(currentName)}`);
    renderDetail(); show('detail'); status();
  } catch (error) { status(error.message,true); }
}
function startEditor(newOrder = false) {
  if (loadDraft(localStorage) && !confirm('작성 중인 초안을 지우고 다른 오더를 편집할까요?')) return;
  if (newOrder) { draft = createOrder(); currentName = ''; currentSavedAt = ''; }
  $('orderName').value = currentName;
  renderEditor(); show('editor');
  status(WRITE_API_BASE ? '' : '새 쓰기 API 배포 전까지 저장할 수 없습니다.',!WRITE_API_BASE);
  persistDraft();
}
async function save() {
  const name = $('orderName').value.trim();
  if (!name) return status('오더명을 입력하세요.',true);
  const errors = validateOrder(draft);
  if (errors.length) return status(errors.join(' '),true);
  if (!WRITE_API_BASE) return status('쓰기 API가 아직 배포되지 않아 저장할 수 없습니다.',true);
  const password = prompt('관리자 비밀번호를 입력하세요.');
  if (!password) return;
  try {
    const existing = await readApi(`getOrder?name=${encodeURIComponent(name)}`);
    const editingSameOrder = currentName === name && Boolean(currentSavedAt);
    if (editingSameOrder && existing?.savedAt !== currentSavedAt) {
      throw new Error('다른 곳에서 오더가 변경됐습니다. 최신 오더를 다시 불러온 뒤 수정하세요.');
    }
    if (existing && !editingSameOrder && !confirm('기존 오더를 덮어쓸까요?')) return;
    status('오더를 저장하는 중입니다.');
    await writeApi('saveOrderV2',{
      orderName:name, payload:toPayload(draft), password,
      expectedSavedAt:editingSameOrder ? currentSavedAt : existing?.savedAt ?? null
    });
    const data = await readApi(`getOrder?name=${encodeURIComponent(name)}`);
    if (!data?.payload) throw new Error('저장 후 재조회에 실패했습니다.');
    draft = createOrder(data.payload); currentName = name; currentSavedAt = data.savedAt;
    let draftCleared = true;
    try { clearDraft(localStorage); } catch { draftCleared = false; }
    await loadOrders();
    history.replaceState(null,'',`?orderName=${encodeURIComponent(currentName)}`);
    renderDetail(); show('detail');
    status(draftCleared ? '저장 후 다시 불러왔습니다.' : '서버 저장은 완료됐지만 브라우저 초안을 지우지 못했습니다.',!draftCleared);
  } catch (error) { status(error.message,true); }
}
async function loadOrders() {
  const data = await readApi('getOrders');
  if (!Array.isArray(data)) throw new Error('오더 목록 형식이 올바르지 않습니다.');
  orders = data;
  orders.sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt));
  renderOrders();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => show(button.dataset.view)));
$('newOrderButton').addEventListener('click', () => startEditor(true));
$('newOrderButton2').addEventListener('click', () => startEditor(true));
$('editButton').addEventListener('click', () => startEditor(false));
$('captureButton').addEventListener('click', async () => {
  try { status('오더 이미지를 만드는 중입니다.'); await downloadOrderImage(draft,currentName); status('이미지 다운로드를 시작했습니다.'); }
  catch (error) { status(`이미지 저장 실패: ${error.message}`,true); }
});
$('captureDraftButton').addEventListener('click', async () => {
  try {
    status('초안 이미지를 만드는 중입니다.');
    await downloadOrderImage(draft,$('orderName').value.trim() || '미저장 오더');
    status('초안 이미지 다운로드를 시작했습니다.');
  } catch (error) { status(`이미지 저장 실패: ${error.message}`,true); }
});
$('shareButton').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('orderName',currentName);
  try {
    if (navigator.share) await navigator.share({ title:`삼성 헌터스 · ${currentName}`, url:url.href });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); status('오더 링크를 복사했습니다.'); }
    else prompt('오더 링크를 복사하세요.',url.href);
  } catch (error) { if (error.name !== 'AbortError') status('링크 공유에 실패했습니다.',true); }
});
$('saveButton').addEventListener('click', save);
$('orderName').addEventListener('input', persistDraft);
$('resumeDraftButton').addEventListener('click', () => {
  const saved = loadDraft(localStorage);
  if (!saved) { refreshDraftNotice(); return status('이어 쓸 초안을 찾을 수 없습니다.',true); }
  draft = saved.draft; currentName = saved.currentName; currentSavedAt = saved.currentSavedAt;
  $('orderName').value = saved.orderName;
  renderEditor(); show('editor'); status('작성 중이던 오더를 불러왔습니다.');
});
$('discardDraftButton').addEventListener('click', () => {
  try { clearDraft(localStorage); refreshDraftNotice(); status('작성 중이던 초안을 삭제했습니다.'); }
  catch { status('초안을 삭제하지 못했습니다. 브라우저 저장 공간 설정을 확인하세요.',true); }
});
$('playerSearch').addEventListener('input', renderRoster);
$('playerSort')?.addEventListener('change', renderRoster);
$('changePasswordButton')?.addEventListener('click', changePassword);
$('newPlayerButton').disabled = !WRITE_API_BASE;
$('newPlayerButton').addEventListener('click', () => openPlayerForm());
$('cancelPlayerButton').addEventListener('click', closePlayerForm);
$('playerForm').addEventListener('submit', savePlayer);
$('sheetSearch').addEventListener('input', renderSheet);
$('closeSheet').addEventListener('click', closeSheet);
$('sheetBackdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && sheetPosition) closeSheet(); });
$('addPlayerButton').addEventListener('click', () => {
  const player = roster.find(p => p.name === $('addPlayerSelect').value);
  if (player) mutate(() => addPlayer(draft,player));
});
$('themeButton').addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('hunters-theme',dark ? 'dark':'light');
});
if (localStorage.getItem('hunters-theme') === 'dark') document.body.classList.add('dark');
if (DEMO_MODE) {
  $('environmentNotice').hidden = false;
  $('environmentNotice').textContent = '로컬 데모 데이터입니다. 저장 비밀번호: demo · 서버를 다시 시작하면 초기화됩니다.';
}
async function changePassword(){ const oldPassword=prompt('현재 관리자 비밀번호'); if(!oldPassword)return; const newPassword=prompt('새 비밀번호 (4자 이상)'); if(!newPassword)return; const again=prompt('새 비밀번호 재입력'); if(newPassword!==again)return status('비밀번호가 일치하지 않습니다.',true); try { await writeApi('changePasswordV2',{oldPassword,newPassword}); status('비밀번호를 변경했습니다.'); } catch(error){ status(error.message,true); } }
$('saveButton').disabled = !WRITE_API_BASE;
refreshDraftNotice();
Promise.allSettled([loadOrders().then(async () => {
  const linkedOrder = new URLSearchParams(location.search).get('orderName');
  if (linkedOrder) await openOrder(linkedOrder);
}),readApi('getPlayers').then(data => {
  if (!Array.isArray(data)) throw new Error('선수 목록 형식이 올바르지 않습니다.');
  roster = normalizeRoster(data); renderRoster();
})]).then(results => {
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) status('운영 데이터를 불러오지 못했습니다. 네트워크 연결과 API 상태를 확인하세요.',true);
});
