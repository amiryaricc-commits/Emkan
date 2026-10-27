import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';

const IDB_NAME = 'emkan_erp_idb';
const LEGACY_IDB_NAME = 'farapay_erp_idb';
const IDB_VERSION = 2;
const IDB_STORES = [
  'items',
  'parties',
  'customers_suppliers',
  'invoices',
  'stock_ledger_entries',
  'gl_entries',
  'kv_store',
] as const;

export const EMKAN_SYNC_BUS_NAME = 'emkan_sync_bus';
export const FARAPAY_SYNC_BUS_NAME = EMKAN_SYNC_BUS_NAME;

export const TAB_SESSION_ID =
  typeof window !== 'undefined'
    ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    : 'server-session';

function mapStorageKeyToIdbStore(storageKey: string): (typeof IDB_STORES)[number] {
  if (storageKey.includes('inventory-items')) return 'items';
  if (storageKey.includes('customer-contacts') || storageKey.includes('parties')) return 'parties';
  if (storageKey.includes('invoices')) return 'invoices';
  if (storageKey.includes('stock-ledger')) return 'stock_ledger_entries';
  if (storageKey.includes('gl-entries')) return 'gl_entries';
  return 'kv_store';
}

let dbInstancePromise: Promise<IDBDatabase> | null = null;

async function migrateLegacyIdbIfNeeded(newDb: IDBDatabase): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  try {
    const migrated = window.localStorage.getItem('emkan.v1.idb-migrated');
    if (migrated) return;

    const req = window.indexedDB.open(LEGACY_IDB_NAME);
    req.onsuccess = () => {
      const oldDb = req.result;
      const stores = IDB_STORES.filter((s) => oldDb.objectStoreNames.contains(s));
      if (stores.length === 0) {
        oldDb.close();
        try {
          window.localStorage.setItem('emkan.v1.idb-migrated', 'true');
        } catch {}
        return;
      }
      const collected: { storeName: (typeof IDB_STORES)[number]; key: IDBValidKey; value: unknown }[] = [];
      const tx = oldDb.transaction(stores, 'readonly');
      for (const s of stores) {
        const store = tx.objectStore(s);
        const allKeysReq = store.getAllKeys();
        allKeysReq.onsuccess = () => {
          const keys = allKeysReq.result;
          for (const key of keys) {
            const getReq = store.get(key);
            getReq.onsuccess = () => {
              if (getReq.result !== undefined && getReq.result !== null) {
                collected.push({ storeName: s, key, value: getReq.result });
              }
            };
          }
        };
      }
      tx.oncomplete = () => {
        oldDb.close();
        if (collected.length === 0) {
          try {
            window.localStorage.setItem('emkan.v1.idb-migrated', 'true');
          } catch {}
          return;
        }
        try {
          const targetStores = Array.from(new Set(collected.map((c) => c.storeName)));
          const writeTx = newDb.transaction(targetStores, 'readwrite');
          for (const item of collected) {
            const targetKey =
              typeof item.key === 'string' ? item.key.replace(/^farapay\./, 'emkan.') : item.key;
            writeTx.objectStore(item.storeName).put(item.value, targetKey);
            writeTx.objectStore(item.storeName).put(item.value, item.key);
          }
          writeTx.oncomplete = () => {
            try {
              window.localStorage.setItem('emkan.v1.idb-migrated', 'true');
            } catch {}
          };
        } catch {
          // ignore write error
        }
      };
    };
    req.onerror = () => {
      try {
        window.localStorage.setItem('emkan.v1.idb-migrated', 'true');
      } catch {}
    };
  } catch {
    // ignore
  }
}

export function getPersistentDatabase(): Promise<IDBDatabase> {
  if (dbInstancePromise) return dbInstancePromise;

  dbInstancePromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('مرورگر شما از دیتابیس محلی (IndexedDB) پشتیبانی نمی‌کند.'));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of IDB_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbInstancePromise = null;
      };
      db.onerror = () => {
        dbInstancePromise = null;
      };
      void migrateLegacyIdbIfNeeded(db);
      resolve(db);
    };
    request.onerror = () => {
      dbInstancePromise = null;
      reject(request.error || new Error('باز کردن پایگاه داده ناموفق بود.'));
    };
    request.onblocked = () => {
      reject(new Error('ارتقای پایگاه داده توسط یک تب دیگر مسدود شده است.'));
    };
  });

  return dbInstancePromise;
}

