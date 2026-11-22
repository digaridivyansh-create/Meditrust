import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express, Request, Response } from 'express';

function resolveWritableDataDir(): string {
  const preferred = path.resolve(process.cwd(), '.meditrust-data');
  try {
    if (!fs.existsSync(preferred)) {
      fs.mkdirSync(preferred, { recursive: true, mode: 0o700 });
    }
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'meditrust-data');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true, mode: 0o700 });
    }
    return fallback;
  }
}

let resolvedDataDir: string | null = null;
function getDataDir(): string {
  if (!resolvedDataDir) {
    resolvedDataDir = resolveWritableDataDir();
  }
  return resolvedDataDir;
}
function getStorePath(): string {
  return path.join(getDataDir(), 'workspace-store.json');
}
function getSecretPath(): string {
  return path.join(getDataDir(), 'session.key');
}

const ALLOWED_COLLECTIONS = new Set([
  'scans',
  'prescriptions',
  'verified_documents',
  'inventory_batches',
  'inventory_ledger',
  'traceability_events',
  'alerts',
  'chat_messages',
  'audit_events',
]);

const APPEND_ONLY_COLLECTIONS = new Set([
  'inventory_ledger',
  'traceability_events',
  'audit_events',
]);

const DELETABLE_COLLECTIONS = new Set([
  'scans',
  'prescriptions',
  'verified_documents',
  'inventory_batches',
  'alerts',
  'chat_messages',
]);

interface StoredAccount {
  uid: string;
  email: string;
  displayName: string;
  salt: string;
  passwordHash: string;
  createdAtMs: number;
}

type StoredDoc = Record<string, unknown> & {
  id: string;
  ownerId: string;
  createdAtMs: number;
  updatedAtMs?: number;
};

interface StoreSchema {
  accounts: Record<string, StoredAccount>; // keyed by normalized lowercase email
  profiles: Record<string, Record<string, unknown>>; // keyed by uid
  collections: Record<string, Record<string, StoredDoc>>; // collectionName -> docId -> doc
}

function ensureDataDir(): void {
  getDataDir();
}

let cachedSecret: string | null = null;
function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24) {
    cachedSecret = process.env.SESSION_SECRET;
    return cachedSecret;
  }
  ensureDataDir();
  const secretPath = getSecretPath();
  if (fs.existsSync(secretPath)) {
    cachedSecret = fs.readFileSync(secretPath, 'utf8').trim();
    if (cachedSecret.length >= 24) return cachedSecret;
  }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(secretPath, cachedSecret, { mode: 0o600 });
  } catch {
    // Keep in-memory secret if filesystem is strictly read-only
  }
  return cachedSecret;
}

function createEmptyStore(): StoreSchema {
  const collections: Record<string, Record<string, StoredDoc>> = {};
  for (const name of ALLOWED_COLLECTIONS) {
    collections[name] = {};
  }
  return {
    accounts: {},
    profiles: {},
    collections,
  };
}

let memoryStore: StoreSchema | null = null;

function readStore(): StoreSchema {
  if (memoryStore) return memoryStore;
  ensureDataDir();
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    memoryStore = createEmptyStore();
    return memoryStore;
  }
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreSchema>;
    const base = createEmptyStore();
    base.accounts = parsed.accounts || {};
    base.profiles = parsed.profiles || {};
    for (const name of ALLOWED_COLLECTIONS) {
      base.collections[name] = parsed.collections?.[name] || {};
    }
    memoryStore = base;
    return memoryStore;
  } catch {
    memoryStore = createEmptyStore();
    return memoryStore;
  }
}

