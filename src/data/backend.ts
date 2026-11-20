import type { MemberId, PhotoRef, PinTarget } from './types.ts';
import type { Change, Kind, Row, Snapshot, TrashEntry } from '../lib/records.ts';

/**
 * What the store needs from wherever household data lives. The signed-in app uses
 * the Worker's /api (api.ts); the demo build uses an in-memory stand-in (demo/).
 * Both follow the same rules: versioned writes, 409 on a stale version, a trash.
 */
export interface Backend {
  readonly mode: 'live' | 'demo';
  /** Returns null when nothing changed since `etag`. */
  load(etag?: string): Promise<{ snapshot: Snapshot; etag?: string } | null>;
  create(kind: Kind, id: string, data: object, parentId?: string): Promise<Change>;
  update(id: string, version: number, data: object): Promise<Change>;
  remove(id: string, version: number): Promise<Change>;
  restore(ids: string[]): Promise<Change>;
  complete(taskId: string): Promise<Change>;
  reopen(taskId: string): Promise<Change>;
  clearChecked(listId: string, items: Array<{ id: string; version: number }>): Promise<Change>;
  setPins(targets: PinTarget[]): Promise<Change>;
  trash(): Promise<TrashEntry[]>;
  /** Our story: keeps a prepared photo and returns its id; where to show one from. */
  uploadPhoto(blob: Blob, w: number, h: number): Promise<PhotoRef>;
  photoUrl(id: string): string;
  /** Protected values: live only (the demo never stores one). */
  protectedInfo?(recordId: string): Promise<ProtectedInfo>;
  setProtected?(recordId: string, slot: string, value: string): Promise<Change>;
  clearProtected?(recordId: string, slot: string): Promise<Change>;
  reveal?(recordId: string, slot: string): Promise<string>;
  /** Where the ordinary-data export downloads from (live only). */
  readonly exportHref?: string;
  /** Nudges: a short note to the other person, sent to their phones as a notification. */
  nudges(): Promise<Nudge[]>;
  sendNudge(id: string, text: string): Promise<NudgeResult>;
  pushStatus(): Promise<PushStatus>;
  subscribePush(sub: PushSubscriptionJSON): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;
}

export interface Nudge {
  id: string;
  from: MemberId;
  to: MemberId;
  text: string;
  at: string;
  /** How many of the recipient's phones the notification service accepted it for. */
  delivered: number;
}

export interface NudgeResult {
  nudge: Nudge;
  delivered: number;
  /** How many phones the recipient has notifications on for. */
  phones: number;
  /** Whether notifications are set up on the server at all. */
  configured: boolean;
}

export interface PushStatus {
  configured: boolean;
  publicKey: string | null;
  myPhones: number;
  other: { id: MemberId; name: string; phones: number };
}

export interface ProtectedSlotInfo {
  slot: string;
  hasValue: boolean;
  savedBy?: MemberId;
  savedAt?: string;
  lastRevealedBy?: MemberId;
  lastRevealedAt?: string;
}
export interface ProtectedInfo {
  slots: ProtectedSlotInfo[];
}

/** The other member changed it first. `current` is what the server has now. */
export class ConflictError extends Error {
  constructor(readonly current: Row) {
    super('conflict');
  }
}

/** Sign-in problems end the session view rather than a single save. */
export class SessionError extends Error {
  constructor(
    readonly kind: 'expired' | 'not_member' | 'not_configured',
    message: string,
  ) {
    super(message);
  }
}

/** Anything else that stopped a save: the message is safe to show as is. */
export class SaveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'error',
  ) {
    super(message);
  }
}
