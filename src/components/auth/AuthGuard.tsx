import { type ReactNode, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
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
  | { status: 'checking'; profile: null; error: null }
  | { status: 'allowed'; profile: UserProfile; error: null }
  | { status: 'denied'; profile: UserProfile | null; error: string | null };

const defaultAllowedRoles: readonly UserRole[] = ['volunteer', 'admin'];

function normalizeUserProfile(uid: string, data: unknown, fallbackEmail?: string | null): UserProfile | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const profileData = data as Partial<UserProfile>;
  const role = profileData.role;

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
  });

  useEffect(() => {
    let isMounted = true;

    async function checkUserRole() {
      if (!uid) {
        setGuardState({
          status: 'denied',
          profile: null,
          error: 'No active user session was found.',
        });
        return;
      }

      setGuardState({ status: 'checking', profile: null, error: null });

      try {
        const userSnapshot = await getDoc(doc(db, 'users', uid));
        if (!isMounted) return;

        const profile = normalizeUserProfile(uid, userSnapshot.data(), fallbackEmail);

        if (!userSnapshot.exists() || !profile) {
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
        <p className="text-xs font-black uppercase tracking-widest text-teal-700">Checking access</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">Verifying your foodbank operations role...</p>
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
