const functions = require('firebase-functions');
const { google } = require('googleapis');
const { requireWritePassword } = require('./write-auth');
const { validatePayload, resolveSaveTarget } = require('./order-contract');
const { validatePlayers, buildRosterRequests } = require('./roster-contract');

const SPREADSHEET_ID = process.env.HUNTERS_SPREADSHEET_ID || '1hp4oG9UZLvGVa69jA7jTMptIyjCiDAWYy44HZwssnO0';
const SHEET_DB = '선수DB';
const SHEET_CONFIG = '설정';
const SHEET_ORDERS = 'Orders';
const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });

function withCors(handler) {
  return async (req,res) => {
    res.set('Access-Control-Allow-Origin','*');
    res.set('Access-Control-Allow-Methods','POST, OPTIONS');
    res.set('Access-Control-Allow-Headers','Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    try {
      const client = await auth.getClient();
      const sheets = google.sheets({ version:'v4', auth:client });
      if (!(await requireWritePassword(req,res,sheets,SPREADSHEET_ID,SHEET_CONFIG))) return;
      await handler(req,res,sheets);
    } catch (error) {
      console.error(error);
      res.status(500).json({ status:'실패', error:'서버 오류가 발생했습니다.' });
    }
  };
}

exports.saveOrderV2 = functions.https.onRequest(withCors(async (req,res,sheets) => {
  const { orderName, payload, expectedSavedAt } = req.body || {};
  if (typeof orderName !== 'string' || !orderName.trim() || orderName.length > 120) {
    return res.status(400).json({ status:'실패', error:'오더명을 확인하세요.' });
  }
  const invalid = validatePayload(payload);
  if (invalid) return res.status(400).json({ status:'실패', error:invalid });
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:`${SHEET_ORDERS}!A2:C` })).data.values || [];
  const target = resolveSaveTarget(rows,orderName,expectedSavedAt);
  if (target.error) return res.status(409).json({ status:'실패', error:target.error });
  const rowNumber = target.rowNumber;
  const values = [[orderName,new Date().toISOString(),JSON.stringify(payload)]];
  if (rowNumber >= 2) {
    await sheets.spreadsheets.values.update({ spreadsheetId:SPREADSHEET_ID, range:`${SHEET_ORDERS}!A${rowNumber}:C${rowNumber}`, valueInputOption:'USER_ENTERED', requestBody:{ values } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId:SPREADSHEET_ID, range:`${SHEET_ORDERS}!A:C`, valueInputOption:'USER_ENTERED', requestBody:{ values } });
  }
  return res.json({ status:'성공' });
}));

exports.updatePlayersV2 = functions.https.onRequest(withCors(async (req,res,sheets) => {
  const players = req.body?.players;
  const invalid = validatePlayers(players);
  if (invalid) return res.status(400).json({ status:'실패', error:invalid });
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId:SPREADSHEET_ID,
    fields:'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });
  const sheet = spreadsheet.data.sheets?.find(item => item.properties.title === SHEET_DB);
  if (!sheet) throw new Error('선수 시트를 찾을 수 없습니다.');
  const requests = buildRosterRequests(sheet.properties,players);
  if (req.body.expectedPlayers) {
    const { prepareEdit, fields } = require('./roster-edit');
    const rosterRows = (await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_DB+'!A2:K'})).data.values || [];
    const current = rosterRows.map(row => Object.fromEntries(fields.map((k,i)=>[k,row[i] ?? ''])));
    const orderRows = (await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_ORDERS+'!A2:C'})).data.values || [];
    let changes;
    try { changes=prepareEdit(current,req.body.expectedPlayers,players,req.body.originalNames,orderRows); }
    catch(error) { return res.status(409).json({status:'실패',error:error.message}); }
    const orderSheet=spreadsheet.data.sheets.find(item=>item.properties.title===SHEET_ORDERS);
    for(const change of changes) requests.push({updateCells:{range:{sheetId:orderSheet.properties.sheetId,startRowIndex:change.index+1,endRowIndex:change.index+2,startColumnIndex:1,endColumnIndex:3},rows:[{values:[{userEnteredValue:{stringValue:new Date().toISOString()}},{userEnteredValue:{stringValue:JSON.stringify(change.payload)}}]}],fields:'userEnteredValue'}});
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId:SPREADSHEET_ID,
    requestBody:{ requests }
  });
  return res.json({ status:'성공' });
}));

