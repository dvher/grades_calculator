import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_SCALE, mergeClasses, mergeSettings, newId, withPresentationDefault, type Scale, type StoredClass,
} from "@grades/calc";
import { api, ApiError } from "./api";
import { applyLocale, type Language } from "./i18n";

const STORAGE_KEY = "grades.data.v1";

export interface SyncAccount {
  serverUrl: string;
  email: string;
  token: string;
  lastSyncAt: number | null;
}

/** Everything the app stores, kept in this browser's localStorage. */
export interface AppData {
  classes: StoredClass[];
  scale: Scale;
  scaleUpdatedAt: number;
  /** Per-device language; null follows the browser. */
  locale: Language | null;
  account: SyncAccount | null;
}

export type SyncStatus = { state: "idle" | "syncing" } | { state: "error"; code: string };

const EMPTY: AppData = { classes: [], scale: DEFAULT_SCALE, scaleUpdatedAt: 0, locale: null, account: null };

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const data: AppData = { ...EMPTY, ...JSON.parse(raw) };
    return { ...data, classes: withPresentationDefault(data.classes, data.scale.pass) };
  } catch {
    return EMPTY;
  }
}

function persist(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable or full: keep working in memory */
  }
}

/** Monotonic timestamp so two quick edits never share an updatedAt. */
let lastStamp = 0;
export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

interface Store {
  data: AppData;
  /** Classes that are not deleted, in display order. */
  classes: StoredClass[];
  syncStatus: SyncStatus;
  createClass: (name: string) => StoredClass;
  updateClass: (id: string, patch: Partial<StoredClass>) => void;
  deleteClass: (id: string) => void;
  setScale: (scale: Scale) => void;
  setLocale: (locale: Language | null) => void;
  signIn: (serverUrl: string, email: string, password: string, register: boolean) => Promise<void>;
  signOut: () => void;
  syncNow: () => Promise<void>;
  importClasses: (classes: StoredClass[], scale?: Scale) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "idle" });
  const dataRef = useRef(data);
  dataRef.current = data;
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => persist(data), [data]);
  useEffect(() => applyLocale(data.locale), [data.locale]);

  const syncNow = useCallback(async () => {
    const account = dataRef.current.account;
    if (!account) return;
    setSyncStatus({ state: "syncing" });
    try {
      const snapshot = dataRef.current;
      const res = await api.sync(account.serverUrl, account.token, {
        classes: snapshot.classes,
        settings: { scale: snapshot.scale, scaleUpdatedAt: snapshot.scaleUpdatedAt },
      });
      // Merge into the *current* state so edits made while the request was in flight are kept.
      setData((cur) => {
        const settings = mergeSettings({ scale: cur.scale, scaleUpdatedAt: cur.scaleUpdatedAt }, res.settings);
        return {
          ...cur,
          classes: mergeClasses(cur.classes, withPresentationDefault(res.classes, cur.scale.pass)),
          ...settings,
          account: cur.account && { ...cur.account, lastSyncAt: Date.now() },
        };
      });
      setSyncStatus({ state: "idle" });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "UNKNOWN";
      if (code === "UNAUTHORIZED") setData((cur) => ({ ...cur, account: null }));
      setSyncStatus({ state: "error", code });
    }
  }, []);

  /** Records a local change and schedules a sync if signed in. */
  const change = useCallback((fn: (d: AppData) => AppData) => {
    setData((cur) => fn(cur));
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncNow(), 1500);
  }, [syncNow]);

  // Sync on start, when the tab regains focus and when the network comes back.
  useEffect(() => {
    void syncNow();
    const onWake = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [syncNow]);

  const store: Store = {
    data,
    classes: data.classes.filter((c) => !c.deleted),
    syncStatus,
    createClass: (name) => {
      const cls: StoredClass = {
        id: newId(), name, examWeight: 30, minExamGrade: dataRef.current.scale.pass,
        minPresentationGrade: dataRef.current.scale.pass, examGrade: null,
        items: [], updatedAt: stamp(), deleted: false,
      };
      change((d) => ({ ...d, classes: [...d.classes, cls] }));
      return cls;
    },
    updateClass: (id, patch) =>
      change((d) => ({ ...d, classes: d.classes.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: stamp() } : c)) })),
    deleteClass: (id) =>
      change((d) => ({ ...d, classes: d.classes.map((c) => (c.id === id ? { ...c, deleted: true, updatedAt: stamp() } : c)) })),
    setScale: (scale) => change((d) => ({ ...d, scale, scaleUpdatedAt: stamp() })),
    setLocale: (locale) => setData((d) => ({ ...d, locale })),
    signIn: async (serverUrl, email, password, register) => {
      const res = register ? await api.register(serverUrl, email, password) : await api.login(serverUrl, email, password);
      const account: SyncAccount = { serverUrl, email: res.user.email, token: res.token, lastSyncAt: null };
      dataRef.current = { ...dataRef.current, account };
      setData((d) => ({ ...d, account }));
      await syncNow();
    },
    signOut: () => {
      setData((d) => ({ ...d, account: null }));
      setSyncStatus({ state: "idle" });
    },
    syncNow,
    importClasses: (classes, scale) =>
      change((d) => ({
        ...d,
        classes: mergeClasses(d.classes, withPresentationDefault(classes, (scale ?? d.scale).pass)),
        ...(scale ? { scale, scaleUpdatedAt: stamp() } : {}),
      })),
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