export async function readFromIndexedDb<T>(storageKey: string): Promise<T[] | null> {
  const db = await getPersistentDatabase();
  const storeName = mapStorageKeyToIdbStore(storageKey);
  const readKey = (key: string): Promise<T[] | null> =>
    new Promise<T[] | null>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => {
        resolve(Array.isArray(request.result) ? (request.result as T[]) : null);
      };
      request.onerror = () =>
        reject(request.error || new Error(`خطا در خواندن اطلاعات «${key}».`));
      transaction.onabort = () =>
        reject(transaction.error || new Error(`عملیات خواندن «${key}» لغو شد.`));
    });

  let val = await readKey(storageKey);
  if (!val && storageKey.startsWith('emkan.')) {
    const legacyKey = storageKey.replace(/^emkan\./, 'farapay.');
    val = await readKey(legacyKey);
    if (val) {
      await writeToIndexedDb(storageKey, val);
    }
  }
  return val;
}

export async function writeToIndexedDb<T>(storageKey: string, value: T[]): Promise<void> {
  const db = await getPersistentDatabase();
  const storeName = mapStorageKeyToIdbStore(storageKey);
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, storageKey);
    // Also write to legacy key if it begins with emkan. for zero-disruption dual-mode
    if (storageKey.startsWith('emkan.')) {
      transaction.objectStore(storeName).put(value, storageKey.replace(/^emkan\./, 'farapay.'));
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error(`خطا در ذخیره «${storageKey}».`));
    transaction.onabort = () =>
      reject(transaction.error || new Error(`عملیات ذخیره «${storageKey}» لغو شد.`));
  });
}

export function broadcastSnapshotRehydrate(snapshotId: string): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const bus = new BroadcastChannel(EMKAN_SYNC_BUS_NAME);
    bus.postMessage({
      type: 'SNAPSHOT_REHYDRATE',
      snapshotId,
      senderTabId: TAB_SESSION_ID,
      timestamp: Date.now(),
    });
    bus.close();
  } catch {
    // Ignore broadcast error
  }
}

/**
 * Requests persistent storage from browser to prevent storage eviction.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Request persistent storage on startup
if (typeof window !== 'undefined') {
  void requestPersistentStorage();
}

/**
 * Performs an atomic cross-store ACID transaction in IndexedDB across multiple stores.
 * Commits all store updates in a single IndexedDB transaction and broadcasts to peers.
 */
export async function atomicCommitMultiStores(
  entries: { storageKey: string; value: unknown[] }[]
): Promise<void> {
  if (entries.length === 0) return;
  const db = await getPersistentDatabase();
  const storeNames = Array.from(
    new Set(entries.map((e) => mapStorageKeyToIdbStore(e.storageKey)))
  );
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const entry of entries) {
      const storeName = mapStorageKeyToIdbStore(entry.storageKey);
      transaction.objectStore(storeName).put(entry.value, entry.storageKey);
      if (entry.storageKey.startsWith('emkan.')) {
        transaction
          .objectStore(storeName)
          .put(entry.value, entry.storageKey.replace(/^emkan\./, 'farapay.'));
      }
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('تراکنش اتمیک چندجدولی ناموفق بود.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('تراکنش اتمیک چندجدولی لغو شد.'));
  });

  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      const bus = new BroadcastChannel(EMKAN_SYNC_BUS_NAME);
      bus.postMessage({
        type: 'MULTI_STORE_UPDATE',
        senderTabId: TAB_SESSION_ID,
        updates: entries,
      });
      bus.close();
    } catch {
      // Ignore broadcast error
    }
  }
}

/**
 * Atomically reads all IDB stores in a single readonly transaction to ensure consistent backups.
 */
