const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.TEMP,'hunters-browser-qa/node_modules/playwright'));
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'demo':undefined));
  await page.goto('http://127.0.0.1:8765');await page.locator('#allOrders .order-open').first().waitFor();
  assert.equal(await page.locator('#orderName').count(),0);
  assert.deepEqual(await page.locator('.order-list-table th').allTextContents(),['경기일정','상대팀','관리']);
  await page.locator('#newOrderButton').click();
  assert.equal(await page.locator('#gameDate').getAttribute('type'),'date');
  assert.equal(await page.locator('#gameHour option').count(),25);
  assert.deepEqual(await page.locator('#gameMinute option').evaluateAll(opts=>opts.map(o=>o.value)),['','00','10','20','30','40','50']);
  await page.evaluate(async()=>{const m=await import('/js/game-meta.js');m.fillGameForm({time:'23:55'});});
  assert.equal(await page.locator('#gameMinute').inputValue(),'55');
  assert.equal(await page.locator('#gameMinute').evaluate(el=>el.checkValidity()),false);
  await page.locator('#gameMinute').selectOption('50');
  assert.equal(await page.locator('#gameMinute').evaluate(el=>el.checkValidity()),true);
  assert.equal(await page.evaluate(async()=>(await import('/js/game-meta.js')).readGameForm().time),'23:50');
  await page.locator('#gameDate').fill('2026-09-20');await page.locator('#gameHour').selectOption('12');await page.locator('#gameMinute').selectOption('00');await page.locator('#opponent').fill('일정테스트팀');
  await page.reload();await page.locator('#resumeDraftButton').click();assert.equal(await page.locator('#gameHour').inputValue(),'12');assert.equal(await page.locator('#gameMinute').inputValue(),'00');
  await page.locator('#saveButton').click();await page.waitForFunction(()=>!document.getElementById('ordersView').hidden&&document.getElementById('detailTitle').textContent==='일정테스트팀');
  assert.equal(await page.locator('#detailDate').textContent(),'2026-09-20 (일) 12:00');
  const id=new URL(page.url()).searchParams.get('game');assert.ok(id);assert.ok(!page.url().includes('orderName'));
  const count=await page.request.get('http://127.0.0.1:8765/api/getOrdersV3').then(r=>r.json()).then(r=>r.length);
  await page.locator('#editButton').click();await page.locator('#gameDate').fill('2026-09-21');await page.locator('#gameHour').selectOption('18');await page.locator('#gameMinute').selectOption('30');await page.locator('#opponent').fill('변경상대팀');
  await page.locator('#saveButton').click();await page.waitForFunction(()=>document.getElementById('detailTitle').textContent==='변경상대팀'&&!document.getElementById('ordersView').hidden);
  assert.equal(new URL(page.url()).searchParams.get('game'),id);
  assert.equal(await page.request.get('http://127.0.0.1:8765/api/getOrdersV3').then(r=>r.json()).then(r=>r.length),count);
  await page.reload();await page.waitForFunction(()=>document.getElementById('detailTitle').textContent==='변경상대팀');assert.equal(await page.locator('#detailDate').textContent(),'2026-09-21 (월) 18:30');
  let record=await page.request.get('http://127.0.0.1:8765/api/getOrderV3?id='+id).then(r=>r.json());
  const stale=await page.request.post('http://127.0.0.1:8765/api/saveOrderV3',{data:{id,game:record.game,payload:record.payload,password:'demo',expectedVersion:'stale'}});assert.equal(stale.status(),409);
  const pending=page.waitForEvent('download');await page.locator('#captureButton').click();assert.ok((await pending).suggestedFilename().includes('변경상대팀'));
  for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:path.join(process.env.TEMP,'hunters-schedule-mobile.png'),fullPage:true});
  await page.locator('#editButton').click();for(const width of [1280,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:path.join(process.env.TEMP,'hunters-game-form-mobile.png')});
  await page.goto('http://127.0.0.1:8765/?orderName='+encodeURIComponent('데모 경기'));await page.waitForFunction(()=>!document.getElementById('editButton').disabled);assert.ok(new URL(page.url()).searchParams.get('game').startsWith('legacy_'));
  assert.deepEqual(errors,[]);console.log('PASS: date and 24h/10min selects, legacy minute validation, metadata draft/save/reload, stable ID on schedule/opponent changes, no duplicate records, conflict protection, capture filename, legacy link, mobile widths and zero JS errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
