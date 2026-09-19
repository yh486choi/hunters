import { POSITIONS, waitingPlayers } from './order-model.js';

const coords = { CF:[50,16], LF:[18,28], RF:[82,28], SS:[33,48], '2B':[65,48], '3B':[18,67], '1B':[82,67], P:[50,69], C:[50,87], DH:[84,88] };
const fieldUrl = new URL('../assets/field.png', import.meta.url).href;

function rounded(ctx,x,y,width,height,radius,color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x,y,width,height,radius);
  ctx.fill();
}
function fitted(ctx,value,maxWidth) {
  let text = String(value ?? '');
  while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = text.slice(0,-1);
  return text === value ? text : `${text}…`;
}
function loadField() {
  return new Promise((resolve,reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('그라운드 이미지를 불러오지 못했습니다.'));
    image.src = fieldUrl;
  });
}
function playerText(state,name) {
  if (!name) return '미지정';
  const num = state.players.find(player => player.name === name)?.num;
  return num ? `${name}  #${num}` : name;
}

export async function renderOrderImage(state,orderName) {
  const waiting = waitingPlayers(state);
  const waitingRows = Math.ceil(waiting.length / 3);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = Math.max(1920,1775 + waitingRows * 62);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 생성 기능을 사용할 수 없습니다.');
  const fieldImage = await loadField();

  ctx.fillStyle = '#edf3fb'; ctx.fillRect(0,0,canvas.width,canvas.height);
  rounded(ctx,0,0,1080,205,0,'#102544');
  ctx.fillStyle = '#9cc6fa'; ctx.font = 'bold 27px system-ui'; ctx.fillText('SAMSUNG HUNTERS',60,75);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 56px system-ui'; ctx.fillText(fitted(ctx,orderName,960),60,151);

  const field = { x:50,y:235,w:980,h:784 };
  ctx.save(); ctx.beginPath(); ctx.roundRect(field.x,field.y,field.w,field.h,28); ctx.clip();
  ctx.drawImage(fieldImage,field.x,field.y,field.w,field.h); ctx.restore();
  for (const pos of POSITIONS) {
    const [px,py] = coords[pos];
    const x = field.x + field.w*px/100, y = field.y + field.h*py/100;
    rounded(ctx,x-75,y-39,150,78,13,'#fffffff2');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#17529d'; ctx.font = 'bold 25px system-ui'; ctx.fillText(pos,x,y-7);
    ctx.fillStyle = '#14243d'; ctx.font = 'bold 22px system-ui'; ctx.fillText(fitted(ctx,state.positions[pos] || '—',133),x,y+23);
  }
  ctx.textAlign = 'left';

  rounded(ctx,50,1045,980,585,22,'#fff');
  ctx.fillStyle = '#14243d'; ctx.font = 'bold 36px system-ui'; ctx.fillText('선발 명단',85,1110);
  const entries = state.startingList.slice(0,9).map((row,index) => ({ label:String(index+1),name:row.name }));
  entries.push({ label:'P', name:state.positions.P });
  entries.forEach((entry,index) => {
    const col = index < 5 ? 0 : 1;
    const row = index % 5;
    const x = 85 + col*475, y = 1190 + row*85;
    ctx.fillStyle = '#e9f1fc'; ctx.fillRect(x,y-42,435,1);
    ctx.fillStyle = '#17529d'; ctx.font = 'bold 27px system-ui'; ctx.fillText(entry.label,x,y);
    ctx.fillStyle = '#14243d'; ctx.font = 'bold 28px system-ui'; ctx.fillText(fitted(ctx,playerText(state,entry.name),270),x+56,y);
    const pos = POSITIONS.find(code => state.positions[code] === entry.name);
    if (pos) { ctx.textAlign = 'right'; ctx.fillStyle = '#61718a'; ctx.font = '24px system-ui'; ctx.fillText(pos,x+430,y); ctx.textAlign = 'left'; }
  });

  rounded(ctx,50,1660,980,Math.max(150,canvas.height-1720),22,'#fff');
  ctx.fillStyle = '#14243d'; ctx.font = 'bold 34px system-ui'; ctx.fillText('대기 명단',85,1720);
  if (!waiting.length) { ctx.fillStyle = '#61718a'; ctx.font = '25px system-ui'; ctx.fillText('대기 선수 없음',85,1785); }
  waiting.forEach((player,index) => {
    const col = index % 3, row = Math.floor(index/3);
    const x = 85 + col*320, y = 1790 + row*62;
    const excluded = state.excludedPlayers.includes(player.name);
    ctx.fillStyle = excluded ? '#8d9aae' : '#14243d';
    ctx.font = '25px system-ui';
    const label = fitted(ctx,playerText(state,player.name),285);
    ctx.fillText(label,x,y);
    if (excluded) { ctx.fillRect(x,y-9,Math.min(ctx.measureText(label).width,285),2); }
  });
  return canvas;
}

export async function downloadOrderImage(state,orderName) {
  const canvas = await renderOrderImage(state,orderName);
  const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 변환에 실패했습니다.')),'image/png'));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = String(orderName || 'order').replace(/[\\/:*?"<>|]/g,'_');
  link.download = `hunters_${safeName}.png`;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