exports.deleteOrderV2 = functions.https.onRequest(withCors(async (req,res,sheets) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !name) return res.status(400).json({ status:'실패', error:'오더명이 필요합니다.' });
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId:SPREADSHEET_ID, range:`${SHEET_ORDERS}!A2:C` })).data.values || [];
  const rowNumber = rows.findIndex(row => row[0] === name) + 2;
  if (rowNumber < 2) return res.status(404).json({ status:'실패', error:'오더를 찾을 수 없습니다.' });
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId:SPREADSHEET_ID });
  const sheet = spreadsheet.data.sheets.find(item => item.properties.title === SHEET_ORDERS);
  if (!sheet) throw new Error('Orders sheet not found');
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:SPREADSHEET_ID, requestBody:{ requests:[{ deleteDimension:{ range:{ sheetId:sheet.properties.sheetId, dimension:'ROWS', startIndex:rowNumber-1, endIndex:rowNumber } } }] } });
  return res.json({ status:'성공' });
}));



exports.changePasswordV2 = functions.https.onRequest(async (req,res) => {
  res.set('Access-Control-Allow-Origin','*');
  res.set('Access-Control-Allow-Methods','POST, OPTIONS');
  res.set('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    if (req.method !== 'POST') return res.status(405).json({ status:'\uC2E4\uD328', error:'POST request required.' });
    const oldPassword=req.body?.oldPassword, newPassword=req.body?.newPassword;
    if (typeof oldPassword !== 'string' || !oldPassword || typeof newPassword !== 'string' || newPassword.length < 4 || newPassword.length > 120) return res.status(400).json({ status:'\uC2E4\uD328', error:'Old and new passwords are required.' });
    const client=await auth.getClient(); const sheets=google.sheets({version:'v4',auth:client});
    const current=await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_CONFIG+'!B1'});
    if (oldPassword !== (current.data.values?.[0]?.[0] || '')) return res.status(403).json({status:'\uC2E4\uD328',error:'Current password is incorrect.'});
    await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:SHEET_CONFIG+'!B1',valueInputOption:'USER_ENTERED',requestBody:{values:[[newPassword]]}});
    return res.json({status:'\uC131\uACF5'});
  } catch(error) { console.error(error); return res.status(500).json({status:'\uC2E4\uD328',error:'Server error.'}); }
});

function replacePlayerName(payload,oldName,newName) {
  const next=JSON.parse(JSON.stringify(payload));
  if(Array.isArray(next.players)) next.players.forEach(player=>{if(player.name===oldName)player.name=newName;});
  if(next.positions&&typeof next.positions==='object') Object.keys(next.positions).forEach(key=>{if(next.positions[key]===oldName)next.positions[key]=newName;});
  if(Array.isArray(next.startingList)) next.startingList.forEach(row=>{if(row.name===oldName)row.name=newName;});
  if(Array.isArray(next.excludedPlayers)) next.excludedPlayers=next.excludedPlayers.map(name=>name===oldName?newName:name);
  return next;
}

