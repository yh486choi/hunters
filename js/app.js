import {readGameForm,fillGameForm,setupGameTime,scheduleText,gameTitle} from './game-meta.js';
import { renderOrderField, renderOrderTables, renderParticipants, renderAbilities, renderOrderList } from './order-views.js';
import {
  POSITIONS, createOrder, toPayload, validateOrder, assignPosition,
  setBattingPlayer, addPlayer, removePlayer, setExcluded, waitingPlayers
} from './order-model.js';
import { READ_API_BASE, WRITE_API_BASE, DEMO_MODE } from './config.js';
import { downloadOrderImage } from './capture.js';
import { saveDraft, loadDraft, clearDraft } from './draft-store.js';
import { setupRosterEditor } from './roster-editor.js';

const $ = id => document.getElementById(id);
setupGameTime();
const coords = { CF:[50,16], LF:[18,28], RF:[82,28], SS:[33,48], '2B':[65,48], '3B':[18,67], '1B':[82,67], P:[50,69], C:[50,87], DH:[84,88] };
const abilities = { P:'p', C:'c', '1B':'1b', '2B':'2b', '3B':'3b', SS:'ss', LF:'of', CF:'of', RF:'of' };
let orders = [];
let orderPage = 0;
let selectedOrder = null;
let orderRequest = 0;
let roster = [];

