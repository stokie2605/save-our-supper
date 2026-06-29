import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db, firebaseAuth } from '../lib/firebaseConfig';

export type UserRole = 'pending' | 'partner' | 'active_volunteer' | 'admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  agencyId?: string | null;
  agencyName?: string | null;
  requestedAgencyName?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AuthRoleState {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  error: Error | null;
  isApproved: boolean;
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'pending' || value === 'partner' || value === 'active_volunteer' || value === 'admin';
}

function createPendingProfile(user: User): UserProfile {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role: 'pending',
    agencyId: null,
    agencyName: '',
    requestedAgencyName: '',
  };
}

export function useAuthRole(): AuthRoleState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (authUser) => {
      setLoading(true);
      setError(null);

      try {
        if (!authUser) {
          if (!cancelled) {
            setUser(null);
            setProfile(null);
          }
          return;
        }

        const userRef = doc(db, 'users', authUser.uid);
        const userSnapshot = await getDoc(userRef);

        if (cancelled) {
          return;
        }

        if (!userSnapshot.exists()) {
          const pendingProfile = createPendingProfile(authUser);

          // Firestore rules only allow self-created users to start as pending.
          await setDoc(userRef, {
            ...pendingProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (!cancelled) {
            setUser(authUser);
            setProfile(pendingProfile);
          }

          return;
        }

        const data = userSnapshot.data();

        if (!isUserRole(data.role)) {
          throw new Error(`Invalid role found for user ${authUser.uid}`);
        }

        const loadedProfile: UserProfile = {
          uid: typeof data.uid === 'string' ? data.uid : authUser.uid,
          email: typeof data.email === 'string' || data.email === null ? data.email : authUser.email,
          displayName:
            typeof data.displayName === 'string' || data.displayName === null
              ? data.displayName
              : authUser.displayName,
          photoURL:
            typeof data.photoURL === 'string' || data.photoURL === null
              ? data.photoURL
              : authUser.photoURL,
          role: data.role,
          agencyId: typeof data.agencyId === 'string' ? data.agencyId : null,
          agencyName: typeof data.agencyName === 'string' ? data.agencyName : null,
          requestedAgencyName: typeof data.requestedAgencyName === 'string' ? data.requestedAgencyName : null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };

        if (!cancelled) {
          setUser(authUser);
          setProfile(loadedProfile);
        }
      } catch (unknownError) {
        if (!cancelled) {
          setUser(authUser);
          setProfile(null);
          setError(
            unknownError instanceof Error
              ? unknownError
              : new Error('Failed to load authentication profile')
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const role = profile?.role ?? null;

  return useMemo(
    () => ({
      user,
      profile,
      role,
      loading,
      error,
      isApproved: role === 'partner' || role === 'active_volunteer' || role === 'admin',
    }),
    [user, profile, role, loading, error]
  );
}
