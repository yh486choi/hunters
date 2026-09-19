const abilityFields = ['p','c','1b','2b','3b','ss','of'];
const columns = ['name','num',...abilityFields,'throws','bats'];

function validatePlayers(players) {
  if (!Array.isArray(players) || players.length === 0) return '선수 목록이 비어 있거나 형식이 올바르지 않습니다.';
  const names = new Set();
  for (const player of players) {
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    if (!name) return '선수 이름을 입력하세요.';
    if (names.has(name)) return '선수 이름이 중복되었습니다.';
    names.add(name);
    if (abilityFields.some(field => !['0','1','2'].includes(String(player[field] ?? '0')))) {
      return '포지션 값이 올바르지 않습니다.';
    }
    if (!['','R','L'].includes(String(player.throws ?? '')) || !['','R','L'].includes(String(player.bats ?? ''))) return '투구·타격 유형이 올바르지 않습니다.';
  }
  return '';
}

function buildRosterRequests(properties, players) {
  const invalid = validatePlayers(players);
  if (invalid) throw new Error(invalid);
  const sheetId = properties?.sheetId;
  const rowCount = properties?.gridProperties?.rowCount;
  const columnCount = properties?.gridProperties?.columnCount;
  if (!Number.isInteger(sheetId) || !Number.isInteger(rowCount) || !Number.isInteger(columnCount)) {
    throw new Error('선수 시트 크기를 확인할 수 없습니다.');
  }
  const rows = [columns,...players.map(player => [
    player.name.trim(),String(player.num ?? ''),...abilityFields.map(field => String(player[field] ?? '0')),String(player.throws ?? ''),String(player.bats ?? '')
  ])];
  const requests = [];
  if (rows.length > rowCount) requests.push({appendDimension:{
    sheetId,dimension:'ROWS',length:rows.length-rowCount
  }});
  if (columns.length > columnCount) requests.push({appendDimension:{
    sheetId,dimension:'COLUMNS',length:columns.length-columnCount
  }});
  requests.push({updateCells:{
    range:{sheetId,startRowIndex:0,endRowIndex:Math.max(rowCount,rows.length),
      startColumnIndex:0,endColumnIndex:columns.length},
    rows:rows.map(row => ({values:row.map(value => ({userEnteredValue:{stringValue:value}}))})),
    fields:'userEnteredValue'
  }});
  return requests;
}

module.exports = { validatePlayers, buildRosterRequests };
