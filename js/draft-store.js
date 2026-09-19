import { createOrder, toPayload, validateOrder } from './order-model.js';

export const DRAFT_KEY = 'hunters-order-draft-v1';

export function saveDraft(storage, { orderName, currentName, currentSavedAt, draft }) {
  const snapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    orderName: String(orderName || ''),
    currentName: String(currentName || ''),
    currentSavedAt: String(currentSavedAt || ''),
    payload: toPayload(draft)
  };
  storage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function loadDraft(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(DRAFT_KEY)); }
  catch { return null; }
  if (saved?.version !== 1 || typeof saved.orderName !== 'string' ||
      typeof saved.currentName !== 'string' || typeof saved.currentSavedAt !== 'string' ||
      !saved.payload || !Array.isArray(saved.payload.players) ||
      !Array.isArray(saved.payload.startingList) || !saved.payload.positions) return null;
  try {
    const draft = createOrder(saved.payload);
    if (validateOrder(draft).length) return null;
    return { orderName:saved.orderName, currentName:saved.currentName,
      currentSavedAt:saved.currentSavedAt, updatedAt:saved.updatedAt, draft };
  } catch { return null; }
}

export function clearDraft(storage) { storage.removeItem(DRAFT_KEY); }
