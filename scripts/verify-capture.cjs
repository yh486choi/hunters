const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const deps=path.join(process.env.TEMP,'hunters-browser-qa/node_modules');
const {chromium}=require(path.join(deps,'playwright'));
const {PNG}=require(path.join(deps,'pngjs'));
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const players=[{name:'김민수',num:'7',throws:'R',bats:'L',ss:'2'},{name:'박철수',num:'12',throws:'L',bats:'L',of:'2'},{name:'대기선수',num:'30',throws:'R',bats:'R'}];
  const payload={players,positions:{SS:'김민수',LF:'박철수'},startingList:[{name:'김민수'}],excludedPlayers:['대기선수']};
  await page.route('**/api/getPlayersV2',r=>r.fulfill({json:players}));
  await page.route('**/api/getOrders',r=>r.fulfill({json:[{orderName:'캡처 비교',savedAt:'2026-09-20T00:00:00Z'}]}));
  await page.route('**/api/getOrder?*',r=>r.fulfill({json:{orderName:'캡처 비교',savedAt:'2026-09-20T00:00:00Z',payload}}));
  await page.goto('http://127.0.0.1:8765');await page.locator('#allOrders .order-open').click();
  await page.waitForFunction(()=>!document.getElementById('editButton').disabled);
  await page.evaluate(async()=>{
    await import('/vendor/html-to-image.js');
    const original=htmlToImage.toSvg;
    window.capturedPanels=[];
    htmlToImage.toSvg=(node,options)=>{
      capturedPanels.push({controls:node.querySelectorAll('select,input,button').length,rows:node.querySelectorAll('.lineup-table tbody tr').length,highlight:node.querySelectorAll('.position-waiting').length,hands:node.querySelector('.handedness-cell').textContent});
      return original(node,options);
    };
  });
  const baseline={};
  for(const editable of [false,true]) {
    if(editable) await page.locator('#editButton').click();
    for(const width of [1280,390]) for(const dark of [false,true]) {
      await page.setViewportSize({width,height:1000});await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
      const field=page.locator(editable?'#editorField':'#detailField');
      const ratio=await field.evaluate(el=>el.querySelector('.position').getBoundingClientRect().width/(el.clientWidth));
      assert.ok(Math.abs(ratio-.189)<.002,'Position box is 70% of previous 27%');
      const pending=page.waitForEvent('download');await page.locator(editable?'#captureDraftButton':'#captureButton').click();
      const download=await pending;const png=fs.readFileSync(await download.path());const decoded=PNG.sync.read(png);
      assert.equal(decoded.width,880);
      let green=0;
      for(let i=0;i<decoded.data.length;i+=4) if(decoded.data[i+3]>0&&decoded.data[i+1]>decoded.data[i]*1.3&&decoded.data[i+1]>decoded.data[i+2]*1.3) green++;
      assert.ok(green>10000,'Field image must be rendered, not a blank PNG');
      if(!baseline[dark]) baseline[dark]=png;
      else assert.deepEqual(png,baseline[dark],'Same data/theme exports identical PNG across viewing/editing and desktop/mobile');
      fs.writeFileSync(path.join(process.env.TEMP,'hunters-standard-'+(dark?'dark':'light')+'.png'),png);
    }
  }
  const panels=await page.evaluate(()=>capturedPanels);
  assert.equal(panels.length,8);
  for(const p of panels){assert.equal(p.controls,0);assert.equal(p.rows,10);assert.equal(p.highlight,1);assert.equal(p.hands,'\uC6B0\uC88C');}
  await page.locator('#orderName').fill('수정 중인 오더');
  await page.locator('[data-position="SS"]').selectOption('대기선수');
  const changedDownload=page.waitForEvent('download');await page.locator('#captureDraftButton').click();
  const changed=fs.readFileSync(await (await changedDownload).path());
  assert.notDeepEqual(changed,baseline[true],'Edited unsaved data must be exported');
  assert.equal(await page.locator('.capture-export').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: 8 identical read-only exports across entry points/screen widths; theme, handedness, highlight, 70% box width, cleanup and downloads');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
