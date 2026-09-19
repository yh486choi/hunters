export const POSITIONS = ['CF', 'LF', 'RF', 'SS', '2B', '3B', '1B', 'P', 'C', 'DH'];
export const POSITION_LABELS = {
  CF: '중견수(CF)', LF: '좌익수(LF)', RF: '우익수(RF)', SS: '유격수(SS)',
  '2B': '2루수(2B)', '3B': '3루수(3B)', '1B': '1루수(1B)',
  P: '투수(P)', C: '포수(C)', DH: '지명타자(DH)'
};

const blankRow = () => ({ name: '', pos: '' });
const playerName = value => String(value ?? '').trim();

export function createOrder(payload = {}) {
  const players = Array.isArray(payload.players)
    ? payload.players.map(p => ({ name: playerName(p?.name), num: String(p?.num ?? '') })).filter(p => p.name)
    : [];
  const positions = Object.fromEntries(POSITIONS.map(pos => [pos, playerName(payload.positions?.[pos])]));
  const incoming = Array.isArray(payload.startingList) ? payload.startingList : [];
  const startingList = Array.from({ length: 10 }, (_, i) => ({
    name: playerName(incoming[i]?.name), pos: String(incoming[i]?.pos ?? '')
  }));
  const excludedPlayers = Array.isArray(payload.excludedPlayers)
    ? payload.excludedPlayers.map(playerName).filter(Boolean)
    : [];
  const state = { players, positions, startingList, excludedPlayers };
  // Some older orders carry the pitcher only in the tenth lineup row.
  if (!state.positions.P && state.startingList[9].name) state.positions.P = state.startingList[9].name;
  syncLineup(state);
  return state;
}

export function toPayload(state) {
  return {
    players: state.players.map(({ name, num }) => ({ name, num })),
    positions: Object.fromEntries(POSITIONS.map(pos => [pos, state.positions[pos] || ''])),
    startingList: state.startingList.map(({ name, pos }) => ({ name: name || '', pos: pos || '' })),
    excludedPlayers: [...state.excludedPlayers]
  };
}

export function validateOrder(state) {
  const errors = [];
  const names = state.players.map(p => p.name);
  if (new Set(names).size !== names.length) errors.push('참가 선수 이름이 중복되었습니다.');
  const known = new Set(names);
  const assignments = new Map();
  for (const pos of POSITIONS) {
    const name = state.positions[pos];
    if (!name) continue;
    if (!assignments.has(name)) assignments.set(name, []);
    assignments.get(name).push(pos);
    if (!known.has(name)) errors.push('참가 명단에 없는 포지션 선수: ' + name);
  }
  if ([...assignments.values()].some(list => list.length > 1 &&
      !(list.length === 2 && list.includes('P') && list.includes('DH')))) {
    errors.push('한 선수가 여러 수비 위치에 배정되었습니다.');
  }
  const batting = state.startingList.slice(0, 9).map(row => row.name).filter(Boolean);
  if (new Set(batting).size !== batting.length) errors.push('한 선수가 여러 타순에 배정되었습니다.');
  for (const name of batting) if (!known.has(name)) errors.push(`참가 명단에 없는 타순 선수: ${name}`);
  if (state.startingList[9].name !== state.positions.P) errors.push('투수 행과 P 포지션이 일치하지 않습니다.');
  for (const name of state.excludedPlayers) if (!known.has(name)) errors.push(`참가 명단에 없는 제외 선수: ${name}`);
  return errors;
}

function copy(state) { return createOrder(toPayload(state)); }
function ensurePlayer(state, name) {
  if (!state.players.some(p => p.name === name)) throw new Error(`참가 명단에 없는 선수: ${name}`);
}
function findPosition(state, name) {
  return POSITIONS.find(pos => state.positions[pos] === name) || '';
}
function syncLineup(state) {
  for (let i = 0; i < 9; i++) {
    const row = state.startingList[i];
    const pos = state.positions.DH === row.name && row.name ? 'DH' : findPosition(state, row.name);
    row.pos = row.name && pos ? POSITION_LABELS[pos] : '';
  }
  state.startingList[9] = {
    name: state.positions.P,
    pos: state.positions.P ? POSITION_LABELS.P : ''
  };
}

export function addPlayer(state, player) {
  const next = copy(state);
  const name = playerName(player?.name);
  if (!name || next.players.some(p => p.name === name)) throw new Error('선수 이름이 비었거나 중복되었습니다.');
  next.players.push({ name, num: String(player?.num ?? '') });
  return next;
}

export function removePlayer(state, name) {
  const next = copy(state);
  next.players = next.players.filter(p => p.name !== name);
  for (const pos of POSITIONS) if (next.positions[pos] === name) next.positions[pos] = '';
  next.startingList = next.startingList.map(row => row.name === name ? blankRow() : row);
  next.excludedPlayers = next.excludedPlayers.filter(n => n !== name);
  syncLineup(next);
  return next;
}

export function assignPosition(state, pos, name) {
  if (!POSITIONS.includes(pos)) throw new Error(`알 수 없는 포지션: ${pos}`);
  const next = copy(state);
  if (!name) {
    next.positions[pos] = '';
    syncLineup(next);
    return next;
  }
  ensurePlayer(next, name);
  const previous = POSITIONS.filter(previousPos => previousPos !== pos && next.positions[previousPos] === name &&
    !((pos === 'P' && previousPos === 'DH') || (pos === 'DH' && previousPos === 'P')));
  const oldPos = previous[0] || '';
  const occupant = next.positions[pos];
  for (const previousPos of previous) next.positions[previousPos] = '';
  if (occupant && occupant !== name) {
    const occupantBats = next.startingList.slice(0, 9).some(row => row.name === occupant);
    const incomingBats = next.startingList.slice(0, 9).some(row => row.name === name);
    if (oldPos && occupantBats && incomingBats) next.positions[oldPos] = occupant;
    else if (occupantBats && !incomingBats) {
      const row = next.startingList.find(row => row.name === occupant);
      row.name = name;
    }
  }
  next.positions[pos] = name;
  next.excludedPlayers = next.excludedPlayers.filter(n => n !== name);
  syncLineup(next);
  return next;
}

export function setBattingPlayer(state, index, name) {
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error('타순은 1~9번이어야 합니다.');
  const next = copy(state);
  if (name) ensurePlayer(next, name);
  const oldName = next.startingList[index].name;
  if (oldName === name) return next;
  const otherIndex = next.startingList.findIndex((row, i) => i !== index && i < 9 && row.name === name);
  if (otherIndex !== -1) {
    next.startingList[otherIndex].name = oldName;
  } else if (name && oldName && !findPosition(next, name)) {
    const oldPos = next.positions.DH === oldName ? 'DH' : findPosition(next, oldName);
    if (oldPos && oldPos !== 'P') next.positions[oldPos] = name;
  }
  next.startingList[index].name = name;
  next.excludedPlayers = next.excludedPlayers.filter(n => n !== name);
  syncLineup(next);
  return next;
}

export function setExcluded(state, name, excluded) {
  const next = copy(state);
  ensurePlayer(next, name);
  next.excludedPlayers = next.excludedPlayers.filter(n => n !== name);
  if (excluded) next.excludedPlayers.push(name);
  return next;
}

export function waitingPlayers(state) {
  const used = new Set(state.startingList.map(row => row.name).filter(Boolean));
  return state.players.filter(p => !used.has(p.name));
}
