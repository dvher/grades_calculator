// Local-first data model shared by the web app and the server.
// Kotlin (android) and Swift (ios) ports must pass spec/merge-cases.json.
import type { ClassInput, Scale } from "./index";

/** A class as stored on a device and exchanged with the sync server. */
export interface StoredClass extends ClassInput {
  /** UUID generated on the device. */
  id: string;
  name: string;
  /** Last local modification, ms since epoch. The newest version of a class wins. */
  updatedAt: number;
  /** Deleted classes are kept as tombstones so the deletion syncs to other devices. */
  deleted: boolean;
}

export interface SyncedSettings {
  scale: Scale;
  scaleUpdatedAt: number;
}

/** Classes saved before the presentation check existed get it switched on at the passing grade. */
export function withPresentationDefault(classes: StoredClass[], pass: number): StoredClass[] {
  return classes.map((c) => (c.minPresentationGrade === undefined ? { ...c, minPresentationGrade: pass } : c));
}

/** Per class, keep whichever side has the newer `updatedAt` (ties keep the local copy). */
export function mergeClasses(local: StoredClass[], remote: StoredClass[]): StoredClass[] {
  const merged = new Map<string, StoredClass>();
  for (const c of local) merged.set(c.id, c);
  for (const r of remote) {
    const l = merged.get(r.id);
    if (!l || r.updatedAt > l.updatedAt) merged.set(r.id, r);
  }
  // Keep the local order, then append classes that only exist remotely.
  const order = [...local.map((c) => c.id), ...remote.map((c) => c.id).filter((id) => !local.some((c) => c.id === id))];
  return order.map((id) => merged.get(id)!);
}

export function mergeSettings(local: SyncedSettings, remote: SyncedSettings): SyncedSettings {
  return remote.scaleUpdatedAt > local.scaleUpdatedAt ? remote : local;
}
