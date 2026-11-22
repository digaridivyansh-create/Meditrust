import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  createUserProfile,
  getUserProfile,
  logAuditEvent,
  subscribeOwnerCollection,
  updateUserProfile,
  type WorkspaceData,
} from '../lib/firestoreService';
import {
  fetchLocalWorkspace,
  loginOrCreateLocalEmailAccount,
  restoreLocalEmailSession,
  setLocalSessionToken,
  subscribeLocalWorkspaceChanges,
} from '../lib/localWorkspaceClient';
import { seedStarterPharmacyStock } from '../lib/starterStockSeeder';
import type {
  AuditEvent,
  ChatMessage,
  InventoryBatch,
  InventoryLedgerEntry,
  MedicineScan,
  PortalRole,
  PreferredLanguage,
  Prescription,
  SafetyAlert,
  TraceabilityEvent,
  UserProfile,
  VerifiedDocument,
} from '../types';

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider: 'firebase' | 'email_workspace';
}

interface AuthContextValue {
  user: SessionUser | null;
  profile: UserProfile | null;
  authReady: boolean;
  profileLoading: boolean;
  data: WorkspaceData;
  signInWithGoogle: () => Promise<SessionUser>;
  signInOrCreateWithEmail: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ user: SessionUser; isNewAccount: boolean }>;
  completeOnboarding: (payload: {
    displayName: string;
    portalRole: PortalRole;
    preferredLanguage: PreferredLanguage;
    consentAccepted: boolean;
    pharmacyName?: string;
    licenseNumber?: string;
    city?: string;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileFields: (updates: Parameters<typeof updateUserProfile>[1]) => Promise<void>;
  logout: () => Promise<void>;
}

const EMPTY_DATA: WorkspaceData = {
  scans: [],
  prescriptions: [],
  documents: [],
  batches: [],
  ledger: [],
  traceEvents: [],
  alerts: [],
  chatMessages: [],
  auditEvents: [],
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [data, setData] = useState<WorkspaceData>(EMPTY_DATA);

  const loadFirebaseProfile = useCallback(async (uid: string) => {
    setProfileLoading(true);
    try {
      const p = await getUserProfile(uid);
      setProfile(p);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const syncLocalWorkspace = useCallback(async () => {
    try {
      const snapshot = await fetchLocalWorkspace();
      setProfile(snapshot.profile);
      setData(snapshot.data);
    } catch {
      // ignore transient errors; caller handles explicit failures
    }
  }, []);

  // Initialize auth: check Firebase Auth first, otherwise restore saved Email/Password session
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      if (firebaseUser) {
        setLocalSessionToken(null);
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          provider: 'firebase',
        });
        await loadFirebaseProfile(firebaseUser.uid);
        if (active) setAuthReady(true);
        return;
      }

      // Check if an Email/Password workspace session is stored
      const localUser = await restoreLocalEmailSession();
      if (!active) return;
      if (localUser) {
        setUser({
          uid: localUser.uid,
          email: localUser.email,
          displayName: localUser.displayName,
          provider: 'email_workspace',
        });
        setProfileLoading(true);
        try {
          await syncLocalWorkspace();
        } finally {
          if (active) setProfileLoading(false);
        }
      } else {
        setUser(null);
        setProfile(null);
        setData(EMPTY_DATA);
      }
      if (active) setAuthReady(true);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [loadFirebaseProfile, syncLocalWorkspace]);

  const hasProfile = Boolean(profile);
  const userUid = user?.uid ?? null;
  const userProvider = user?.provider ?? null;

  // Attach real-time Firestore listeners for Firebase users OR live change subscription for Email workspace users
  useEffect(() => {
    if (!authReady || !userUid || !userProvider) {
      setData(EMPTY_DATA);
      return;
    }

    if (userProvider === 'email_workspace') {
      void syncLocalWorkspace();
      const unsubLocal = subscribeLocalWorkspaceChanges(() => {
        void syncLocalWorkspace();
      });
      return () => unsubLocal();
    }

    if (!hasProfile) {
      setData(EMPTY_DATA);
      return;
    }

    const uid = userUid;
    const unsubs = [
      subscribeOwnerCollection<MedicineScan>('scans', uid, (scans) =>
        setData((prev) => ({ ...prev, scans }))
      ),
      subscribeOwnerCollection<Prescription>('prescriptions', uid, (prescriptions) =>
        setData((prev) => ({ ...prev, prescriptions }))
      ),
      subscribeOwnerCollection<VerifiedDocument>('verified_documents', uid, (documents) =>
        setData((prev) => ({ ...prev, documents }))
      ),
      subscribeOwnerCollection<InventoryBatch>('inventory_batches', uid, (batches) =>
        setData((prev) => ({ ...prev, batches }))
      ),
      subscribeOwnerCollection<InventoryLedgerEntry>('inventory_ledger', uid, (ledger) =>
        setData((prev) => ({ ...prev, ledger }))
      ),
      subscribeOwnerCollection<TraceabilityEvent>('traceability_events', uid, (traceEvents) =>
        setData((prev) => ({ ...prev, traceEvents }))
      ),
      subscribeOwnerCollection<SafetyAlert>('alerts', uid, (alerts) =>
        setData((prev) => ({ ...prev, alerts }))
      ),
      subscribeOwnerCollection<ChatMessage>('chat_messages', uid, (chatMessages) =>
        setData((prev) => ({ ...prev, chatMessages }))
      ),
      subscribeOwnerCollection<AuditEvent>('audit_events', uid, (auditEvents) =>
        setData((prev) => ({ ...prev, auditEvents }))
      ),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, userUid, userProvider, hasProfile, syncLocalWorkspace]);

  const signInWithGoogle = useCallback(async (): Promise<SessionUser> => {
    setLocalSessionToken(null);
    const cred = await signInWithPopup(auth, googleProvider);
    const sessionUser: SessionUser = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName,
      provider: 'firebase',
    };
    setUser(sessionUser);
    await loadFirebaseProfile(cred.user.uid);
    return sessionUser;
  }, [loadFirebaseProfile]);

  /**
   * Unified Email + Password login:
   * - Returning email + matching password -> restores all saved progress for that email.
   * - Brand-new email + password -> creates a brand-new account starting completely from scratch.
   * - Wrong password for existing email -> returns clear password mismatch error.
   */
  const signInOrCreateWithEmail = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string
    ): Promise<{ user: SessionUser; isNewAccount: boolean }> => {
      const normalizedEmail = email.trim().toLowerCase();

      // Clear previous Firebase/local sessions cleanly before switching accounts
      if (auth.currentUser) {
        await signOut(auth);
      }
      setLocalSessionToken(null);
      setProfile(null);
      setData(EMPTY_DATA);

      // Try Firebase Email/Password first (if enabled in Firebase Console)
      try {
        const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const sessionUser: SessionUser = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          provider: 'firebase',
        };
        setUser(sessionUser);
        await loadFirebaseProfile(cred.user.uid);
        return { user: sessionUser, isNewAccount: false };
      } catch (err) {
        const code = err instanceof Error ? err.message : String(err);

        // If Firebase Email/Password is enabled but user doesn't exist yet, auto-create fresh Firebase account
        if (code.includes('auth/user-not-found') || code.includes('auth/invalid-credential')) {
          try {
            const created = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
            if (displayName && displayName.trim()) {
              await updateProfile(created.user, { displayName: displayName.trim() });
            }
            const sessionUser: SessionUser = {
              uid: created.user.uid,
              email: created.user.email,
              displayName: displayName?.trim() || created.user.displayName,
              provider: 'firebase',
            };
            setUser(sessionUser);
            await loadFirebaseProfile(created.user.uid);
            return { user: sessionUser, isNewAccount: true };
          } catch (createErr) {
            const createCode = createErr instanceof Error ? createErr.message : String(createErr);
            if (createCode.includes('auth/email-already-in-use')) {
              throw new Error(
                'Incorrect password for this email address. Enter the password originally used for this email, or enter a new email to start fresh.'
              );
            }
            if (!createCode.includes('auth/operation-not-allowed')) {
              throw createErr;
            }
          }
        } else if (!code.includes('auth/operation-not-allowed')) {
          throw err;
        }
      }

      // Firebase Email/Password provider is not enabled yet -> use secure server-backed per-account Email/Password workspace
      const res = await loginOrCreateLocalEmailAccount(normalizedEmail, password, displayName);
      const sessionUser: SessionUser = {
        uid: res.user.uid,
        email: res.user.email,
        displayName: res.user.displayName,
        provider: 'email_workspace',
      };
      setUser(sessionUser);
      setProfileLoading(true);
      try {
        await syncLocalWorkspace();
      } finally {
        setProfileLoading(false);
      }
      return { user: sessionUser, isNewAccount: res.isNewAccount };
    },
    [loadFirebaseProfile, syncLocalWorkspace]
  );

  const completeOnboarding = useCallback(
    async (payload: {
      displayName: string;
      portalRole: PortalRole;
      preferredLanguage: PreferredLanguage;
      consentAccepted: boolean;
      pharmacyName?: string;
      licenseNumber?: string;
      city?: string;
    }) => {
      if (!user) throw new Error('Please sign in first.');
      const uid = user.uid;
      const existing = await getUserProfile(uid);
      if (existing) {
        await updateUserProfile(uid, {
          displayName: payload.displayName,
          portalRole: payload.portalRole,
          preferredLanguage: payload.preferredLanguage,
          consentAccepted: payload.consentAccepted,
          pharmacyName: payload.pharmacyName,
          licenseNumber: payload.licenseNumber,
          city: payload.city,
        });
      } else {
        await createUserProfile({
          uid,
          email: user.email || '',
          displayName: payload.displayName,
          portalRole: payload.portalRole,
          preferredLanguage: payload.preferredLanguage,
          consentAccepted: payload.consentAccepted,
          pharmacyName: payload.pharmacyName,
          licenseNumber: payload.licenseNumber,
          city: payload.city,
          nearExpiryDays: 90,
        });
      }
      await logAuditEvent({
        ownerId: uid,
        portalRole: payload.portalRole,
        actorName: payload.displayName,
        action: existing ? 'PORTAL_WORKSPACE_UPDATED' : 'ACCOUNT_ONBOARDED',
        targetType: 'user_profile',
        targetId: uid,
        details: `Signed into ${payload.portalRole} portal${payload.pharmacyName ? ` (${payload.pharmacyName})` : ''}.`,
      });

      // Automatically pre-load the trained starter stock dataset as the pharmacist's first stock batches
      // when entering the Pharmacist Portal for the first time with an empty inventory.
      if (payload.portalRole === 'pharmacist') {
        const currentBatches =
          user.provider === 'email_workspace'
            ? (await fetchLocalWorkspace()).data.batches
            : data.batches;
        if (currentBatches.length === 0) {
          await seedStarterPharmacyStock({
            ownerId: uid,
            pharmacyName: payload.pharmacyName || 'Authorized Pharmacy',
            actorName: payload.displayName,
            existingBatches: [],
            nearExpiryDays: 90,
          });
        }
      }

      if (user.provider === 'email_workspace') {
        await syncLocalWorkspace();
      } else {
        await loadFirebaseProfile(uid);
      }
    },
    [user, data.batches, loadFirebaseProfile, syncLocalWorkspace]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    if (user.provider === 'email_workspace') {
      await syncLocalWorkspace();
    } else {
      await loadFirebaseProfile(user.uid);
    }
  }, [user, loadFirebaseProfile, syncLocalWorkspace]);

  const updateProfileFields = useCallback(
    async (updates: Parameters<typeof updateUserProfile>[1]) => {
      if (!user) return;
      await updateUserProfile(user.uid, updates);
      if (user.provider === 'email_workspace') {
        await syncLocalWorkspace();
      } else {
        await loadFirebaseProfile(user.uid);
      }
    },
    [user, loadFirebaseProfile, syncLocalWorkspace]
  );

  const logout = useCallback(async () => {
    setLocalSessionToken(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
    setUser(null);
    setProfile(null);
    setData(EMPTY_DATA);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        profileLoading,
        data,
        signInWithGoogle,
        signInOrCreateWithEmail,
        completeOnboarding,
        refreshProfile,
        updateProfileFields,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
