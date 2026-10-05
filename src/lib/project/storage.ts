import type { StoredEditorState } from "./types";

const DB_NAME = "kriya-studio";
const DB_VERSION = 1;
const STATE_STORE = "editor-state";
const MEDIA_STORE = "original-media";

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("This browser does not support IndexedDB."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local project storage."));
  });
}

export async function loadEditorState(): Promise<StoredEditorState | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STATE_STORE, "readonly").objectStore(STATE_STORE).get("active");
    request.onsuccess = () => resolve((request.result as StoredEditorState | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not load the saved project."));
  });
}

export async function saveEditorState(state: StoredEditorState): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STATE_STORE, "readwrite");
    transaction.objectStore(STATE_STORE).put(state, "active");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the project."));
  });
}

export async function saveOriginalMedia(key: string, file: Blob): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).put(file, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not persist original media."));
  });
}

export async function getOriginalMedia(key: string): Promise<Blob | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEDIA_STORE, "readonly").objectStore(MEDIA_STORE).get(key);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read original media."));
  });
}
