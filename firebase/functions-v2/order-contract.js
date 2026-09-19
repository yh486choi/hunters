const positions = ['CF','LF','RF','SS','2B','3B','1B','P','C','DH'];

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '오더 데이터가 필요합니다.';
  if (!Array.isArray(payload.players) || !Array.isArray(payload.startingList) ||
      !payload.positions || typeof payload.positions !== 'object' ||
      (payload.excludedPlayers != null && !Array.isArray(payload.excludedPlayers))) {
    return '오더 데이터 형식이 올바르지 않습니다.';
  }
  if (payload.startingList.length !== 10) return '타순은 투수 행을 포함해 10행이어야 합니다.';
  const names = payload.players.map(player => player?.name);
  if (names.some(name => typeof name !== 'string' || !name.trim()) || new Set(names).size !== names.length) {
    return '참가 선수 이름이 비었거나 중복되었습니다.';
  }
  const known = new Set(names);
  if (payload.players.some(player => typeof player.num !== 'string')) return '등번호 형식이 올바르지 않습니다.';
  const assignments = new Map();
  for (const pos of positions) {
    const name = payload.positions[pos] || '';
    if (!name) continue;
    if (typeof name !== 'string' || !known.has(name)) return '수비 포지션에 참가 명단에 없는 선수가 있습니다.';
    if (!assignments.has(name)) assignments.set(name, []);
    assignments.get(name).push(pos);
  }
  if ([...assignments.values()].some(list => list.length > 1 &&
      !(list.length === 2 && list.includes('P') && list.includes('DH')))) {
    return '수비 포지션에 중복된 선수가 있습니다.';
  }
  const batting = payload.startingList.slice(0,9).map(row => row?.name || '').filter(Boolean);
  if (batting.some(name => typeof name !== 'string' || !known.has(name)) || new Set(batting).size !== batting.length) {
    return '타순에 참가 명단에 없는 선수 또는 중복된 선수가 있습니다.';
  }
  if (payload.startingList.some(row => !row || typeof row.name !== 'string' || typeof row.pos !== 'string')) {
    return '타순 행 형식이 올바르지 않습니다.';
  }
  if (payload.startingList[9].name !== (payload.positions.P || '')) return '투수 행과 P 포지션이 일치하지 않습니다.';
  if ((payload.excludedPlayers || []).some(name => !known.has(name))) return '제외 명단에 참가 선수가 아닌 이름이 있습니다.';
  return '';
}

function resolveSaveTarget(rows, orderName, expectedSavedAt) {
  if (expectedSavedAt !== null && typeof expectedSavedAt !== 'string') {
    return { error:'저장 기준 시각이 필요합니다.' };
  }
  const index = rows.findLastIndex(row => row[0] === orderName);
  if (index === -1 && expectedSavedAt !== null) {
    return { error:'오더가 삭제되었거나 이름이 변경되었습니다.' };
  }
  if (index !== -1 && rows[index][1] !== expectedSavedAt) {
    return { error:'오더가 다른 곳에서 변경되었습니다. 다시 불러와 확인하세요.' };
  }
  return { rowNumber:index === -1 ? -1 : index + 2 };
}

module.exports = { validatePayload, resolveSaveTarget };