export async function readMultiStoreSnapshot(): Promise<Record<string, unknown[]>> {
  const db = await getPersistentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORES, 'readonly');
    const results: Record<string, unknown[]> = {};
    let remaining = IDB_STORES.length;

    for (const storeName of IDB_STORES) {
      const store = transaction.objectStore(storeName);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      let keysDone = false;
      let valsDone = false;
      let keysResult: IDBValidKey[] = [];
      let valsResult: unknown[] = [];

      const finalizeStore = () => {
        if (!keysDone || !valsDone) return;
        results[storeName] = valsResult;
        results[`${storeName}:entries`] = keysResult.map((k, idx) => ({
          key: String(k),
          value: valsResult[idx],
        }));
        for (let i = 0; i < keysResult.length; i++) {
          const k = String(keysResult[i]);
          if (Array.isArray(valsResult[i])) {
            results[k] = valsResult[i] as unknown[];
          }
        }
        remaining--;
        if (remaining === 0) {
          resolve(results);
        }
      };

      keysReq.onsuccess = () => {
        keysResult = Array.isArray(keysReq.result) ? keysReq.result : [];
        keysDone = true;
        finalizeStore();
      };
      valsReq.onsuccess = () => {
        valsResult = Array.isArray(valsReq.result) ? valsReq.result : [];
        valsDone = true;
        finalizeStore();
      };
      keysReq.onerror = () =>
        reject(keysReq.error || new Error(`خطا در خواندن کلیدهای جدول «${storeName}».`));
      valsReq.onerror = () =>
        reject(valsReq.error || new Error(`خطا در خواندن جدول «${storeName}».`));
    }
    transaction.onerror = () =>
      reject(transaction.error || new Error('تراکنش خواندن یکپارچه پایگاه داده ناموفق بود.'));
  });
}

/**
 * Validates, migrates, and sanitizes backup data across schema versions.
 */
export function migrateAndSanitizeBackupData(payload: unknown): {
  success: boolean;
  sanitized?: Record<string, unknown>;
  error?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'فرمت فایل پشتیبان معتبر نیست.' };
  }
  const obj = payload as Record<string, unknown>;
  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1;

  // Sanitize items
  if (Array.isArray(obj.inventoryItems)) {
    obj.inventoryItems = obj.inventoryItems.map((item: any) => ({
      ...item,
      warehouseStock: item.warehouseStock || { vitrine: item.stockQty || 0 },
      fifoLayers: Array.isArray(item.fifoLayers) ? item.fifoLayers : [],
      valuationRate: Number(item.valuationRate) || 0,
      stockQty: Number(item.stockQty) || 0,
    }));
  }

  return { success: true, sanitized: { ...obj, schemaVersion: Math.max(version, 2) } };
}

