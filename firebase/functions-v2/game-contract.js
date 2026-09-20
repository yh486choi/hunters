const {randomUUID}=require('node:crypto');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validDate(date){return typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;}
function validateGame(game){
  if(!game||!validDate(game.date))return '경기일을 선택하세요.';
  if(typeof game.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(game.time))return '경기시간을 입력하세요.';
  if(typeof game.opponent!=='string'||!game.opponent.trim()||game.opponent.trim().length>80)return '상대팀명을 80자 이내로 입력하세요.';
  return '';
}
function legacyGame(name){
  let match=String(name).match(/^[^_]+_(\d{2})(\d{2})(\d{2})_(.+)$/);
  if(!match)match=String(name).match(/^(?:20)?(\d{2})-(\d{2})-(\d{2})\s+.*?\bvs\s+(.+)$/i);
  if(!match)return {date:'',time:'',opponent:''};
  const date=`20${match[1]}-${match[2]}-${match[3]}`;
  return {date:validDate(date)?date:'',time:'',opponent:match[4].trim()};
}
function toId(key){return uuid.test(key)?key:'legacy_'+Buffer.from(key).toString('base64url');}
function toKey(id){
  if(typeof id!=='string')throw new Error('경기 ID가 필요합니다.');
  if(uuid.test(id))return id;
  if(/^legacy_[A-Za-z0-9_-]+$/.test(id)){
    const key=Buffer.from(id.slice(7),'base64url').toString('utf8');
    if(toId(key)===id)return key;
  }
  throw new Error('경기 ID가 올바르지 않습니다.');
}
function record(row){
  const payload=JSON.parse(row[2]);
  const game=payload.game||legacyGame(row[0]);
  return {id:toId(row[0]),version:row[1],game:{date:game.date||'',time:game.time||'',opponent:game.opponent||''},payload};
}
module.exports={validateGame,legacyGame,toId,toKey,record,newId:randomUUID};
