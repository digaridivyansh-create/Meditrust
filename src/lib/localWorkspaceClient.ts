import type { UserProfile } from '../types';
import type { WorkspaceData } from './firestoreService';

const TOKEN_STORAGE_KEY = 'meditrust_email_session_token';

export interface EmailSessionUser {
  uid: string;
  email: string;
  displayName: string;
}

type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();

export function subscribeLocalWorkspaceChanges(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyLocalWorkspaceChanged(): void {
  listeners.forEach((fn) => fn());
}

export function getLocalSessionToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLocalSessionToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function isLocalWorkspaceActive(): boolean {
  return Boolean(getLocalSessionToken());
}

function makeTimestampWrapper(ms: number) {
  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
  };
}

function normalizeDoc<T extends Record<string, unknown>>(doc: T): T {
  const out: Record<string, unknown> = { ...doc };
  if (typeof out.createdAtMs === 'number') {
    out.createdAt = makeTimestampWrapper(out.createdAtMs);
  }
  if (typeof out.updatedAtMs === 'number') {
    out.updatedAt = makeTimestampWrapper(out.updatedAtMs);
  }
  return out as T;
}

async function authedFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getLocalSessionToken();
  if (!token) {
    throw new Error('No active email session.');
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `Request failed (${res.status}).`);
  }
  return json as T;
}

export async function loginOrCreateLocalEmailAccount(
  email: string,
  password: string,
  displayName?: string
): Promise<{ user: EmailSessionUser; isNewAccount: boolean }> {
  const res = await fetch('/api/v1/auth/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || 'Unable to sign in with email.');
  }
  const typed = json as { token: string; user: EmailSessionUser; isNewAccount: boolean };
  setLocalSessionToken(typed.token);
  return { user: typed.user, isNewAccount: typed.isNewAccount };
}

export async function restoreLocalEmailSession(): Promise<EmailSessionUser | null> {
  const token = getLocalSessionToken();
  if (!token) return null;
  try {
    const res = await authedFetch<{ user: EmailSessionUser }>('/api/v1/auth/me');
    return res.user;
  } catch {
    setLocalSessionToken(null);
    return null;
  }
}

export async function fetchLocalWorkspace(): Promise<{
  profile: UserProfile | null;
  data: WorkspaceData;
}> {
  const res = await authedFetch<{
    profile: Record<string, unknown> | null;
    data: Record<string, Array<Record<string, unknown>>>;
  }>('/api/v1/workspace');

  return {
    profile: res.profile ? (normalizeDoc(res.profile) as unknown as UserProfile) : null,
    data: {
      scans: (res.data.scans || []).map(normalizeDoc) as unknown as WorkspaceData['scans'],
      prescriptions: (res.data.prescriptions || []).map(normalizeDoc) as unknown as WorkspaceData['prescriptions'],
      documents: (res.data.documents || []).map(normalizeDoc) as unknown as WorkspaceData['documents'],
      batches: (res.data.batches || []).map(normalizeDoc) as unknown as WorkspaceData['batches'],
      ledger: (res.data.ledger || []).map(normalizeDoc) as unknown as WorkspaceData['ledger'],
      traceEvents: (res.data.traceEvents || []).map(normalizeDoc) as unknown as WorkspaceData['traceEvents'],
      alerts: (res.data.alerts || []).map(normalizeDoc) as unknown as WorkspaceData['alerts'],
      chatMessages: (res.data.chatMessages || []).map(normalizeDoc) as unknown as WorkspaceData['chatMessages'],
      auditEvents: (res.data.auditEvents || []).map(normalizeDoc) as unknown as WorkspaceData['auditEvents'],
    },
  };
}

export async function getLocalProfile(): Promise<UserProfile | null> {
  const res = await authedFetch<{ profile: Record<string, unknown> | null }>('/api/v1/workspace/profile');
  return res.profile ? (normalizeDoc(res.profile) as unknown as UserProfile) : null;
}

export async function saveLocalProfile(payload: Record<string, unknown>): Promise<void> {
  await authedFetch('/api/v1/workspace/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  notifyLocalWorkspaceChanged();
}

export async function createLocalDoc(
  collectionName: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await authedFetch(`/api/v1/workspace/collections/${collectionName}`, {
    method: 'POST',
    body: JSON.stringify({ id, data }),
  });
  notifyLocalWorkspaceChanged();
}

export async function updateLocalDoc(
  collectionName: string,
  id: string,
  updates: Record<string, unknown>
): Promise<void> {
  await authedFetch(`/api/v1/workspace/collections/${collectionName}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  notifyLocalWorkspaceChanged();
}

export async function deleteLocalDoc(collectionName: string, id: string): Promise<void> {
  await authedFetch(`/api/v1/workspace/collections/${collectionName}/${id}`, {
    method: 'DELETE',
  });
  notifyLocalWorkspaceChanged();
}

export async function receiveLocalInventory(payload: {
  batchId: string;
  ledgerId: string;
  traceId: string;
  batchDoc: Record<string, unknown>;
  ledgerDoc: Record<string, unknown>;
  traceDoc: Record<string, unknown>;
}): Promise<void> {
  await authedFetch('/api/v1/workspace/inventory/receive', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  notifyLocalWorkspaceChanged();
}

export async function recordLocalInventoryMovement(payload: {
  batchId: string;
  ledgerId: string;
  newBalance: number;
  ledgerDoc: Record<string, unknown>;
}): Promise<void> {
  await authedFetch('/api/v1/workspace/inventory/movement', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  notifyLocalWorkspaceChanged();
}