export function usePersistentArrayState<T>(
  storageKey: string,
  initialValue: T[]
): [T[], Dispatch<SetStateAction<T[]>>, string | null, () => void, boolean] {
  const [loadedState] = useState(() => {
    try {
      const rawStored = typeof window !== 'undefined'
        ? (window.localStorage.getItem(storageKey) ??
           (storageKey.startsWith('emkan.') ? window.localStorage.getItem(storageKey.replace(/^emkan\./, 'farapay.')) : null))
        : null;

      if (rawStored === null) return { value: initialValue, error: null as string | null };

      const parsedValue: unknown = JSON.parse(rawStored);
      if (Array.isArray(parsedValue)) {
        return { value: parsedValue as T[], error: null as string | null };
      }
      return {
        value: initialValue,
        error: `ساختار داده «${storageKey}» معتبر نیست؛ اطلاعات قبلی حفظ شد.`,
      };
    } catch (error) {
      console.error(`Could not load persisted application state for "${storageKey}".`, error);
      return {
        value: initialValue,
        error: `اطلاعات «${storageKey}» قابل خواندن نیست؛ داده‌های قبلی حفظ شد.`,
      };
    }
  });

  const [value, setValue] = useState<T[]>(loadedState.value);
  const [storageError, setStorageError] = useState<string | null>(loadedState.error);
  const [isHydrated, setIsHydrated] = useState(false);
  const isRemoteSyncRef = useRef(false);

  // Initial Hydration from IndexedDB (with backward compatibility migration from localStorage & legacy farapay keys)
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const persistedValue = await readFromIndexedDb<T>(storageKey);
        if (cancelled) return;
        if (persistedValue) {
          setStorageError(null);
          isRemoteSyncRef.current = true;
          setValue(persistedValue);
        } else if (typeof window !== 'undefined') {
          const rawLocal =
            window.localStorage.getItem(storageKey) ??
            (storageKey.startsWith('emkan.')
              ? window.localStorage.getItem(storageKey.replace(/^emkan\./, 'farapay.'))
              : null);
          if (rawLocal !== null) {
            const parsed: unknown = JSON.parse(rawLocal);
            if (!Array.isArray(parsed)) {
              setStorageError(
                `ساختار داده «${storageKey}» معتبر نیست؛ اطلاعات قبلی حفظ شد.`
              );
            } else {
              await writeToIndexedDb(storageKey, parsed as T[]);
              if (cancelled) return;
              isRemoteSyncRef.current = true;
              setValue(parsed as T[]);
            }
          }
        }
      } catch (error) {
        console.error(`Could not hydrate IndexedDB state for "${storageKey}".`, error);
        if (!cancelled) {
          setStorageError(
            `بازیابی «${storageKey}» ناموفق بود؛ اطلاعات فعلی برای جلوگیری از حذف شدن حفظ گردید.`
          );
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Cross-tab BroadcastChannel synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(EMKAN_SYNC_BUS_NAME);
      channel.onmessage = (ev: MessageEvent) => {
        if (!ev.data) return;
        // Ignore messages sent by this same browser tab instance
        if (ev.data.senderTabId === TAB_SESSION_ID) return;

        if (ev.data.type === 'SNAPSHOT_REHYDRATE') {
          void readFromIndexedDb<T>(storageKey)
            .then((parsed) => {
              if (!parsed) return;
              isRemoteSyncRef.current = true;
              setValue(parsed);
            })
            .catch((error: unknown) => {
              console.error(`Could not rehydrate IndexedDB state for "${storageKey}".`, error);
              setStorageError(`خطا در همگام‌سازی «${storageKey}».`);
            });
          return;
        }

        if (ev.data.type === 'MULTI_STORE_UPDATE' && Array.isArray(ev.data.updates)) {
          const legacyKey = storageKey.startsWith('emkan.') ? storageKey.replace(/^emkan\./, 'farapay.') : storageKey;
          const match = ev.data.updates.find(
            (u: { storageKey: string; value: unknown[] }) =>
              u.storageKey === storageKey || u.storageKey === legacyKey
          );
          if (match && Array.isArray(match.value)) {
            isRemoteSyncRef.current = true;
            setValue(match.value as T[]);
          }
          return;
        }

        const legacyKey = storageKey.startsWith('emkan.') ? storageKey.replace(/^emkan\./, 'farapay.') : storageKey;
        if (
          ev.data.type === 'STORE_UPDATE' &&
          (ev.data.storageKey === storageKey || ev.data.storageKey === legacyKey) &&
          Array.isArray(ev.data.payload)
        ) {
          isRemoteSyncRef.current = true;
          setValue(ev.data.payload as T[]);
        }
      };
    } catch {
      // Ignore if BroadcastChannel is unsupported
    }
    return () => {
      if (channel) channel.close();
    };
  }, [storageKey]);

  // In-Tab Persistence to IndexedDB on State Changes
  useEffect(() => {
    if (!isHydrated) return;
    if (isRemoteSyncRef.current) {
      isRemoteSyncRef.current = false;
      return;
    }
    let cancelled = false;

    const persistState = async () => {
      try {
        await writeToIndexedDb(storageKey, value);
        if (cancelled) return;
        setStorageError(null);

        if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
          try {
            const channel = new BroadcastChannel(EMKAN_SYNC_BUS_NAME);
            channel.postMessage({
              type: 'STORE_UPDATE',
              storageKey,
              senderTabId: TAB_SESSION_ID,
              payload: value,
            });
            channel.close();
          } catch {
            // Ignore broadcast failure
          }
        }
      } catch (error) {
        console.error(`Could not save application state for "${storageKey}".`, error);
        if (!cancelled) {
          setStorageError(
            `ذخیره روی دیتابیس محلی ناموفق بود؛ تغییرات «${storageKey}» هنوز ثبت نهایی نشده‌اند.`
          );
        }
      }
    };

    void persistState();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, storageKey, value]);

  const replaceCorruptedValue = async () => {
    try {
      const persistedValue = await readFromIndexedDb<T>(storageKey);
      if (persistedValue) {
        isRemoteSyncRef.current = true;
        setValue(persistedValue);
        setStorageError(null);
        return;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(storageKey);
        if (storageKey.startsWith('emkan.')) {
          window.localStorage.removeItem(storageKey.replace(/^emkan\./, 'farapay.'));
        }
      }
      setValue(initialValue);
      setStorageError(null);
      setIsHydrated(true);
    } catch (error) {
      console.error(`Could not recover persisted application state for "${storageKey}".`, error);
      setStorageError(`بازیابی «${storageKey}» ناموفق بود؛ هیچ اطلاعاتی حذف نشد.`);
    }
  };

  return [value, setValue, storageError, replaceCorruptedValue, isHydrated];
}
