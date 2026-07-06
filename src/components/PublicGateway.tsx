import { type FormEvent, useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { SupportLinks } from './SupportLinks';
import { db, firebaseAuth } from '../lib/firebaseConfig';
import { md5EmailKey, md5PhoneKey } from '../lib/privacy';
import { publicStatusContent } from '../lib/appModel';
import type { PublicBagStatus, PublicStatusResult, PublicView, UserProfile } from '../types';

async function updateProfileDocument(userId: string, payload: Partial<UserProfile>) {
  await setDoc(doc(db, 'users', userId), {
    uid: userId,
    email: payload.email ?? null,
    displayName: payload.name ?? null,
    photoURL: null,
    role: payload.role ?? 'pending',
    agencyId: payload.agencyId ?? null,
    agencyName: payload.agencyName ?? '',
    requestedAgencyName: payload.requestedAgencyName ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function SignInCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [requestedAgencyName, setRequestedAgencyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      if (creating) {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await updateProfileDocument(credential.user.uid, {
          id: credential.user.uid,
          email: credential.user.email ?? email,
          name: name.trim() || credential.user.email || 'New user',
          role: 'pending',
          agencyId: null,
          agencyName: 'Foodbank Hub',
          requestedAgencyName: requestedAgencyName.trim(),
        });
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setDemoLoading(true);
    const demoEmail = 'demo@saveoursupper.org';
    const demoPassword = 'DemoPassword123!';

    try {
      await signInWithEmailAndPassword(firebaseAuth, demoEmail, demoPassword);
    } catch (err: any) {
      try {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, demoEmail, demoPassword);
        await updateProfileDocument(credential.user.uid, {
          id: credential.user.uid,
          email: demoEmail,
          name: 'Demo Guest',
          role: 'active_volunteer',
          agencyId: 'demo-agency',
          agencyName: 'Demo Agency',
          requestedAgencyName: '',
        });
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          setError('Demo credentials are out of sync. Please contact Dean.');
        } else {
          setError('Failed to initialize demo account: ' + createErr.message);
        }
      }
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="card-glass-cyan w-full rounded-3xl p-5 sm:p-6 flex flex-col h-full">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Zero-paperwork access</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-100">
        {creating ? 'Create partner account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Partners submit referrals. Foodbank staff accept them and mark collections.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        {creating ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Agency / Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              required
            />
          </label>
        ) : null}

        {creating ? (
          <label className="grid gap-1.5 text-sm font-bold text-slate-300">
            Organisation / Agency Request
            <input
              value={requestedAgencyName}
              onChange={(event) => setRequestedAgencyName(event.target.value)}
              placeholder="e.g. Plus Dane, school support, GP surgery"
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
              required
            />
          </label>
        ) : null}

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>

        {error ? <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">{error}</p> : null}

        <button className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50">
          {creating ? 'Create Account' : 'Sign In'}
        </button>

        <button
          type="button"
          disabled={demoLoading}
          onClick={handleDemoLogin}
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {demoLoading ? 'Starting Demo...' : 'Try Guest Demo'}
        </button>

        <button
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setError('');
          }}
          className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-300"
        >
          {creating ? 'Already have an account? Sign in' : 'Need an account? Create one'}
        </button>
      </form>
    </div>
  );
}

function CheckStatusForm() {
  const [lookupValue, setLookupValue] = useState('');
  const [result, setResult] = useState<PublicStatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecking(true);
    setResult(null);
    setNotFound(false);
    setError('');

    try {
      const normalizedLookup = lookupValue.trim();
      const lookupKey = normalizedLookup.includes('@') ? md5EmailKey(normalizedLookup) : md5PhoneKey(normalizedLookup);
      if (!lookupKey) {
        setError('Please enter the phone number or email used on your referral.');
        return;
      }

      const statusSnapshot = await getDoc(doc(db, 'public_status', lookupKey));
      if (!statusSnapshot.exists()) {
        setNotFound(true);
        return;
      }

      const data = statusSnapshot.data();
      const bagStatus = String(data.bagStatus ?? 'New');
      const safeStatus: PublicBagStatus = bagStatus === 'Accepted' || bagStatus === 'Ready for Collection' ? bagStatus : 'New';
      setResult({
        bagStatus: safeStatus,
        message: String(data.message ?? publicStatusContent[safeStatus].message),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status could not be checked right now.');
    } finally {
      setChecking(false);
    }
  };

  const statusConfig = result ? publicStatusContent[result.bagStatus] : null;
  const statusSteps: PublicBagStatus[] = ['New', 'Accepted', 'Ready for Collection'];
  const activeStatusIndex = result ? statusSteps.indexOf(result.bagStatus) : -1;

  return (
    <section className="card-glass-base w-full rounded-3xl p-5 sm:p-6 flex flex-col h-full">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Public status check</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">Check Your Bag Status</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Enter the phone number or email used when your referral was made to see the current status of your food parcel.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-bold text-slate-300">
          Phone Number or Email
          <input
            type="text"
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            placeholder="Enter phone number or email"
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-white outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20"
            required
          />
        </label>
        <button
          disabled={checking}
          className="self-end rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Check Status'}
        </button>
      </form>

      <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="pointer-events-none absolute bottom-7 left-8 top-7 w-px bg-gradient-to-b from-blue-500 via-amber-400 to-emerald-400 shadow-[0_0_16px_rgba(6,182,212,0.3)] sm:bottom-auto sm:left-8 sm:right-8 sm:top-8 sm:h-px sm:w-auto sm:bg-gradient-to-r" />
        <div className="relative grid gap-3 sm:grid-cols-3">
          {statusSteps.map((step, index) => {
            const stepConfig = publicStatusContent[step];
            const isActive = activeStatusIndex >= index;
            return (
              <div key={step} className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${isActive ? stepConfig.iconClassName : 'bg-slate-800 text-slate-500'}`}>
                  {index + 1}
                </span>
                <div>
                  <p className={`text-xs font-black uppercase tracking-widest ${isActive ? 'text-slate-100' : 'text-slate-500'}`}>{stepConfig.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{step === 'New' ? 'Received' : step === 'Accepted' ? 'Being Prepared' : 'Ready to Collect'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {checking ? (
        <p className="mt-4 rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-300">Checking your referral status...</p>
      ) : null}

      {error ? <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">{error}</p> : null}

      {notFound ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-800/70 p-4">
          <p className="text-sm font-black text-slate-100">No active referral found</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
            We could not find an active food parcel status for that phone number or email. If you have already collected your parcel, your record has been securely removed.
          </p>
        </div>
      ) : null}

      {result && statusConfig ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-800/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${statusConfig.iconClassName}`}>
              {statusConfig.icon}
            </span>
            <div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusConfig.badgeClassName}`}>
                {statusConfig.label}
              </span>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{result.message}</p>
              <p className="mt-3 text-xs font-bold leading-5 text-slate-400">
                If you have already collected your parcel, your record has been securely removed.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function PublicGateway() {
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const publicBackButton = (
    <button
      type="button"
      onClick={() => setPublicView('landing')}
      className="w-fit rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-black text-cyan-200 shadow-[0_0_18px_rgba(6,182,212,0.14)] hover:bg-cyan-500/20"
    >
      Back to Home
    </button>
  );

  return (
    <section className="grid gap-5">
      {publicView === 'landing' ? (
        <>
          <div className="card-glass-cyan sticky top-20 z-30 mb-1 flex flex-col gap-3 rounded-3xl p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-cyan-400 text-glow-cyan">Save Our Supper</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white text-glow-cyan">Zero-Paperwork Referrals</h1>
              <p className="mt-1 text-sm text-slate-300">Track a food parcel, find support, or sign in as staff.</p>
            </div>
            <button
              type="button"
              onClick={() => setPublicView('login')}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-emerald-600"
            >
              Staff Login
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPublicView('tracker')}
              className="card-glass-cyan rounded-3xl p-6 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/60"
            >
              <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Public tracker</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Track Your Food Parcel</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                Use the phone number or email from the referral to see the current bag status.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPublicView('support')}
              className="card-glass-emerald rounded-3xl p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-300/60"
            >
              <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Local help</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Community Support Links</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                Mental health, debt, housing, benefits, and local Cheshire East support links.
              </p>
            </button>
          </div>
        </>
      ) : null}

      {publicView === 'tracker' ? (
        <div className="grid gap-4">
          {publicBackButton}
          <CheckStatusForm />
        </div>
      ) : null}

      {publicView === 'support' ? (
        <div className="grid gap-4">
          {publicBackButton}
          <SupportLinks publicView />
        </div>
      ) : null}

      {publicView === 'login' ? (
        <div className="grid gap-4">
          {publicBackButton}
          <div className="mx-auto w-full max-w-2xl">
            <SignInCard />
          </div>
        </div>
      ) : null}
    </section>
  );
}