import { POSITIONS, POSITION_LABELS, waitingPlayers } from './order-model.js';
import { ABILITY_FIELDS } from './player-roster.js';
const $ = id => document.getElementById(id);
const coords = {CF:[50,15],LF:[18,29],RF:[82,29],SS:[32,47],'2B':[68,47],'3B':[17,65],'1B':[83,65],P:[50,68],C:[50,87],DH:[84,88]};
const nameText = (name,state) => { const p=state.players.find(p=>p.name===name); return name ? `${name}${p?.num ? `(${p.num})` : ''}` : ''; };
export function renderOrderList(orders,page,selected,{onOpen,onDelete,onPage,writable}) {
  const pages=Math.max(1,Math.ceil(orders.length/10)); page=Math.min(page,pages-1);
  const body=$('allOrders');body.replaceChildren();
  for(const order of orders.slice(page*10,page*10+10)) {
    const row=document.createElement('tr');row.classList.toggle('selected-order',order.orderName===selected);
    const open=document.createElement('button');open.type='button';open.className='order-open';open.textContent=order.orderName;open.addEventListener('click',()=>onOpen(order.orderName));cell(row).append(open);
    const date=new Date(order.savedAt);cell(row,Number.isNaN(date.getTime())?'':date.toLocaleDateString('ko-KR'));
    const remove=document.createElement('button');remove.type='button';remove.className='text-button danger-button';remove.textContent='삭제';remove.disabled=!writable;remove.addEventListener('click',()=>onDelete(order.orderName));cell(row).append(remove);body.append(row);
  }
  if(!orders.length){const row=document.createElement('tr');cell(row,'표시할 오더가 없습니다.').colSpan=3;body.append(row);}
  const nav=$('orderPagination');nav.replaceChildren();
  for(const [label,target] of [['이전',page-1],[`${page+1} / ${pages}`,page],['다음',page+1]]) {
    if(target===page){const text=document.createElement('span');text.textContent=label;nav.append(text);continue;}
    const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=label;button.disabled=target<0||target>=pages;button.addEventListener('click',()=>onPage(target));nav.append(button);
  }
  return page;
}
function cell(row,text='',tag='td') { const node=document.createElement(tag); node.textContent=text; row.append(node); return node; }
function selector(label,options,value,onChange) {
  const select=document.createElement('select'); select.setAttribute('aria-label',label);
  options.forEach(([value,text])=>select.add(new Option(text,value)));
  select.value=value; select.addEventListener('change',()=>onChange(select.value)); return select;
}
export function renderOrderField(id,state,roster,onAssign) {
  const field=$(id); field.replaceChildren();
  for(const pos of POSITIONS) {
    const box=document.createElement('div'); box.className='position';
    box.style.left=coords[pos][0]+'%'; box.style.top=coords[pos][1]+'%';
    const label=document.createElement('strong'); label.textContent=pos; box.append(label);
    if(onAssign) {
      const key=['LF','CF','RF'].includes(pos)?'of':pos.toLowerCase();
      const ability=name=>Number(roster.find(p=>p.name===name)?.[key]||0);
      const sorted=state.players.slice().sort((a,b)=>ability(b.name)-ability(a.name)||a.name.localeCompare(b.name,'ko'));
      const select=selector(`${pos} 선수 선택`,[['','선택'],...sorted.map(p=>[p.name,nameText(p.name,state)])],state.positions[pos],name=>onAssign(pos,name));
      select.dataset.position=pos; box.append(select);
    } else { const label=document.createElement('small'); label.textContent=nameText(state.positions[pos],state)||'—'; box.append(label); }
    field.append(box);
  }
}
export function renderOrderTables(state,{editable=false,roster=[],onBatting,onAssign,onExcluded}={}) {
  const handText = name => {
    if (!name) return '—';
    const player = roster.find(p=>p.name===name);
    const label = value => value==='R'?'우':value==='L'?'좌':'-';
    return `${label(player?.throws)}/${label(player?.bats)}`;
  };
  const prefix=editable?'editor':'detail'; const body=$(prefix+'Lineup'); body.replaceChildren();
  state.startingList.forEach((entry,index)=>{
    const row=document.createElement('tr'); cell(row,index===9?'투수':String(index+1));
    if(editable) {
      const select=selector(`${index===9?'투수':index+1+'번'} 선수`,[['','선수 선택'],...state.players.map(p=>[p.name,nameText(p.name,state)])],entry.name,name=>index===9?onAssign('P',name):onBatting(index,name));
      select.id='batting'+index; cell(row).append(select);
      if(index===9) cell(row,'투수(P)');
      else {
        const position=POSITIONS.find(pos=>POSITION_LABELS[pos]===entry.pos)||'';
        const select=selector(`${index+1}번 포지션`,[['','선택'],...POSITIONS.map(pos=>[pos,POSITION_LABELS[pos]])],position,pos=>{
          if(pos) onAssign(pos,entry.name); else if(position) onAssign(position,'');
        });
        select.disabled=!entry.name; select.dataset.lineupPosition=String(index); cell(row).append(select);
      }
    } else { cell(row,nameText(entry.name,state)||'—'); cell(row,entry.pos||'—'); }
    cell(row,handText(entry.name)).className='handedness-cell';
    body.append(row);
  });
  const waiting=$(prefix+'Waiting'); waiting.replaceChildren();
  const players=waitingPlayers(state).sort((a,b)=>Number(state.excludedPlayers.includes(a.name))-Number(state.excludedPlayers.includes(b.name))||a.name.localeCompare(b.name,'ko'));
  for(let i=0;i<Math.max(10,players.length);i++) {
    const row=document.createElement('tr'), player=players[i];
    const td=cell(row);
    if(player) {
      const excluded=state.excludedPlayers.includes(player.name); row.classList.toggle('excluded',excluded);
      const assigned = POSITIONS.filter(pos=>state.positions[pos]===player.name);
      row.classList.toggle('position-waiting',assigned.length>0);
      if (assigned.length) row.title=`${assigned.join('/')} 배치 · 타순 미정`;
      if(editable) { const button=document.createElement('button'); button.type='button'; button.textContent=nameText(player.name,state); button.setAttribute('aria-pressed',String(excluded)); button.setAttribute('aria-label',`${player.name} 대기 제외 전환`); button.addEventListener('click',()=>onExcluded(player.name,!excluded)); td.append(button); }
      else td.textContent=nameText(player.name,state);
    } else td.textContent='\u00a0';
    cell(row,player?handText(player.name):'\u00a0').className='handedness-cell';
    waiting.append(row);
  }
}
export function renderParticipants(state,roster,onRemove) {
  const add=$('addPlayerSelect'); add.replaceChildren();
  roster.filter(p=>!state.players.some(player=>player.name===p.name)).sort((a,b)=>a.name.localeCompare(b.name,'ko')).forEach(p=>add.add(new Option(nameText(p.name,{players:roster}),p.name)));
  $('addPlayerButton').disabled=!add.options.length;
  const body=$('editorPlayers'); body.replaceChildren();
  state.players.forEach((p,i)=>{const row=document.createElement('tr');cell(row,String(i+1));cell(row,nameText(p.name,state));const button=document.createElement('button');button.type='button';button.className='text-button danger-button';button.textContent='삭제';button.setAttribute('aria-label',`${p.name} 참가 삭제`);button.addEventListener('click',()=>onRemove(p.name));cell(row).append(button);body.append(row);});
  $('participantCount').textContent=String(state.players.length);
}
export function renderAbilities(state,roster,onAssign) {
  const body=$('editorAbilities'); body.replaceChildren();
  for(const [key,label] of ABILITY_FIELDS) for(const level of [2,1]) {
    const row=document.createElement('tr');
    if(level===2){const th=cell(row,label,'th');th.rowSpan=2;th.scope='rowgroup';}
    cell(row,level===2?'주':'부','th');const group=cell(row);group.className='ability-candidates';
    const players=state.players.filter(p=>Number(roster.find(r=>r.name===p.name)?.[key])===level).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    for(const p of players) {
      const assigned=POSITIONS.filter(pos=>state.positions[pos]===p.name);
      const matches=pos=>key==='of'?['LF','CF','RF'].includes(pos):pos.toLowerCase()===key;
      const button=document.createElement('button');button.type='button';button.textContent=nameText(p.name,state);
      button.className=assigned.some(matches)?'ability-selected':assigned.length?'ability-assigned':'';
      button.addEventListener('click',()=>{
        const same=assigned.find(matches);
        if(same){onAssign(same,'');return;}
        if(key!=='of'){onAssign(key.toUpperCase(),p.name);return;}
        const choices=document.createElement('div');choices.className='outfield-choices';
        ['LF','CF','RF'].forEach(pos=>{const pick=document.createElement('button');pick.type='button';pick.textContent=pos;pick.setAttribute('aria-label',`${p.name} ${pos} 배치`);pick.addEventListener('click',()=>onAssign(pos,p.name));choices.append(pick);});
        group.querySelector('.outfield-choices')?.remove();group.append(choices);
      });group.append(button);
    }
    if(!players.length) group.textContent='—';body.append(row);
  }
}
