import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'agroscan_offline_db';
const STORE_NAME = 'offline_observations';
const VERSION = 1;

export interface OfflineObservation {
  id: string;
  userId: string;
  metadata: any;
  fileData: string; // base64
  fileType: string;
  capturedAt: string;
  status: 'pending' | 'syncing' | 'error';
  error?: string;
}

export async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export async function saveOfflineObservation(obs: OfflineObservation) {
  const db = await initDB();
  return db.put(STORE_NAME, obs);
}

export async function getOfflineObservations(): Promise<OfflineObservation[]> {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function deleteOfflineObservation(id: string) {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
}

export async function clearOfflineObservations() {
  const db = await initDB();
  return db.clear(STORE_NAME);
}

export async function updateOfflineStatus(id: string, status: 'pending' | 'syncing' | 'error', error?: string) {
  const db = await initDB();
  const obs = await db.get(STORE_NAME, id);
  if (obs) {
    obs.status = status;
    if (error) obs.error = error;
    return db.put(STORE_NAME, obs);
  }
}
