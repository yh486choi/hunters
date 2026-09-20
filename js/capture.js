import { createOrder } from './order-model.js';
import { renderOrderField, renderOrderTables } from './order-views.js';
import {scheduleText,gameTitle} from './game-meta.js';

// Both entry points build the same read-only preview from the current data.
export async function renderOrderImage(state,game,roster=[],{pixelRatio=2}={}) {
  const snapshot=createOrder(state), players=structuredClone(roster);
  const stage=document.createElement('section');
  stage.className='order-preview capture-export';
  stage.setAttribute('aria-hidden','true');stage.inert=true;
  const panel=document.getElementById('detailCapture').cloneNode(true);
  panel.querySelector('#detailTitle').textContent=game?.opponent||'상대팀 미정';
  panel.querySelector('#detailDate').textContent=scheduleText(game);
  renderOrderField(panel.querySelector('#detailField'),snapshot,players);
  renderOrderTables(snapshot,{roster:players,lineupBody:panel.querySelector('#detailLineup'),waitingBody:panel.querySelector('#detailWaiting')});
  panel.removeAttribute('id');panel.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  stage.append(panel);document.body.append(stage);
  try { return await rasterizePanel(stage,pixelRatio); }
  finally { stage.remove(); }
}

async function rasterizePanel(panel,pixelRatio) {
  await document.fonts.ready;
  await import('../vendor/html-to-image.js');
  const rect=panel.getBoundingClientRect();
  const svgUrl=await globalThis.htmlToImage.toSvg(panel,{
    width:rect.width,height:rect.height,pixelRatio,
    backgroundColor:getComputedStyle(panel).backgroundColor,skipFonts:true,
    style:{position:'static',inset:'auto',insetInline:'auto',insetBlock:'auto'}
  });
  // Computed table height includes its caption. Reapplying that height to the
  // cloned table counts the caption twice and stretches/crops the last rows.
  const svg=new DOMParser().parseFromString(decodeURIComponent(svgUrl.split(',')[1]),'image/svg+xml');
  svg.querySelectorAll('table').forEach(table=>{table.style.height='auto';});
  const image=new Image();
  image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(rect.width*pixelRatio);canvas.height=Math.ceil(rect.height*pixelRatio);
  const context=canvas.getContext('2d');
  if(!context) throw new Error('이미지 생성 기능을 사용할 수 없습니다.');
  context.scale(pixelRatio,pixelRatio);context.drawImage(image,0,0,rect.width,rect.height);
  return canvas;
}

export async function downloadOrderImage(state,game,roster) {
  const canvas=await renderOrderImage(state,game,roster);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG 변환에 실패했습니다.')),'image/png'));
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.download=`hunters_${gameTitle(game).replace(/[\\/:*?"<>|]/g,'_')}.png`;
  link.href=url; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
