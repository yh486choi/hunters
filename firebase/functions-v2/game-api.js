const {validateGame,toKey,record}=require('./game-contract');
const {validatePayload,resolveSaveTarget}=require('./order-contract');
module.exports=function install({functions,withCors,auth,google,spreadsheetId,sheetName}){
  const rowsFor=async sheets=>(await sheets.spreadsheets.values.get({spreadsheetId,range:`${sheetName}!A2:C`})).data.values||[];
  const read=handler=>functions.https.onRequest(async(req,res)=>{
    res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Methods','GET, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');
    if(req.method==='OPTIONS')return res.status(204).send('');
    if(req.method!=='GET')return res.status(405).json({error:'GET 요청이 필요합니다.'});
    try{const sheets=google.sheets({version:'v4',auth:await auth.getClient()});await handler(req,res,await rowsFor(sheets));}
    catch(error){console.error(error);res.status(500).json({error:'경기 조회에 실패했습니다.'});}
  });
  return {
    getOrdersV3:read(async(req,res,rows)=>res.json(rows.filter(row=>row[0]&&row[2]).map(row=>{const {payload,...summary}=record(row);return summary;}))),
    getOrderV3:read(async(req,res,rows)=>{
      let key;try{key=typeof req.query.legacyName==='string'?req.query.legacyName:toKey(req.query.id);}catch(error){return res.status(400).json({error:error.message});}
      const row=rows.findLast(row=>row[0]===key);res.json(row?record(row):null);
    }),
    saveOrderV3:functions.https.onRequest(withCors(async(req,res,sheets)=>{
      const {id,game,payload,expectedVersion}=req.body||{};
      const invalid=validateGame(game)||validatePayload(payload);if(invalid)return res.status(400).json({status:'실패',error:invalid});
      let key;try{key=toKey(id);}catch(error){return res.status(400).json({status:'실패',error:error.message});}
      const rows=await rowsFor(sheets),target=resolveSaveTarget(rows,key,expectedVersion);
      if(target.error)return res.status(409).json({status:'실패',error:'경기가 변경되었거나 삭제되었습니다. 최신 목록에서 다시 열어 주세요.'});
      if(target.rowNumber<0&&id.startsWith('legacy_'))return res.status(409).json({status:'실패',error:'기존 경기를 찾을 수 없습니다.'});
      const version=new Date().toISOString();
      const next={...payload,game:{date:game.date,time:game.time,opponent:game.opponent.trim()}};
      const values=[[key,version,JSON.stringify(next)]];
      if(target.rowNumber>=2)await sheets.spreadsheets.values.update({spreadsheetId,range:`${sheetName}!A${target.rowNumber}:C${target.rowNumber}`,valueInputOption:'RAW',requestBody:{values}});
      else await sheets.spreadsheets.values.append({spreadsheetId,range:`${sheetName}!A:C`,valueInputOption:'RAW',requestBody:{values}});
      res.json({status:'성공',id,version});
    })),
    deleteOrderV3:functions.https.onRequest(withCors(async(req,res,sheets)=>{
      let key;try{key=toKey(req.body?.id);}catch(error){return res.status(400).json({status:'실패',error:error.message});}
      if(typeof req.body.expectedVersion!=='string')return res.status(400).json({status:'실패',error:'경기 버전이 필요합니다.'});
      const target=resolveSaveTarget(await rowsFor(sheets),key,req.body.expectedVersion);
      if(target.error||target.rowNumber<2)return res.status(409).json({status:'실패',error:'경기가 변경되었거나 삭제되었습니다. 다시 불러오세요.'});
      const data=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets(properties(sheetId,title))'});
      const sheet=data.data.sheets.find(s=>s.properties.title===sheetName);
      await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:[{deleteDimension:{range:{sheetId:sheet.properties.sheetId,dimension:'ROWS',startIndex:target.rowNumber-1,endIndex:target.rowNumber}}}]}});
      res.json({status:'성공'});
    }))
  };
};