let draft = createOrder();
let currentId = '';
let currentVersion = '';
let view = 'orders';
let sheetPosition = '';


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
  const detail = next === 'detail';
  if (detail) next = 'orders';
  if (next === 'orders') {
    draft = createOrder(selectedOrder?.payload);
    currentId = selectedOrder?.id || '';
    currentVersion = selectedOrder?.version || '';
    renderDetail();
  }
  view = next;
  for (const name of ['orders','players','editor']) $(`${name}View`).hidden = name !== next;
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === next));
  refreshDraftNotice();
  if (!detail && ['orders','players'].includes(next) && location.search) history.replaceState(null,'',location.pathname);
  window.scrollTo(0,0);
}
function refreshDraftNotice() {
  const saved = loadDraft(localStorage);
  $('draftNotice').hidden = !saved || view === 'editor';
  if (saved) {
    $('draftNoticeText').textContent = gameTitle(saved.game);
  }
}
function persistDraft() {
  try {
    saveDraft(localStorage, { game:readGameForm(), currentId, currentVersion, draft });
    refreshDraftNotice();
  } catch {
    status('브라우저에 초안을 저장하지 못했습니다. 저장 공간 설정을 확인하세요.',true);
  }
}
function renderOrders() {
  orderPage = renderOrderList(orders,orderPage,selectedOrder?.id,{onOpen:openOrder,onDelete:deleteOrder,onPage:page=>{orderPage=page;renderOrders();},writable:Boolean(WRITE_API_BASE)});
}
function displayName(name, state) {
  if (!name) return '';
  const player = state.players.find(p => p.name === name);
  return player?.num ? `${name} #${player.num}` : name;
}
function renderDetail() {
  $('detailTitle').textContent = selectedOrder ? selectedOrder.game.opponent || '상대팀 미정' : '경기를 선택하세요';
  $('detailDate').textContent = selectedOrder ? scheduleText(selectedOrder.game) : '';
  for (const id of ['editButton','captureButton','copyLinkButton','shareButton']) $(id).disabled = !selectedOrder;
  const state = createOrder(selectedOrder?.payload);
  renderOrderField('detailField',state,roster);
  renderOrderTables(state,{roster});
}
function renderEditor() {
  renderGameHeading();
  const onAssign = (pos,name)=>mutate(()=>assignPosition(draft,pos,name));
  renderOrderField('editorField',draft,roster,onAssign);
  renderOrderTables(draft,{editable:true,roster,onAssign,onBatting:(index,name)=>mutate(()=>setBattingPlayer(draft,index,name)),onExcluded:(name,excluded)=>mutate(()=>setExcluded(draft,name,excluded))});
  renderParticipants(draft,roster,name=>mutate(()=>removePlayer(draft,name)));
  renderAbilities(draft,roster,onAssign);
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
async function deleteOrder(id){const order=orders.find(order=>order.id===id);if(!order||!confirm(gameTitle(order.game)+' 경기를 삭제할까요?'))return; const password=prompt('관리자 비밀번호'); if(!password)return; try { await writeApi('deleteOrderV3',{id,password,expectedVersion:order.version}); orders=orders.filter(order=>order.id!==id); renderOrders(); if(selectedOrder?.id===id){selectedOrder=null;currentId='';currentVersion='';draft=createOrder();renderDetail();show('orders');} status('경기를 삭제했습니다.'); } catch(error){ status(error.message,true); } }
async function openOrder(name,legacy=false) {
  const request = ++orderRequest;
  status('오더를 불러오는 중입니다.');
  try {
    const data = await readApi(`getOrderV3?${legacy?'legacyName':'id'}=${encodeURIComponent(name)}`);
    if (request !== orderRequest) return;
    if (!data?.payload) throw new Error('오더 데이터가 없습니다.');
    selectedOrder = structuredClone(data);
    draft = createOrder(data.payload);
    currentId = data.id || name;
    currentVersion = data.version || '';
    history.replaceState(null,'',`?game=${encodeURIComponent(currentId)}`);
    renderDetail(); renderOrders(); show('detail'); status();
    if (matchMedia('(max-width: 1100px)').matches) $('detailTitle').scrollIntoView({block:'start'});
  } catch (error) { status(error.message,true); }
}
function startEditor(newOrder = false) {
  if (loadDraft(localStorage) && !confirm('작성 중인 초안을 지우고 다른 오더를 편집할까요?')) return;
  if (newOrder) { draft = createOrder(); currentId = crypto.randomUUID(); currentVersion = ''; }
  else if (selectedOrder) { draft = createOrder(selectedOrder.payload); currentId = selectedOrder.id; currentVersion = selectedOrder.version; }
  fillGameForm(newOrder?{}:selectedOrder?.game);
  renderEditor(); show('editor');
  status(WRITE_API_BASE ? '' : '새 쓰기 API 배포 전까지 저장할 수 없습니다.',!WRITE_API_BASE);
  persistDraft();
}
async function save() {
  for(const id of ['gameDate','gameHour','gameMinute','opponent']) if(!$(id).reportValidity())return;
  const game=readGameForm();
  if(!game.opponent)return status('상대팀명을 입력하세요.',true);
  const errors = validateOrder(draft);
  if (errors.length) return status(errors.join(' '),true);
  if (!WRITE_API_BASE) return status('쓰기 API가 아직 배포되지 않아 저장할 수 없습니다.',true);
  const password = prompt('관리자 비밀번호를 입력하세요.');
  if (!password) return;
  const id=currentId||crypto.randomUUID();currentId=id;
  const payload=toPayload(draft),expectedVersion=currentVersion||null;
  $('saveButton').disabled=true;
  try {
    status('오더를 저장하는 중입니다.');
    const saved=await writeApi('saveOrderV3',{id,game,payload,password,expectedVersion});
    currentVersion=saved.version;
    const data={id,version:saved.version,game,payload:{...payload,game}};
    selectedOrder = structuredClone(data);
    draft = createOrder(data.payload);
    let draftCleared = true;
    try { clearDraft(localStorage); } catch { draftCleared = false; }
    let listLoaded=true;
    try{await loadOrders();}catch{listLoaded=false;}
    history.replaceState(null,'',`?game=${encodeURIComponent(currentId)}`);
    renderDetail(); show('detail');
    status(!listLoaded?'경기를 저장했지만 목록 재조회에 실패했습니다. 새로고침해 주세요.':draftCleared?'경기를 저장했습니다.':'서버 저장은 완료됐지만 브라우저 초안을 지우지 못했습니다.',!listLoaded||!draftCleared);
  } catch (error) { status(error.message,true); }
  finally{$('saveButton').disabled=!WRITE_API_BASE;}
}
async function loadOrders() {
  const data = await readApi('getOrdersV3');
  if (!Array.isArray(data)) throw new Error('오더 목록 형식이 올바르지 않습니다.');
  orders = data;
  orders.sort((a,b) => `${b.game.date} ${b.game.time}`.localeCompare(`${a.game.date} ${a.game.time}`)||a.game.opponent.localeCompare(b.game.opponent,'ko'));
  renderOrders();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => show(button.dataset.view)));