exports.renamePlayerV2 = functions.https.onRequest(withCors(async (req,res,sheets)=>{
  const oldName=typeof req.body?.oldName==='string'?req.body.oldName.trim():'';
  const newName=typeof req.body?.newName==='string'?req.body.newName.trim():'';
  if(!oldName||!newName)return res.status(400).json({status:'\uC2E4\uD328',error:'Both names are required.'});
  if(oldName===newName)return res.json({status:'\uC131\uACF5'});
  const rosterRows=(await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_DB+'!A2:I'})).data.values||[];
  const oldIndex=rosterRows.findIndex(row=>String(row[0]||'').trim()===oldName);
  if(oldIndex<0)return res.status(404).json({status:'\uC2E4\uD328',error:'Player not found.'});
  if(rosterRows.some(row=>String(row[0]||'').trim()===newName))return res.status(409).json({status:'\uC2E4\uD328',error:'New name already exists.'});
  await sheets.spreadsheets.values.update({spreadsheetId:SPREADSHEET_ID,range:SHEET_DB+'!A'+(oldIndex+2),valueInputOption:'USER_ENTERED',requestBody:{values:[[newName]]}});
  const orderRows=(await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_ORDERS+'!A2:C'})).data.values||[]; const updates=[];
  orderRows.forEach((row,index)=>{try{const payload=JSON.parse(row[2]||'{}');const next=replacePlayerName(payload,oldName,newName);if(JSON.stringify(next)!==JSON.stringify(payload))updates.push({range:SHEET_ORDERS+'!C'+(index+2),values:[[JSON.stringify(next)]]});}catch{}});
  if(updates.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{valueInputOption:'USER_ENTERED',data:updates}});
  return res.json({status:'\uC131\uACF5',updatedOrders:updates.length});
}));

exports.deletePlayerV2 = functions.https.onRequest(withCors(async (req,res,sheets)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  if(!name)return res.status(400).json({status:'\uC2E4\uD328',error:'Player name is required.'});
  const rosterRows=(await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_DB+'!A2:I'})).data.values||[];
  const rosterIndex=rosterRows.findIndex(row=>String(row[0]||'').trim()===name);
  if(rosterIndex<0)return res.status(404).json({status:'\uC2E4\uD328',error:'Player not found.'});
  const orderRows=(await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_ORDERS+'!A2:C'})).data.values||[]; const usedIn=[];
  orderRows.forEach(row=>{try{const payload=JSON.parse(row[2]||'{}');if(Array.isArray(payload.players)&&payload.players.some(player=>player?.name===name))usedIn.push(row[0]);}catch{}});
  if(usedIn.length)return res.status(409).json({status:'\uC2E4\uD328',error:'Player is used by an existing order.',orders:usedIn});
  const spreadsheet=await sheets.spreadsheets.get({spreadsheetId:SPREADSHEET_ID,fields:'sheets(properties(sheetId,title))'}); const sheet=spreadsheet.data.sheets?.find(item=>item.properties.title===SHEET_DB); if(!sheet)throw new Error('Roster sheet not found.');
  await sheets.spreadsheets.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{requests:[{deleteDimension:{range:{sheetId:sheet.properties.sheetId,dimension:'ROWS',startIndex:rosterIndex+1,endIndex:rosterIndex+2}}}]}});
  return res.json({status:'\uC131\uACF5'});
}));


exports.getPlayersV2 = functions.https.onRequest(async (req,res) => {
  res.set('Access-Control-Allow-Origin','*');
  res.set('Access-Control-Allow-Methods','GET, OPTIONS');
  res.set('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const client=await auth.getClient(); const sheets=google.sheets({version:'v4',auth:client});
    const rows=(await sheets.spreadsheets.values.get({spreadsheetId:SPREADSHEET_ID,range:SHEET_DB+'!A2:K'})).data.values||[];
    return res.json(rows.map(row=>({name:row[0]||'',num:row[1]||'',p:row[2]||'0',c:row[3]||'0','1b':row[4]||'0','2b':row[5]||'0','3b':row[6]||'0',ss:row[7]||'0',of:row[8]||'0',throws:row[9]||'',bats:row[10]||''})));
  } catch(error) { console.error(error); return res.status(500).json({status:'\uC2E4\uD328',error:'Read error.'}); }
});

Object.assign(exports, require('./game-api')({functions,withCors,auth,google,spreadsheetId:SPREADSHEET_ID,sheetName:SHEET_ORDERS}));
