// Capture the rendered panel, including current form values and computed styles.
export async function renderOrderImage(panel,{pixelRatio=2}={}) {
  if (!(panel instanceof HTMLElement) || !panel.getClientRects().length) {
    throw new Error('캡처할 오더 화면이 없습니다.');
  }
  await document.fonts.ready;
  await import('../vendor/html-to-image.js');
  const rect=panel.getBoundingClientRect();
  const svgUrl=await globalThis.htmlToImage.toSvg(panel,{
    width:rect.width,height:rect.height,pixelRatio,
    backgroundColor:getComputedStyle(panel).backgroundColor,skipFonts:true
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

export async function downloadOrderImage(panel,orderName) {
  const canvas=await renderOrderImage(panel);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG 변환에 실패했습니다.')),'image/png'));
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.download=`hunters_${String(orderName||'order').replace(/[\\/:*?"<>|]/g,'_')}.png`;
  link.href=url; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
