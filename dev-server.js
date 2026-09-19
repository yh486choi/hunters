import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import contract from './firebase/functions-v2/order-contract.js';
import rosterEdit from './firebase/functions-v2/roster-edit.js';
import { createOrder, toPayload } from './js/order-model.js';
import { normalizeRoster } from './js/player-roster.js';

const root = process.cwd();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png' };
const demoPassword = 'demo';
let players = [
  { name:'김민수',num:'7',p:'0',c:'0','1b':'0','2b':'1','3b':'0',ss:'2',of:'0' },
  { name:'박철수',num:'12',p:'0',c:'0','1b':'0','2b':'2','3b':'0',ss:'1',of:'0' },
  { name:'이영희',num:'18',p:'2',c:'0','1b':'0','2b':'0','3b':'0',ss:'0',of:'0' },
  { name:'최준호',num:'25',p:'1',c:'0','1b':'0','2b':'0','3b':'0',ss:'1',of:'2' },
  { name:'정하늘',num:'3',p:'0',c:'2','1b':'0','2b':'0','3b':'0',ss:'0',of:'0' },
  { name:'오성민',num:'9',p:'0',c:'0','1b':'2','2b':'0','3b':'0',ss:'0',of:'0' },
  { name:'한지훈',num:'21',p:'0',c:'0','1b':'0','2b':'0','3b':'2',ss:'0',of:'0' },
  { name:'강태욱',num:'31',p:'0',c:'0','1b':'0','2b':'0','3b':'0',ss:'0',of:'2' },
  { name:'서도윤',num:'44',p:'0',c:'0','1b':'0','2b':'0','3b':'0',ss:'0',of:'2' }
];
const demoOrder = toPayload(createOrder({
  players:players.map(({name,num}) => ({name,num})),
  positions:{ SS:'김민수','2B':'박철수',P:'이영희',C:'정하늘','1B':'오성민','3B':'한지훈',LF:'강태욱',CF:'최준호',RF:'서도윤' },
  startingList:[
    {name:'김민수'},{name:'박철수'},{name:'최준호'},{name:'오성민'},
    {name:'한지훈'},{name:'정하늘'},{name:'강태욱'},{name:'서도윤'},
    {name:''},{name:'이영희'}
  ]
}));
const orders = new Map([['데모 경기',{ orderName:'데모 경기', savedAt:new Date().toISOString(), payload:demoOrder }]]);
function json(res,code,data) {
  res.writeHead(code,{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
}
async function requestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function api(req,res,url) {
  const name = url.pathname.slice('/api/'.length);
  if (req.method === 'GET') {
    if (name === 'getPlayers' || name === 'getPlayersV2') return json(res,200,players);
    if (name === 'getOrders') return json(res,200,[...orders.values()].map(({orderName,savedAt}) => ({orderName,savedAt})));
    if (name === 'getOrder') return json(res,200,orders.get(url.searchParams.get('name')) || null);
    return json(res,404,{error:'API를 찾을 수 없습니다.'});
  }
  if (req.method !== 'POST' || !['saveOrderV2','updatePlayersV2'].includes(name)) return json(res,405,{status:'실패',error:'허용되지 않은 요청입니다.'});
  let body;
  try { body = await requestBody(req); }
  catch { return json(res,400,{status:'실패',error:'요청 형식이 올바르지 않습니다.'}); }
  if (body.password !== demoPassword) return json(res,403,{status:'실패',error:'데모 비밀번호가 일치하지 않습니다.'});
  if (name === 'updatePlayersV2') {
    try {
      const next = normalizeRoster(body.players);
      const existingOrders = [...orders.values()];
      const changes = body.expectedPlayers ? rosterEdit.prepareEdit(players,body.expectedPlayers,next,body.originalNames,existingOrders.map(order => [order.orderName,order.savedAt,JSON.stringify(order.payload)])) : [];
      for (const change of changes) {
        const order = existingOrders[change.index];
        orders.set(order.orderName,{...order,payload:change.payload,savedAt:new Date().toISOString()});
      }
      players = next;
    }
    catch (error) { return json(res,400,{status:'실패',error:error.message}); }
    return json(res,200,{status:'성공'});
  }
  if (typeof body.orderName !== 'string' || !body.orderName.trim()) return json(res,400,{status:'실패',error:'오더명이 필요합니다.'});
  const invalid = contract.validatePayload(body.payload);
  if (invalid) return json(res,400,{status:'실패',error:invalid});
  const rows = [...orders.values()].map(order => [order.orderName,order.savedAt]);
  const target = contract.resolveSaveTarget(rows,body.orderName,body.expectedSavedAt);
  if (target.error) return json(res,409,{status:'실패',error:target.error});
  orders.set(body.orderName,{orderName:body.orderName,savedAt:new Date().toISOString(),payload:body.payload});
  return json(res,200,{status:'성공'});
}
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req,res,url);
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200,{ 'Content-Type':`${types[extname(file)] || 'application/octet-stream'}; charset=utf-8` }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(8765,'127.0.0.1',() => console.log('http://127.0.0.1:8765'));
