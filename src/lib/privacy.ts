// ---- Privacy controls (Slice 9) ----
// "Clear local data" wipes every trace Terra Watch keeps in this browser:
// the persisted settings blob (sources, monitors, graph, dossier, analyst
// key) and the IndexedDB snapshot store. There is no server-side copy to
// clear — nothing here has ever left the browser.

export const PERSIST_STORAGE_KEY = 'terra-watch:v2';
export const SNAPSHOTS_DB_NAME = 'terra-watch';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Clears all local storage and reloads so every part of the UI re-derives
 *  from defaults in one consistent pass. */
export async function clearAllLocalData(): Promise<void> {
  localStorage.removeItem(PERSIST_STORAGE_KEY);
  await deleteDatabase(SNAPSHOTS_DB_NAME);
  window.location.reload();
}
