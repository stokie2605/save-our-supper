import { type ReactNode, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebaseConfig';
import type { UserProfile, UserRole } from '../../types/user';

type AuthGuardProps = {
  uid?: string | null;
  fallbackEmail?: string | null;
  allowedRoles?: readonly UserRole[];
  onAccessDenied?: () => void;
  children: ReactNode;
};

type GuardState =
  | { status: 'checking'; profile: null; error: null; message: string }
  | { status: 'allowed'; profile: UserProfile; error: null }
  | { status: 'denied'; profile: UserProfile | null; error: string | null };

const defaultAllowedRoles: readonly UserRole[] = ['volunteer', 'admin'];

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? null;
}

function normalizeUserProfile(uid: string, data: unknown, fallbackEmail?: string | null): UserProfile | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const profileData = data as Partial<UserProfile>;
  const role = typeof profileData.role === 'string' ? profileData.role.trim().toLowerCase() : null;

  if (role !== 'user' && role !== 'volunteer' && role !== 'admin') {
    return null;
  }

  return {
    uid: profileData.uid ?? uid,
    email: profileData.email ?? fallbackEmail ?? 'unknown-user',
    role,
  };
}

export function AuthGuard({
  uid,
  fallbackEmail,
  allowedRoles = defaultAllowedRoles,
  onAccessDenied,
  children,
}: AuthGuardProps) {
  const [guardState, setGuardState] = useState<GuardState>({
    status: 'checking',
    profile: null,
    error: null,
    message: 'Verifying credentials...',
  });

  useEffect(() => {
    let isMounted = true;

    async function checkUserRole() {
      const normalizedFallbackEmail = normalizeEmail(fallbackEmail);

      if (!uid && !normalizedFallbackEmail) {
        setGuardState({
          status: 'checking',
          profile: null,
          error: null,
          message: 'Waiting for your secure session...',
        });
        return;
      }

      setGuardState({
        status: 'checking',
        profile: null,
        error: null,
        message: 'Verifying credentials...',
      });

      try {
        let profile: UserProfile | null = null;

        if (uid) {
          const userSnapshot = await getDoc(doc(db, 'users', uid));
          if (!isMounted) return;

          if (userSnapshot.exists()) {
            profile = normalizeUserProfile(uid, userSnapshot.data(), normalizedFallbackEmail);
          }
        }

        if (!profile && normalizedFallbackEmail) {
          const usersByEmailQuery = query(
            collection(db, 'users'),
            where('email', '==', normalizedFallbackEmail),
          );
          const usersByEmailSnapshot = await getDocs(usersByEmailQuery);
          if (!isMounted) return;

          const matchedUser = usersByEmailSnapshot.docs[0];
          if (matchedUser) {
            profile = normalizeUserProfile(matchedUser.id, matchedUser.data(), normalizedFallbackEmail);
          }
        }

        if (!isMounted) return;

        if (!profile) {
          setGuardState({
            status: 'denied',
            profile: null,
            error: 'Your user profile has not been assigned an operational role yet.',
          });
          return;
        }

        setGuardState(
          allowedRoles.includes(profile.role)
            ? { status: 'allowed', profile, error: null }
            : { status: 'denied', profile, error: null },
        );
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : 'Unable to verify your access role.';
        console.error('Role verification failed:', message);
        setGuardState({ status: 'denied', profile: null, error: message });
      }
    }

    void checkUserRole();

    return () => {
      isMounted = false;
    };
  }, [allowedRoles, fallbackEmail, uid]);

  useEffect(() => {
    if (guardState.status !== 'denied' || !onAccessDenied) return;

    const redirectTimer = window.setTimeout(onAccessDenied, 2200);
    return () => window.clearTimeout(redirectTimer);
  }, [guardState.status, onAccessDenied]);

  if (guardState.status === 'checking') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
        <p className="text-xs font-black uppercase tracking-widest text-teal-700">Checking access</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">{guardState.message}</p>
        <p className="mt-1 text-xs font-medium text-slate-400">Waiting for Firestore role verification to finish.</p>
      </div>
    );
  }

  if (guardState.status === 'denied') {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-10 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-red-600">Access denied</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-red-900">Administrator or volunteer access required</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-red-700">
          {guardState.error ??
            `Your current role is "${guardState.profile?.role ?? 'unknown'}", so this operations area is locked.`}
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-red-500">
          Returning you to the public community feed...
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthGuard;
