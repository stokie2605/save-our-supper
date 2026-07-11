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
    } catch {
      try {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, demoEmail, demoPassword);
        await updateProfileDocument(credential.user.uid, {
          id: credential.user.uid,
          email: demoEmail,
          name: 'Demo Guest',
          role: 'demo_volunteer',
          agencyId: 'demo-agency',
          agencyName: 'Demo Agency',
          requestedAgencyName: '',
        });
      } catch (createErr) {
        const err = createErr as { code?: string; message?: string };
        if (err.code === 'auth/email-already-in-use') {
          setError('Demo credentials are out of sync. Please contact Dean.');
        } else {
          setError('Failed to initialize demo account: ' + (err.message || 'Unknown error'));
        }
      }
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="w-full border border-slate-800 bg-[#070e1e] p-5 sm:p-6 flex flex-col h-full rounded-sm">
      <p className="mono-label text-cyber-cyan font-bold mb-1">Zero-paperwork access</p>
      <h1 className="text-xl font-bold tracking-tight text-white mb-2">
        {creating ? 'Create Partner Account' : 'Sign In'}
      </h1>
      <p className="text-xs text-slate-400 mb-5 leading-normal">
        Partners submit referrals. Foodbank staff accept them and mark collections.
      </p>

      <form onSubmit={handleSubmit} className="grid gap-4">
        {creating && (
          <>
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Agency / Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full border border-slate-800 bg-[#040912] px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                required
              />
            </label>
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Organisation / Agency Request
              <input
                value={requestedAgencyName}
                onChange={(event) => setRequestedAgencyName(event.target.value)}
                placeholder="e.g. Plus Dane, GP surgery"
                className="w-full border border-slate-800 bg-[#040912] px-3 py-2 text-sm text-white placeholder-slate-700 outline-none focus:border-cyber-cyan/50"
                required
              />
            </label>
          </>
        )}

        <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border border-slate-800 bg-[#040912] px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
            required
          />
        </label>

        <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-slate-800 bg-[#040912] px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
            required
          />
        </label>

        {error && <p className="border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-400 font-bold">{error}</p>}

        <button className="w-full bg-cyber-cyan py-2.5 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-cyan-200 transition duration-150 rounded-sm">
          {creating ? 'Create Account' : 'Sign In'}
        </button>

        <button
          type="button"
          disabled={demoLoading}
          onClick={handleDemoLogin}
          className="w-full border border-cyber-teal/30 bg-cyber-teal/5 py-2.5 text-xs font-black uppercase tracking-widest text-cyber-teal hover:bg-cyber-teal/10 transition duration-150 rounded-sm"
        >
          {demoLoading ? 'Starting Demo...' : 'Try Guest Demo'}
        </button>

        <button
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setError('');
          }}
          className="text-xs text-slate-400 hover:text-white transition uppercase font-mono tracking-wider mt-2 text-center"
        >
          {creating ? '[Already have an account? Sign in]' : '[Need an account? Create one]'}
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

  const statusSteps: PublicBagStatus[] = ['New', 'Accepted', 'Ready for Collection'];
  const activeStatusIndex = result ? statusSteps.indexOf(result.bagStatus) : -1;

  // Render Horizontal Timeline for Desktop
  const renderHorizontalTimeline = () => {
    return (
      <div className="relative mt-8 py-2">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-slate-800" />
        <div 
          className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-gradient-to-r from-cyber-cyan via-cyber-blue to-cyber-teal transition-all duration-500" 
          style={{ width: activeStatusIndex === 0 ? '10%' : activeStatusIndex === 1 ? '50%' : activeStatusIndex === 2 ? '100%' : '0%' }}
        />
        
        <div className="relative flex justify-between">
          {statusSteps.map((step, index) => {
            const isActive = activeStatusIndex >= index;
            
            let label = "Waiting";
            let borderClass = "border-slate-800 bg-[#040912]";
            let dotContent = (
              <span className="h-2 w-2 rounded-full bg-slate-700" />
            );

            if (step === 'New') {
              label = "Waiting";
              if (isActive) {
                borderClass = "border-cyber-cyan bg-[#040912] shadow-[0_0_8px_rgba(34,211,238,0.2)]";
                dotContent = (
                  <svg className="h-3.5 w-3.5 text-cyber-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                );
              }
            } else if (step === 'Accepted') {
              label = "Preparing";
              if (isActive) {
                borderClass = "border-amber-500 bg-[#040912] shadow-[0_0_8px_rgba(245,158,11,0.2)]";
                dotContent = (
                  <svg className="h-3.5 w-3.5 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              }
            } else if (step === 'Ready for Collection') {
              label = "Ready";
              if (isActive) {
                borderClass = "border-cyber-teal bg-[#040912] shadow-[0_0_8px_rgba(94,234,212,0.2)]";
                dotContent = (
                  <svg className="h-3.5 w-3.5 text-cyber-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                );
              }
            }

            return (
              <div key={step} className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{label}</span>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-300 ${borderClass}`}>
                  {dotContent}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Vertical Timeline for Mobile
  const renderVerticalTimeline = () => {
    return (
      <div className="relative mt-6 pl-6 flex flex-col gap-6">
        <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-800" />
        
        {statusSteps.map((step, index) => {
          const isActive = activeStatusIndex >= index;
          
          let title = "Referral Received";
          let desc = "Request submitted by Central Social Services.";
          let extra = null;
          let borderClass = "border-slate-800 bg-[#040912]";
          let dotContent = <span className="h-2 w-2 rounded-full bg-slate-700" />;

          if (step === 'New') {
            title = "Referral Received";
            desc = "Request submitted by Central Social Services.";
            extra = <span className="text-[10px] text-slate-500 font-mono">Oct 24, 10:15 AM</span>;
            if (isActive) {
              borderClass = "border-cyber-cyan bg-[#040912]";
              dotContent = (
                <svg className="h-3 w-3 text-cyber-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              );
            }
          } else if (step === 'Accepted') {
            title = "Verification Pending";
            desc = "A volunteer is currently confirming inventory availability at the South Food Bank.";
            extra = (
              <div className="mt-2 border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-500 flex items-center gap-1.5 font-mono">
                <span>⚠</span>
                <span>Average wait time: 15 mins</span>
              </div>
            );
            if (isActive) {
              borderClass = "border-amber-500 bg-[#040912]";
              dotContent = (
                <svg className="h-3 w-3 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8.89M9 11l3 3L22 4" />
                </svg>
              );
            }
          } else if (step === 'Ready for Collection') {
            title = "Voucher Generation";
            desc = "Ready for pickup once verified.";
            if (isActive) {
              borderClass = "border-cyber-teal bg-[#040912]";
              dotContent = (
                <svg className="h-3 w-3 text-cyber-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              );
            }
          }

          return (
            <div key={step} className="relative flex gap-4">
              <span className={`absolute -left-[21px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${borderClass}`}>
                {dotContent}
              </span>
              <div>
                <h4 className={`text-xs font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>{title}</h4>
                <p className="text-xs text-slate-400 leading-normal mt-0.5">{desc}</p>
                {extra}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="w-full border border-slate-800 bg-[#070e1e] p-5 md:p-6 rounded-sm flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start">
          <div>
            <p className="mono-label text-cyber-cyan font-bold mb-1">Anonymous Tracker</p>
            <p className="text-xs text-slate-500 font-mono">Reference ID: <span className="text-cyber-cyan font-bold select-all">SOS-8821-X</span></p>
          </div>
          <span className="border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[9px] font-bold text-amber-500 uppercase font-mono">
            Priority High
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Phone Number or Email
            <input
              type="text"
              value={lookupValue}
              onChange={(event) => setLookupValue(event.target.value)}
              placeholder="e.g. SOS-8821-XP"
              className="w-full border border-slate-800 bg-[#040912] px-3 py-2.5 text-xs text-white outline-none focus:border-cyber-cyan/50"
              required
            />
          </label>
          <button
            disabled={checking}
            className="self-end bg-cyber-cyan px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-200 disabled:opacity-50 h-10 rounded-sm"
          >
            {checking ? 'Checking...' : 'Track Status'}
          </button>
        </form>

        {/* Timelines (Horizontal desktop / Vertical mobile) */}
        <div className="hidden md:block">{renderHorizontalTimeline()}</div>
        <div className="block md:hidden">{renderVerticalTimeline()}</div>

        {/* Info alert box */}
        <div className="mt-8 border border-cyber-blue/20 bg-cyber-blue/5 p-3 flex gap-3 text-xs leading-normal">
          <span className="text-cyber-blue select-none">ℹ</span>
          <div>
            <p className="text-slate-300">
              A volunteer at <span className="text-cyber-cyan font-bold">Downtown Community Hub</span> is currently preparing your support package.
            </p>
            <p className="text-[10px] text-cyber-blue mt-1 font-mono uppercase">
              Estimated completion: 8 minutes
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4 flex flex-col gap-3">
        {error && <p className="border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-400 font-bold">{error}</p>}
        {notFound && (
          <div className="border border-slate-800 bg-slate-950/40 p-3 text-xs">
            <p className="font-bold text-white mb-0.5">No active referral found</p>
            <p className="text-slate-400">We could not find an active referral for those details.</p>
          </div>
        )}

        <button className="w-full border border-cyber-cyan/35 py-2.5 text-xs font-bold uppercase tracking-wider text-cyber-cyan hover:bg-cyber-cyan/10 transition flex items-center justify-center gap-2 rounded-sm">
          {/* Barcode/QR icon */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 4h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Show Pickup Token</span>
        </button>
      </div>
    </section>
  );
}

export function PublicGateway({
  publicView: propPublicView,
  setPublicView: propSetPublicView
}: {
  publicView?: PublicView;
  setPublicView?: (view: PublicView) => void;
}) {
  const [internalPublicView, setInternalPublicView] = useState<PublicView>('landing');
  const publicView = propPublicView ?? internalPublicView;
  const setPublicView = propSetPublicView ?? setInternalPublicView;

  // MOBILE BOTTOM BAR TABS WRAPPER
  const renderMobileBottomNav = () => {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-[#070e1e] flex md:hidden h-14">
        <button
          onClick={() => setPublicView('landing')}
          className={`flex-1 flex flex-col items-center justify-center text-[10px] font-bold uppercase tracking-wider transition ${
            publicView === 'landing' ? 'text-cyber-cyan border-t-2 border-cyber-cyan' : 'text-slate-500'
          }`}
        >
          <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Refer
        </button>
        <button
          onClick={() => setPublicView('tracker')}
          className={`flex-1 flex flex-col items-center justify-center text-[10px] font-bold uppercase tracking-wider transition ${
            publicView === 'tracker' ? 'text-cyber-cyan border-t-2 border-cyber-cyan' : 'text-slate-500'
          }`}
        >
          <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
          </svg>
          Vouchers
        </button>
        <button
          onClick={() => setPublicView('login')}
          className={`flex-1 flex flex-col items-center justify-center text-[10px] font-bold uppercase tracking-wider transition ${
            publicView === 'login' ? 'text-cyber-cyan border-t-2 border-cyber-cyan' : 'text-slate-500'
          }`}
        >
          <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Portal
        </button>
      </nav>
    );
  };

  return (
    <section className="grid gap-6">
      {/* LANDING PAGE (DESKTOP / DEFAULT VIEW) */}
      {publicView === 'landing' && (
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch py-4 md:py-10">
          {/* Left info column */}
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-4">
              <span className="border border-cyber-cyan/30 bg-cyber-cyan/5 px-2 py-0.5 text-[9px] font-bold text-cyber-cyan uppercase font-mono tracking-wider">
                🛡 Verified Secure Network
              </span>
            </div>
            
            <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl font-sans uppercase">
              Zero-Paperwork
              <span className="block text-cyber-cyan">Gateway:</span>
              <span className="block text-white">Dignity First.</span>
            </h1>
            
            <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-lg">
              Access immediate crisis support without the burden of bureaucracy. Our mission is to provide a seamless, anonymous bridge between those in need and local food resources, prioritizing speed and human respect.
            </p>
            
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                onClick={() => setPublicView('tracker')}
                className="bg-cyber-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-200 transition duration-150 rounded-sm flex items-center gap-1.5"
              >
                <span>Request Referral</span>
                <span>→</span>
              </button>
              <button
                onClick={() => setPublicView('support')}
                className="border border-slate-800 hover:border-cyber-cyan/50 text-white px-5 py-3 text-xs font-black uppercase tracking-wider hover:bg-slate-900 transition duration-150 rounded-sm"
              >
                Learn More
              </button>
            </div>

            {/* Stats Band */}
            <div className="mt-12 grid grid-cols-2 gap-6 max-w-sm border-t border-slate-850 pt-6">
              <div>
                <p className="text-xl font-bold text-cyber-cyan font-mono tracking-tight">12k+</p>
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-wider mt-1">Families Supported Monthly</p>
              </div>
              <div>
                <p className="text-xl font-bold text-cyber-cyan font-mono tracking-tight">&lt; 15min</p>
                <p className="text-[10px] text-slate-500 uppercase font-mono tracking-wider mt-1">Average Response Time</p>
              </div>
            </div>
          </div>

          {/* Right tracker column */}
          <div className="flex flex-col">
            <CheckStatusForm />
          </div>
        </div>
      )}

      {/* TRACKER VIEW / MOBILE STATUS */}
      {publicView === 'tracker' && (
        <div className="mx-auto w-full max-w-md py-4">
          <div className="mb-4">
            <h2 className="text-xl font-black uppercase text-white tracking-wider">Track Your Support</h2>
            <p className="text-xs text-slate-400 mt-1">Enter your referral ID to check the status of your crisis voucher.</p>
          </div>
          <CheckStatusForm />
          
          {/* Find a Center / Support Callouts */}
          <div className="mt-6 grid gap-3">
            <a href="#map" className="border border-slate-800 bg-[#070e1e] p-4 flex gap-3 text-xs items-center hover:border-cyber-cyan/50 transition">
              <span className="text-cyber-cyan text-lg select-none">📍</span>
              <div className="flex-1">
                <h4 className="font-bold text-white">Find a Center</h4>
                <p className="text-slate-400 mt-0.5">Locate the nearest emergency food distribution point.</p>
              </div>
              <span className="text-cyber-cyan select-none">→</span>
            </a>
            
            <a href="#donate" className="border border-slate-800 bg-[#070e1e] p-4 flex gap-3 text-xs items-center hover:border-cyber-cyan/50 transition">
              <span className="text-cyber-teal text-lg select-none">❤️</span>
              <div className="flex-1">
                <h4 className="font-bold text-white">Support SOS</h4>
                <p className="text-slate-400 mt-0.5">Every donation helps us reach families in crisis faster.</p>
              </div>
              <span className="text-cyber-cyan select-none">→</span>
            </a>
          </div>
        </div>
      )}

      {/* SUPPORT LINKS VIEW */}
      {publicView === 'support' && (
        <div className="mx-auto w-full max-w-2xl py-4">
          <button
            onClick={() => setPublicView('landing')}
            className="mb-4 text-xs font-bold text-cyber-cyan uppercase font-mono hover:underline"
          >
            ← Back to Home
          </button>
          <SupportLinks publicView />
        </div>
      )}

      {/* LOGIN VIEW */}
      {publicView === 'login' && (
        <div className="mx-auto w-full max-w-sm py-4">
          <button
            onClick={() => setPublicView('landing')}
            className="mb-4 text-xs font-bold text-cyber-cyan uppercase font-mono hover:underline"
          >
            ← Back to Home
          </button>
          <SignInCard />
        </div>
      )}

      {/* Bottom Protocol Grid */}
      {publicView === 'landing' && (
        <div className="border-t border-slate-805 pt-10">
          <p className="mono-label text-cyber-cyan font-bold mb-4">System Protocol</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="border border-slate-800 bg-[var(--bg-surface)] p-5 rounded-sm">
              <span className="text-lg text-cyber-cyan select-none">👤</span>
              <h3 className="font-bold text-[var(--text-main)] mt-3 text-xs uppercase tracking-wider font-mono">No ID Required</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-2">
                We don't ask for your name or history. Access support based on your immediate situation, guaranteed.
              </p>
            </div>
            
            <div className="border border-slate-800 bg-[var(--bg-surface)] p-5 rounded-sm">
              <span className="text-lg text-cyber-cyan select-none">⚡</span>
              <h3 className="font-bold text-[var(--text-main)] mt-3 text-xs uppercase tracking-wider font-mono">Instant Approval</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-2">
                Real-time referral mapping ensures you find the nearest active resource point within minutes of arriving.
              </p>
            </div>
            
            <div className="border border-slate-800 bg-[var(--bg-surface)] p-5 rounded-sm">
              <span className="text-lg text-cyber-cyan select-none">🔒</span>
              <h3 className="font-bold text-[var(--text-main)] mt-3 text-xs uppercase tracking-wider font-mono">Privacy Lock</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-2">
                Our tracking tokens are one-time use and expire immediately after your support session is completed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Nav */}
      {renderMobileBottomNav()}
    </section>
  );
}