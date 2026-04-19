// storage.js - IndexedDB management for preset persistence

const DB_NAME = 'CameraPresetsDB';
const DB_VERSION = 2;
const STORE_NAME = 'presets';

class PresetStorage {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  async saveModification(presetName, modifiedData) {
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await store.put({
      id: `modified_${presetName}`,
      type: 'modification',
      name: presetName,
      data: modifiedData,
      timestamp: Date.now()
    });
  }

  async saveNewPreset(preset) {
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await store.put({
      id: `new_${preset.name}`,
      type: 'new',
      name: preset.name,
      data: preset,
      timestamp: Date.now()
    });
  }

  async saveDeletion(presetName) {
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await store.put({
      id: `deleted_${presetName}`,
      type: 'deletion',
      name: presetName,
      timestamp: Date.now()
    });
  }

  async getAllModifications() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Clear everything - modifications, deletions, AND custom presets
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
      
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clearFactoryPresetModifications() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // First get all records
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const allRecords = getAllRequest.result;
        
        // Delete modifications and deletions, keep new presets
        const deletePromises = [];
        for (const record of allRecords) {
          if (record.type === 'modification' || record.type === 'deletion') {
            const deleteRequest = store.delete(record.id);
            deletePromises.push(new Promise((res, rej) => {
              deleteRequest.onsuccess = () => res();
              deleteRequest.onerror = () => rej(deleteRequest.error);
            }));
          }
        }
        
        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject);
      };
      
      getAllRequest.onerror = () => reject(getAllRequest.error);
      
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async removeModification(presetName) {
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await store.delete(`modified_${presetName}`);
    await store.delete(`deleted_${presetName}`);
  }
}

export const presetStorage = new PresetStorage();