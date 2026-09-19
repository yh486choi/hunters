const fields = ['name','num','p','c','1b','2b','3b','ss','of','throws','bats'];
const normalize = players => players.map(p => fields.map((k,i) => String(p[k] || (i >= 2 && i <= 8 ? '0' : '')).trim()));
function prepareEdit(current, expected, players, originals, orders) {
  if (JSON.stringify(normalize(current)) !== JSON.stringify(normalize(expected))) throw new Error('선수 목록이 변경되었습니다. 원래대로를 눌러 다시 불러오세요.');
  if (!Array.isArray(originals) || originals.length !== players.length) throw new Error('선수 변경 정보가 올바르지 않습니다.');
  const known = new Set(current.map(p => p.name));
  const mapping = new Map();
  originals.forEach((name,i) => { if(name !== null) { if(!known.has(name) || mapping.has(name)) throw new Error('선수 변경 정보가 중복되거나 잘못되었습니다.'); mapping.set(name,players[i].name.trim()); } });
  const removed = new Set([...known].filter(n => !mapping.has(n)));
  const changes = [];
  orders.forEach((row,index) => {
    if (!row[2]) return;
    const payload = JSON.parse(row[2]);
    const rename = name => { if(removed.has(name)) throw new Error('기존 오더에서 사용 중인 선수는 삭제할 수 없습니다: '+name); return mapping.get(name) ?? name; };
    const next = JSON.parse(JSON.stringify(payload));
    (next.players || []).forEach(p => { p.name=rename(p.name); });
    Object.keys(next.positions || {}).forEach(k => { next.positions[k]=rename(next.positions[k]); });
    (next.startingList || []).forEach(p => { p.name=rename(p.name); });
    if(next.excludedPlayers) next.excludedPlayers=next.excludedPlayers.map(rename);
    if(JSON.stringify(next)!==JSON.stringify(payload)) changes.push({index,payload:next});
  });
  return changes;
}
module.exports = { prepareEdit, fields };