function persistStore(store: StoreSchema): void {
  ensureDataDir();
  const storePath = getStorePath();
  const tmpPath = `${storePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(store), { mode: 0o600 });
    fs.renameSync(tmpPath, storePath);
  } catch {
    // Keep memoryStore active even if filesystem is temporarily read-only
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

interface TokenPayload {
  uid: string;
  email: string;
  exp: number;
}

function signSessionToken(uid: string, email: string): string {
  const payload: TokenPayload = {
    uid,
    email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.uid || !parsed.email || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function authenticateRequest(req: Request, res: Response): TokenPayload | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  const token = header.slice(7).trim();
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return null;
  }
  return session;
}

function isValidEmail(email: string): boolean {
  return email.length >= 3 && email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isSafeDocId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function sortDesc(items: StoredDoc[]): StoredDoc[] {
  return [...items].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export function registerAccountWorkspaceRoutes(app: Express): void {
  // Unified Email + Password Sign-In or Auto-Create Fresh Account
  app.post('/api/v1/auth/email', (req, res) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rawDisplayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 120) : '';

    if (!isValidEmail(rawEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address (e.g. name@gmail.com).' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
      return;
    }

    const store = readStore();
    const existing = store.accounts[rawEmail];

    if (existing) {
      if (!verifyPassword(password, existing.salt, existing.passwordHash)) {
        res.status(401).json({
          error:
            'Incorrect password for this email address. Enter the password originally used for this email, or enter a new email to start a fresh workspace.',
        });
        return;
      }
      const token = signSessionToken(existing.uid, existing.email);
      res.json({
        token,
        isNewAccount: false,
        user: {
          uid: existing.uid,
          email: existing.email,
          displayName: existing.displayName,
        },
      });
      return;
    }

    // Brand-new email -> create brand-new UID with clean empty workspace
    const uid = `usr_${crypto.randomBytes(12).toString('hex')}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const displayName = rawDisplayName || rawEmail.split('@')[0] || 'MediTrust User';

    store.accounts[rawEmail] = {
      uid,
      email: rawEmail,
      displayName,
      salt,
      passwordHash,
      createdAtMs: Date.now(),
    };
    persistStore(store);

    const token = signSessionToken(uid, rawEmail);
    res.status(201).json({
      token,
      isNewAccount: true,
      user: {
        uid,
        email: rawEmail,
        displayName,
      },
    });
  });

  // Restore current session on page reload
  app.get('/api/v1/auth/me', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const store = readStore();
    const account = store.accounts[session.email];
    if (!account || account.uid !== session.uid) {
      res.status(401).json({ error: 'Account session is no longer valid.' });
      return;
    }
    res.json({
      user: {
        uid: account.uid,
        email: account.email,
        displayName: account.displayName,
      },
    });
  });

  // Fetch full owner-isolated workspace snapshot
  app.get('/api/v1/workspace', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const store = readStore();
    const uid = session.uid;
    const byOwner = (colName: string) =>
      sortDesc(
        Object.values(store.collections[colName] || {}).filter((doc) => doc.ownerId === uid)
      );

    res.json({
      profile: store.profiles[uid] || null,
      data: {
        scans: byOwner('scans'),
        prescriptions: byOwner('prescriptions'),
        documents: byOwner('verified_documents'),
        batches: byOwner('inventory_batches'),
        ledger: byOwner('inventory_ledger'),
        traceEvents: byOwner('traceability_events'),
        alerts: byOwner('alerts'),
        chatMessages: byOwner('chat_messages'),
        auditEvents: byOwner('audit_events'),
      },
    });
  });

  // Get own profile
  app.get('/api/v1/workspace/profile', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;
    const store = readStore();
    res.json({ profile: store.profiles[session.uid] || null });
  });

  // Create or update own profile
  app.put('/api/v1/workspace/profile', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const store = readStore();
    const now = Date.now();
    const existing = store.profiles[session.uid];
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

    const merged: Record<string, unknown> = {
      ...(existing || {}),
      ...body,
      uid: session.uid,
      email: session.email,
      createdAtMs: typeof existing?.createdAtMs === 'number' ? existing.createdAtMs : now,
      updatedAtMs: now,
    };

    store.profiles[session.uid] = merged;
    const acc = store.accounts[session.email];
    if (acc && typeof merged.displayName === 'string' && merged.displayName.trim()) {
      acc.displayName = merged.displayName.trim().slice(0, 120);
    }
    persistStore(store);

    res.json({ profile: merged });
  });

  // Create document in owner-scoped collection
  app.post('/api/v1/workspace/collections/:name', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const name = req.params.name;
    if (!ALLOWED_COLLECTIONS.has(name)) {
      res.status(400).json({ error: 'Unsupported collection.' });
      return;
    }

    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const data = req.body?.data && typeof req.body.data === 'object' ? (req.body.data as Record<string, unknown>) : null;
    if (!isSafeDocId(id) || !data) {
      res.status(400).json({ error: 'Valid document id and payload are required.' });
      return;
    }

    const store = readStore();
    const existingDoc = store.collections[name][id];
    if (existingDoc && existingDoc.ownerId !== session.uid) {
      res.status(409).json({ error: 'Document ID conflict.' });
      return;
    }
    const now = Date.now();
    const docRecord: StoredDoc = {
      ...data,
      id,
      ownerId: session.uid,
      createdAtMs: now,
      updatedAtMs: now,
    };

    store.collections[name][id] = docRecord;
    persistStore(store);
    res.status(201).json({ id, doc: docRecord });
  });

  // Update mutable document strictly owned by caller
  app.patch('/api/v1/workspace/collections/:name/:id', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const { name, id } = req.params;
    if (!ALLOWED_COLLECTIONS.has(name) || APPEND_ONLY_COLLECTIONS.has(name)) {
      res.status(403).json({ error: 'This collection is append-only and cannot be modified.' });
      return;
    }
    if (!isSafeDocId(id)) {
      res.status(400).json({ error: 'Invalid document ID.' });
      return;
    }

    const store = readStore();
    const existing = store.collections[name]?.[id];
    if (!existing || existing.ownerId !== session.uid) {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }
    if (name === 'alerts' && existing.status === 'resolved') {
      res.status(403).json({ error: 'Resolved safety alerts are locked for audit integrity.' });
      return;
    }

    const updates = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const nextDoc: StoredDoc = {
      ...existing,
      ...updates,
      id: existing.id,
      ownerId: existing.ownerId,
      createdAtMs: existing.createdAtMs,
      updatedAtMs: Date.now(),
    };

    store.collections[name][id] = nextDoc;
    persistStore(store);
    res.json({ doc: nextDoc });
  });

  // Delete document strictly owned by caller
  app.delete('/api/v1/workspace/collections/:name/:id', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const { name, id } = req.params;
    if (!DELETABLE_COLLECTIONS.has(name)) {
      res.status(403).json({ error: 'Records in this collection cannot be deleted.' });
      return;
    }
    if (!isSafeDocId(id)) {
      res.status(400).json({ error: 'Invalid document ID.' });
      return;
    }

    const store = readStore();
    const existing = store.collections[name]?.[id];
    if (!existing || existing.ownerId !== session.uid) {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }

    delete store.collections[name][id];
    persistStore(store);
    res.json({ deleted: true });
  });

  // Atomic Inventory Receipt (Batch + Ledger + Traceability)
  app.post('/api/v1/workspace/inventory/receive', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const { batchId, ledgerId, traceId, batchDoc, ledgerDoc, traceDoc } = req.body || {};
    if (!isSafeDocId(batchId) || !isSafeDocId(ledgerId) || !isSafeDocId(traceId)) {
      res.status(400).json({ error: 'Valid batch, ledger, and traceability IDs are required.' });
      return;
    }

    const store = readStore();
    const existingBatch = store.collections.inventory_batches[batchId];
    if (existingBatch && existingBatch.ownerId !== session.uid) {
      res.status(409).json({ error: 'Batch ID conflict.' });
      return;
    }
    const now = Date.now();
    store.collections.inventory_batches[batchId] = {
      ...(batchDoc || {}),
      id: batchId,
      ownerId: session.uid,
      createdAtMs: now,
      updatedAtMs: now,
    };
    store.collections.inventory_ledger[ledgerId] = {
      ...(ledgerDoc || {}),
      id: ledgerId,
      batchId,
      ownerId: session.uid,
      createdAtMs: now,
    };
    store.collections.traceability_events[traceId] = {
      ...(traceDoc || {}),
      id: traceId,
      batchId,
      ownerId: session.uid,
      createdAtMs: now,
    };
    persistStore(store);
    res.status(201).json({ batchId });
  });

  // Atomic Inventory Movement (Update Balance + Append Ledger)
  app.post('/api/v1/workspace/inventory/movement', (req, res) => {
    const session = authenticateRequest(req, res);
    if (!session) return;

    const { batchId, ledgerId, newBalance, ledgerDoc } = req.body || {};
    if (!isSafeDocId(batchId) || !isSafeDocId(ledgerId) || typeof newBalance !== 'number') {
      res.status(400).json({ error: 'Invalid stock movement payload.' });
      return;
    }

    const store = readStore();
    const batch = store.collections.inventory_batches[batchId];
    if (!batch || batch.ownerId !== session.uid) {
      res.status(404).json({ error: 'Inventory batch not found.' });
      return;
    }

    const now = Date.now();
    const safeBalance = Math.max(0, Math.min(1000000, Math.round(newBalance)));
    store.collections.inventory_batches[batchId] = {
      ...batch,
      quantityOnHand: safeBalance,
      updatedAtMs: now,
    };
    store.collections.inventory_ledger[ledgerId] = {
      ...(ledgerDoc || {}),
      id: ledgerId,
      batchId,
      resultingBalance: safeBalance,
      ownerId: session.uid,
      createdAtMs: now,
    };
    persistStore(store);
    res.status(201).json({ newBalance: safeBalance });
  });
}