$('newOrderButton').addEventListener('click', () => startEditor(true));
$('editButton').addEventListener('click', () => startEditor(false));
$('captureButton').addEventListener('click', async () => {
  $('captureButton').disabled = true;
  try { status('오더 이미지를 만드는 중입니다.'); await downloadOrderImage(selectedOrder.payload,selectedOrder.game,roster); status('이미지 다운로드를 시작했습니다.'); }
  catch (error) { status(`이미지 저장 실패: ${error.message}`,true); }
  finally { $('captureButton').disabled = !selectedOrder; }
});
$('captureDraftButton').addEventListener('click', async () => {
  $('captureDraftButton').disabled = true;
  try {
    status('초안 이미지를 만드는 중입니다.');
    await downloadOrderImage(draft,readGameForm(),roster);
    status('초안 이미지 다운로드를 시작했습니다.');
  } catch (error) { status(`이미지 저장 실패: ${error.message}`,true); }
  finally { $('captureDraftButton').disabled = false; }
});
$('shareButton').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('game',currentId);
  try {
    if (navigator.share) await navigator.share({ title:`삼성 헌터스 · ${gameTitle(selectedOrder.game)}`, url:url.href });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); status('오더 링크를 복사했습니다.'); }
    else prompt('오더 링크를 복사하세요.',url.href);
  } catch (error) { if (error.name !== 'AbortError') status('링크 공유에 실패했습니다.',true); }
});
$('copyLinkButton').addEventListener('click', async () => {
  const url = new URL(location.href); url.searchParams.set('game',selectedOrder.id);
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); status('오더 링크를 복사했습니다.'); }
    else prompt('오더 링크를 복사하세요.',url.href);
  } catch { prompt('오더 링크를 복사하세요.',url.href); }
});
$('saveButton').addEventListener('click', save);
function renderGameHeading(){const game=readGameForm();$('editorCaptureTitle').textContent=game.opponent||'상대팀 미정';$('editorSchedule').textContent=scheduleText(game);}
for(const id of ['gameDate','gameHour','gameMinute','opponent'])$(id).addEventListener('input',()=>{renderGameHeading();persistDraft();});
$('resumeDraftButton').addEventListener('click', async () => {
  const saved = loadDraft(localStorage);
  if (!saved) { refreshDraftNotice(); return status('이어 쓸 초안을 찾을 수 없습니다.',true); }
  draft = saved.draft; currentId = saved.currentId; currentVersion = saved.currentVersion;
  let game=saved.game;
  if(saved.legacyName){
    try{const previous=await readApi(`getOrderV3?legacyName=${encodeURIComponent(saved.legacyName)}`);if(!previous)throw new Error('기존 경기를 찾을 수 없습니다.');currentId=previous.id;game=previous.game;}
    catch(error){return status(error.message,true);}
  }
  fillGameForm(game);
  renderEditor(); show('editor'); status('작성 중이던 오더를 불러왔습니다.');
});
$('discardDraftButton').addEventListener('click', () => {
  try { clearDraft(localStorage); refreshDraftNotice(); status('작성 중이던 초안을 삭제했습니다.'); }
  catch { status('초안을 삭제하지 못했습니다. 브라우저 저장 공간 설정을 확인하세요.',true); }
});
const rosterEditor = setupRosterEditor({ readApi, writeApi, status, writable:Boolean(WRITE_API_BASE), onSaved:players => { roster = players; renderDetail(); if(view === 'editor') renderEditor(); } });
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
renderDetail();
refreshDraftNotice();
Promise.allSettled([loadOrders().then(async () => {
  const params=new URLSearchParams(location.search);
  if(params.get('game'))await openOrder(params.get('game'));
  else if(params.get('orderName'))await openOrder(params.get('orderName'),true);
}),readApi('getPlayersV2').then(data => {
  if (!Array.isArray(data)) throw new Error('선수 목록 형식이 올바르지 않습니다.');
  rosterEditor.load(data);
})]).then(results => {
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) status('운영 데이터를 불러오지 못했습니다. 네트워크 연결과 API 상태를 확인하세요.',true);
});
