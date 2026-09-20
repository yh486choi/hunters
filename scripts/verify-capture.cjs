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
  for(const editable of [false,true]) {
    if(editable){await page.locator('#editButton').click();await page.locator('#orderName').fill('작성 중 캡처');}
    const id=editable?'editorCapture':'detailCapture';
    for(const width of [1280,390]) for(const dark of [false,true]) {
      await page.setViewportSize({width,height:1000});await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
      const stem=path.join(process.env.TEMP,`hunters-capture-${editable?'edit':'view'}-${width}-${dark?'dark':'light'}`);
      const data=await page.evaluate(async id=>{const {renderOrderImage}=await import('/js/capture.js');return (await renderOrderImage(document.getElementById(id),{pixelRatio:1})).toDataURL();},id);
      const actual=Buffer.from(data.split(',')[1],'base64');fs.writeFileSync(stem+'.png',actual);
      const reference=await page.locator('#'+id).screenshot({path:stem+'-screen.png',style:'.topbar,.bottom-nav{visibility:hidden!important}'});
      const a=PNG.sync.read(actual),b=PNG.sync.read(reference);let diff=0,count=0;
      for(let y=0;y<Math.min(a.height,b.height);y++)for(let x=0;x<Math.min(a.width,b.width);x++)for(let c=0;c<3;c++){diff+=Math.abs(a.data[(y*a.width+x)*4+c]-b.data[(y*b.width+x)*4+c]);count++;}
      console.log(id,width,dark?'dark':'light',`${a.width}x${a.height}`,`screen ${b.width}x${b.height}`,`mean pixel delta ${(diff/count).toFixed(2)}`);
      assert.ok(Math.abs(a.width-b.width)<=1&&Math.abs(a.height-b.height)<=1,'Panel dimensions match');
      assert.ok(diff/count<2,'Captured layout/colors/text closely match browser screenshot');
    }
    const download=page.waitForEvent('download');await page.locator(editable?'#captureDraftButton':'#captureButton').click();
    assert.ok((await download).suggestedFilename().endsWith('.png'));
  }
  assert.deepEqual(errors,[]);console.log('PASS: displayed DOM vs PNG, 8 width/theme/view cases, both downloads, no JS errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
