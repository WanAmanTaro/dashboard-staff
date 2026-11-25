import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type AuthCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { BOOTSTRAP_ADMIN_EMAIL } from '../lib/constants';
import { ensureInitialSystemDefaults, logAudit, sha256Hex } from '../services/firestoreService';
import type { UserAccount, UserInvitation } from '../types/iab';

interface PendingLinkState {
  email: string;
  pendingCredential: AuthCredential;
  message: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userAccount: UserAccount | null;
  loading: boolean;
  authError: string | null;
  pendingLink: PendingLinkState | null;
  clearAuthError: () => void;
  clearPendingLink: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, fullName: string) => Promise<void>;
  completeAccountLinkWithPassword: (password: string) => Promise<void>;
  linkGoogleProviderToCurrentUser: () => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth mesti digunakan dalam AuthProvider.');
  return ctx;
}

function mapAuthErrorToMalay(err: any): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Emel atau kata laluan tidak sah. Sila semak dan cuba semula.';
    case 'auth/email-already-in-use':
      return 'Emel ini telah didaftarkan. Sila log masuk menggunakan kaedah sedia ada atau pautkan akaun.';
    case 'auth/weak-password':
      return 'Kata laluan terlalu lemah. Gunakan sekurang-kurangnya 6 aksara.';
    case 'auth/popup-closed-by-user':
      return 'Tetingkap log masuk Google telah ditutup sebelum selesai.';
    case 'auth/operation-not-allowed':
      return 'Kaedah log masuk Emel/Kata Laluan belum diaktifkan di Firebase Console (Authentication > Sign-in method).';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percubaan log masuk. Sila tunggu beberapa minit sebelum mencuba semula.';
    case 'auth/account-exists-with-different-credential':
      return 'Emel ini sudah berdaftar dengan kata laluan. Sila sahkan kata laluan anda untuk memautkan akaun Google secara selamat.';
    default:
      return err?.message || 'Ralat pengesahan berlaku. Sila cuba semula.';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<PendingLinkState | null>(null);

  const syncOrCreateUserAccount = async (fbUser: FirebaseUser) => {
    const uid = fbUser.uid;
    const email = (fbUser.email || '').toLowerCase().trim();
    const providers = fbUser.providerData.map((p) => p.providerId).filter(Boolean);
    const isBootstrap = email === BOOTSTRAP_ADMIN_EMAIL && fbUser.emailVerified;

    const userRef = doc(db, 'users', uid);
    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${uid}`);
    }

    if (snap.exists()) {
      // Sync auth metadata safely
      try {
        await updateDoc(userRef, {
          displayName: fbUser.displayName || snap.data().displayName || email.split('@')[0],
          emailVerified: fbUser.emailVerified,
          providers: providers.length ? providers : ['password'],
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } catch (err) {
        console.warn('User metadata sync note:', err);
      }
      if (isBootstrap) {
        await ensureInitialSystemDefaults(uid);
      }
      return;
    }

    if (!fbUser.emailVerified) {
      // Unverified email user cannot create Firestore profile until email verified
      setUserAccount(null);
      return;
    }

    // Check pre-approved invitation
    let invite: UserInvitation | null = null;
    if (email) {
      const inviteId = await sha256Hex(email);
      try {
        const invSnap = await getDoc(doc(db, 'invitations', inviteId));
        if (invSnap.exists() && invSnap.data().status === 'invited') {
          invite = invSnap.data() as UserInvitation;
        }
      } catch {
        invite = null;
      }
    }

    const staffId = invite?.staffId || (isBootstrap ? 'IAB-ADMIN-001' : `IAB-STF-${uid.slice(0, 6).toUpperCase()}`);

    try {
      if (invite) {
        const batch = writeBatch(db);
        batch.set(userRef, {
          uid,
          email,
          displayName: invite.fullName || fbUser.displayName || email.split('@')[0],
          staffId,
          role: invite.role,
          isAdmin: invite.isAdmin,
          status: 'active',
          centerId: invite.centerId,
          departmentId: invite.departmentId,
          emailVerified: fbUser.emailVerified,
          providers: providers.length ? providers : ['google.com'],
          invitationId: invite.id,
          lastLoginAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
        });
        batch.update(doc(db, 'invitations', invite.id), {
          status: 'claimed',
          claimedByUid: uid,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
        await batch.commit();
      } else {
        await setDoc(userRef, {
          uid,
          email,
          displayName: fbUser.displayName || email.split('@')[0],
          staffId,
          role: isBootstrap ? 'L1' : 'L5',
          isAdmin: isBootstrap,
          status: isBootstrap ? 'active' : 'pending',
          centerId: isBootstrap ? 'CTR-IAB-INDUK' : '',
          departmentId: isBootstrap ? 'DEPT-KEPIMPINAN' : '',
          emailVerified: fbUser.emailVerified,
          providers: providers.length ? providers : ['google.com'],
          invitationId: '',
          lastLoginAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
        });
      }

      if (isBootstrap) {
        await ensureInitialSystemDefaults(uid);
      }

      await logAudit({
        actionType: 'USER_LOGIN_PROVISION',
        targetType: 'users',
        targetId: uid,
        staffId,
        outcome: 'success',
        details: isBootstrap
          ? 'Akaun Pentadbir Utama (Bootstrap Admin) diaktifkan.'
          : invite
          ? `Akaun diaktifkan melalui jemputan rasmi (${invite.role}).`
          : 'Permohonan akaun baharu direkodkan (menunggu kelulusan Admin).',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }
  };

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUserAccount(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await syncOrCreateUserAccount(fbUser);
        if (fbUser.emailVerified) {
          unsubUserDoc = onSnapshot(
            doc(db, 'users', fbUser.uid),
            (snap) => {
              setUserAccount(snap.exists() ? (snap.data() as UserAccount) : null);
              setLoading(false);
            },
            (err) => {
              console.error('User doc snapshot error:', err);
              setLoading(false);
            }
          );
        } else {
          setUserAccount(null);
          setLoading(false);
        }
      } catch (err: any) {
        setAuthError(err?.message || 'Gagal memuatkan akaun pengguna.');
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);
      await logAudit({
        actionType: 'LOGIN_GOOGLE',
        targetType: 'users',
        targetId: res.user.uid,
        outcome: 'success',
        details: `Log masuk Google berjaya (${res.user.email})`,
      });
    } catch (err: any) {
      if (err?.code === 'auth/account-exists-with-different-credential') {
        const cred = GoogleAuthProvider.credentialFromError(err);
        const email = err?.customData?.email || '';
        if (cred && email) {
          setPendingLink({
            email,
            pendingCredential: cred,
            message: `Emel ${email} sudah berdaftar menggunakan kata laluan. Masukkan kata laluan anda untuk memautkan akaun Google secara selamat.`,
          });
          return;
        }
      }
      setAuthError(mapAuthErrorToMalay(err));
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const res = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (res.user.emailVerified) {
        await logAudit({
          actionType: 'LOGIN_EMAIL',
          targetType: 'users',
          targetId: res.user.uid,
          outcome: 'success',
          details: `Log masuk Emel/Kata Laluan berjaya (${res.user.email})`,
        });
      }
    } catch (err: any) {
      setAuthError(mapAuthErrorToMalay(err));
      throw err;
    }
  };

  const registerWithEmail = async (email: string, password: string, fullName: string) => {
    setAuthError(null);
    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(res.user, { displayName: fullName.trim() });
      await sendEmailVerification(res.user);
    } catch (err: any) {
      setAuthError(mapAuthErrorToMalay(err));
      throw err;
    }
  };

  const completeAccountLinkWithPassword = async (password: string) => {
    if (!pendingLink) return;
    setAuthError(null);
    try {
      const res = await signInWithEmailAndPassword(auth, pendingLink.email, password);
      await linkWithCredential(res.user, pendingLink.pendingCredential);
      await updateDoc(doc(db, 'users', res.user.uid), {
        providers: res.user.providerData.map((p) => p.providerId),
        updatedAt: serverTimestamp(),
        updatedBy: res.user.uid,
      }).catch(() => {});
      await logAudit({
        actionType: 'ACCOUNT_LINKING',
        targetType: 'users',
        targetId: res.user.uid,
        outcome: 'success',
        details: `Pemautan akaun Google dan Emel/Kata Laluan disahkan untuk ${pendingLink.email}`,
      });
      setPendingLink(null);
    } catch (err: any) {
      setAuthError(mapAuthErrorToMalay(err));
      throw err;
    }
  };

  const linkGoogleProviderToCurrentUser = async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      const { linkWithPopup } = await import('firebase/auth');
      const res = await linkWithPopup(auth.currentUser, provider);
      await updateDoc(doc(db, 'users', res.user.uid), {
        providers: res.user.providerData.map((p) => p.providerId),
        updatedAt: serverTimestamp(),
        updatedBy: res.user.uid,
      });
      await logAudit({
        actionType: 'ACCOUNT_LINKING',
        targetType: 'users',
        targetId: res.user.uid,
        outcome: 'success',
        details: 'Memautkan kaedah log masuk Google ke akaun sedia ada.',
      });
    } catch (err: any) {
      setAuthError(mapAuthErrorToMalay(err));
      throw err;
    }
  };

  const sendResetPassword = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      setAuthError(mapAuthErrorToMalay(err));
      throw err;
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err: any) {
      setAuthError(mapAuthErrorToMalay(err));
      throw err;
    }
  };

  const refreshAuthUser = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    setFirebaseUser(updated);
    if (updated.emailVerified) {
      await syncOrCreateUserAccount(updated);
    }
  };

  const logout = async () => {
    if (auth.currentUser?.emailVerified) {
      await logAudit({
        actionType: 'LOGOUT',
        targetType: 'users',
        targetId: auth.currentUser.uid,
        staffId: userAccount?.staffId || '',
        outcome: 'success',
        details: `Log keluar sistem oleh ${auth.currentUser.email}`,
      });
    }
    await signOut(auth);
    setUserAccount(null);
    setPendingLink(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userAccount,
        loading,
        authError,
        pendingLink,
        clearAuthError: () => setAuthError(null),
        clearPendingLink: () => setPendingLink(null),
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        completeAccountLinkWithPassword,
        linkGoogleProviderToCurrentUser,
        sendResetPassword,
        resendVerificationEmail,
        refreshAuthUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
