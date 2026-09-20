import { createOrder, toPayload, validateOrder } from './order-model.js';

export const DRAFT_KEY = 'hunters-order-draft-v1';

export function saveDraft(storage, { game, currentId, currentVersion, draft }) {
  const snapshot = {
    version: 2,
    updatedAt: new Date().toISOString(),
    game:{date:game?.date||'',time:game?.time||'',opponent:game?.opponent||''},
    currentId: String(currentId || ''),
    currentVersion: String(currentVersion || ''),
    payload: toPayload(draft)
  };
  storage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function loadDraft(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(DRAFT_KEY)); }
  catch { return null; }
  if (![1,2].includes(saved?.version) ||
      !saved.payload || !Array.isArray(saved.payload.players) ||
      !Array.isArray(saved.payload.startingList) || !saved.payload.positions) return null;
  try {
    const draft = createOrder(saved.payload);
    if (validateOrder(draft).length) return null;
    if(saved.version===1){
      if(typeof saved.currentName!=='string'||typeof saved.currentSavedAt!=='string')return null;
      return {game:{date:'',time:'',opponent:''},currentId:'',currentVersion:saved.currentSavedAt,legacyName:saved.currentName,draft};
    }
    if(!saved.game||['date','time','opponent'].some(key=>typeof saved.game[key]!=='string')||typeof saved.currentId!=='string'||typeof saved.currentVersion!=='string')return null;
    return {game:saved.game,currentId:saved.currentId,currentVersion:saved.currentVersion,draft};
  } catch { return null; }
}

export function clearDraft(storage) { storage.removeItem(DRAFT_KEY); }
