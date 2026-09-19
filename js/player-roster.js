export const ABILITY_FIELDS = [['p','P'],['c','C'],['1b','1B'],['2b','2B'],['3b','3B'],['ss','SS'],['of','OF']];

export function normalizeRoster(players) {
  if (!Array.isArray(players)) throw new Error('선수 목록 형식이 올바르지 않습니다.');
  const names = new Set();
  return players.map(player => {
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    if (!name) throw new Error('선수 이름을 입력하세요.');
    if (names.has(name)) throw new Error('선수 이름이 중복되었습니다.');
    names.add(name);
    const result = { name, num:String(player.num ?? '').trim() };
    for (const [key] of ABILITY_FIELDS) {
      const value = String(player[key] ?? '0');
      if (!['0','1','2'].includes(value)) throw new Error('포지션 값이 올바르지 않습니다.');
      result[key] = value;
    }
    return result;
  });
}
