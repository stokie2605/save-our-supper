import { type FormEvent, useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { FoodMap } from './components/FoodMap';
import { UserPostList } from './components/UserPostList';
import {
  claimFirebaseSupper as claimSupper,
  createFirebasePost as createPost,
  fetchFirebaseNearbyPosts as fetchNearbyPosts,
  fetchFirebasePostsByDonor as fetchPostsByDonor,
  fetchFirebasePostsByReceiver as fetchPostsByReceiver,
  seedFirebasePosts,
  subscribeFirebaseStockLevels,
} from './lib/firebasePosts';
// Supabase feed helpers are disabled while the Firebase backend switch is active.
// import { fetchNearbyPosts, fetchPostsByDonor, fetchPostsByReceiver } from './lib/posts';
import {
  defaultHubCoordinates,
  getCoordinatesFromPostcode,
  type Post,
} from './lib/posts';
import { supabase } from './lib/supabase';

// 1. Updated interface to match your exact Supabase column layout
interface Listing {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  category: string;
  quantity: string;
  location?: string | null;
  collection_window?: string | null;
  post_type: 'surplus' | 'need' | string;
  urgency: string;
  status?: string | null;
  user_id?: string;
  claimed_by?: string | null;
  image_url?: string | null;
  dietary_tags?: string[];
  is_foodbank_suitable?: boolean;
}

// Interfaces for our newly created tables
interface InventoryItem {
  id: string;
  item_name: string;
  current_quantity: number;
  target_capacity: number;
  location: string;
  last_updated: string;
  listing_count?: number;
}

interface ReferralVoucher {
  id: string;
  client_reference: string;
  issued_by: string;
  parcel_type: string;
  status: 'active' | 'fulfilled' | 'expired';
  location: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  organization_name: string;
  tier: 'commercial_donor' | 'distribution_hub' | 'grassroots_partner';
  primary_location: string;
  contact_phone: string | null;
}

type FeedFilter = 'all' | 'surplus' | 'need' | 'my-posts' | 'my-claims';
type ActiveView = 'feed' | 'inventory' | 'referrals' | 'settings';
type DashboardTab = 'find-food' | 'my-claims' | 'my-listings';
type SystemMessage = { type: 'success' | 'error'; text: string } | null;

interface ListingFormState {
  title: string;
  description: string;
  category: string;
  quantity: string;
  location: string;
  collection_window: string;
  post_type: 'surplus' | 'need';
  urgency: 'low' | 'medium' | 'high';
  dietary_tags: string[];
  is_foodbank_suitable: boolean;
}

const emptyListingForm: ListingFormState = {
  title: '',
  description: '',
  category: '',
  quantity: '',
  location: '',
  collection_window: '',
  post_type: 'surplus',
  urgency: 'medium',
  dietary_tags: [],
  is_foodbank_suitable: false,
};

const defaultPostLocation = {
  postcode: 'ST7 2AA',
  lat: defaultHubCoordinates.lat,
  lon: defaultHubCoordinates.lon,
};

const localSearchRadiusMiles = 15;

const getExpiryTimestamp = (value: string) => {
  const parsedDate = new Date(value);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString();
};

const dashboardTabs: Array<{ value: DashboardTab; label: string }> = [
  { value: 'find-food', label: 'Find Food' },
  { value: 'my-claims', label: 'My Claims' },
  { value: 'my-listings', label: 'My Listings' },
];

const dietaryOptions = ['Vegan', 'Vegetarian', 'Gluten-Free', 'Nut-Free'];

const categoryImageUrls: Record<string, string> = {
  Bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
  Produce: 'https://images.unsplash.com/photo-1610348725531-843dff14692a?w=500&auto=format&fit=crop&q=80',
  Dairy: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&auto=format&fit=crop&q=80',
  'Meals / Prepared': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80',
  Other: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=500&auto=format&fit=crop&q=80',
};

const getListingImageUrl = (listing: Listing) => {
  if (listing.image_url) {
    return listing.image_url;
  }

  return categoryImageUrls[listing.category] ?? categoryImageUrls.Other;
};

const getUrgencyBadgeClass = (urgency: string) => {
  const normalizedUrgency = urgency.toLowerCase();

  if (normalizedUrgency === 'high') {
    return 'bg-orange-50 text-orange-800 border border-orange-200';
  }

  if (normalizedUrgency === 'medium') {
    return 'bg-amber-50 text-amber-800 border border-amber-200';
  }

  return 'bg-slate-100 text-slate-700 border border-brand-slateSoft';
};

const getStatusBadgeClass = (status?: string | null) => {
  const normalizedStatus = (status ?? 'available').toLowerCase();

  if (normalizedStatus === 'pending') {
    return 'bg-amber-50 text-amber-800 border border-amber-200';
  }

  if (normalizedStatus === 'claimed') {
    return 'bg-slate-100 text-slate-700 border border-brand-slateSoft';
  }

  return 'text-brand-forest bg-brand-cream';
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [, setProfileLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userCoordinates, setUserCoordinates] = useState({
    lat: defaultPostLocation.lat,
    lon: defaultPostLocation.lon,
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('find-food');
  const [myClaims, setMyClaims] = useState<Post[]>([]);
  const [myListings, setMyListings] = useState<Post[]>([]);
  const [userPostsLoading, setUserPostsLoading] = useState(false);
  const [loadingPostId, setLoadingPostId] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<SystemMessage>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<ListingFormState>(emptyListingForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Core application tab/view manager state
  const [activeView, setActiveView] = useState<ActiveView>('feed');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [referrals, setReferrals] = useState<ReferralVoucher[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);

  // PROFILE EDITOR MUTATION STATE
  const [settingsOrgName, setSettingsOrgName] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsLocation, setSettingsLocation] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [isSeedingFirebase, setIsSeedingFirebase] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');

  // Firestore stock levels update live through subscribeFirebaseStockLevels.
  const refreshInventoryData = async () => {
    setInventoryLoading(false);
  };

  // Profile loader engine
  const fetchUserProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data as UserProfile);
        setSettingsOrgName(data.organization_name);
        setSettingsPhone(data.contact_phone || '');
        setSettingsLocation(data.primary_location || 'Alsager');
        if (data.primary_location) {
          getCoordinatesFromPostcode(data.primary_location)
            .then(setUserCoordinates)
            .catch((err) => console.error('Error geocoding profile location:', err));
        }
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error getting organization profile details:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchUserProfile(data.session.user.id);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribeStockLevels = subscribeFirebaseStockLevels(
      (stockLevels) => {
        setInventory(stockLevels);
        setInventoryLoading(false);
      },
      (error) => {
        console.error('Error syncing Firebase stock levels:', error);
        setInventory([]);
        setInventoryLoading(false);
      },
    );

    async function fetchReferrals() {
      try {
        const { data, error } = await supabase
          .from('referrals')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setReferrals(data || []);
      } catch (err) {
        console.error('Error fetching referrals:', err);
      } finally {
        setReferralsLoading(false);
      }
    }

    fetchReferrals();

    return () => unsubscribeStockLevels();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchFirebaseFeed() {
      setLoading(true);

      try {
        const nearbyPosts = await fetchNearbyPosts([userCoordinates.lat, userCoordinates.lon], localSearchRadiusMiles);

        if (isMounted) {
          setPosts(nearbyPosts);
        }
      } catch (err) {
        console.error('Detailed Firebase Feed Error:', err);

        if (isMounted) {
          setPosts([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchFirebaseFeed();

    return () => {
      isMounted = false;
    };
  }, [userCoordinates.lat, userCoordinates.lon]);

  useEffect(() => {
    if (!session?.user?.id) {
      setMyClaims([]);
      setMyListings([]);
      return;
    }

    let isMounted = true;

    async function fetchUserDashboardPosts() {
      setUserPostsLoading(true);

      try {
        const [claimsResult, listingsResult] = await Promise.all([
          fetchPostsByReceiver(session.user.id),
          fetchPostsByDonor(session.user.id),
        ]);

        if (!isMounted) {
          return;
        }

        setMyClaims(claimsResult);
        setMyListings(listingsResult);
      } catch (err) {
        console.error('Detailed Firebase Dashboard Error:', err);

        if (isMounted) {
          setMyClaims([]);
          setMyListings([]);
        }
      } finally {
        if (isMounted) {
          setUserPostsLoading(false);
        }
      }
    }

    void fetchUserDashboardPosts();

    const channel = supabase
      .channel('user-post-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          void fetchUserDashboardPosts();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const filteredPosts = posts.filter((post) => {
    if (filter === 'my-posts') {
      return post.donor_id === session?.user?.id;
    }

    if (filter === 'my-claims') {
      return post.receiver_id === session?.user?.id;
    }

    return true;
  });

  const filteredListings: Listing[] = filteredPosts.map((post) => ({
    id: post.id,
    created_at: post.created_at,
    title: post.title,
    description: post.description,
    category: post.category ?? 'Food',
    quantity: post.quantity,
    location: post.postcode?.trim() || 'Location TBC',
    collection_window: new Date(post.expiry_time).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    post_type: 'surplus',
    urgency: post.urgency ?? 'medium',
    status: post.status === 'available' ? 'available' : 'pending',
    user_id: post.donor_id,
    claimed_by: post.receiver_id,
  }));

  const updateFormField = <Field extends keyof ListingFormState>(field: Field, value: ListingFormState[Field]) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const toggleDietaryTag = (tag: string) => {
    setFormState((current) => ({
      ...current,
      dietary_tags: current.dietary_tags.includes(tag)
        ? current.dietary_tags.filter((item) => item !== tag)
        : [...current.dietary_tags, tag],
    }));
  };

  // 📍 STEP 3: TIER-AWARE MODAL OPENING TRIGGERS
  const triggerOpenListingModal = () => {
    if (profile) {
      setFormState({
        ...emptyListingForm,
        location: profile.primary_location || 'Alsager',
        post_type: profile.tier === 'commercial_donor' ? 'surplus' : 'surplus',
        is_foodbank_suitable: profile.tier === 'commercial_donor' ? true : false,
      });
    } else {
      setFormState(emptyListingForm);
    }
    setIsModalOpen(true);
  };

  const handleSubmitListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const sanitizedLocation = formState.location.trim().replace(/\s+/g, ' ').toUpperCase();
    const postcode = sanitizedLocation.slice(0, 10) || defaultPostLocation.postcode;

    try {
      const coordinates = await getCoordinatesFromPostcode(postcode);
      const createdPost = await createPost({
        title: formState.title.trim(),
        description: formState.description.trim() || null,
        quantity: formState.quantity.trim(),
        expiry_time: getExpiryTimestamp(formState.collection_window),
        postcode,
        lat: coordinates.lat,
        lon: coordinates.lon,
        donor_id: session.user.id,
        category: formState.category,
        urgency: formState.urgency,
      });

      setPosts((current) => [createdPost, ...current]);
    } catch (err) {
      console.error('Detailed Firebase Post Error:', err instanceof Error ? err.message : err);
      return;
    } finally {
      setIsSubmitting(false);
    }

    setFormState(emptyListingForm);
    setIsModalOpen(false);
  };

  const handleClaimListing = async (itemId: string) => {
    setLoadingPostId(itemId);
    setSystemMessage(null);

    try {
      await claimSupper(itemId, session.user.id);
      const claimedPost = posts.find((post) => post.id === itemId);

      if (claimedPost) {
        const updatedClaim: Post = {
          ...claimedPost,
          status: 'claimed',
          receiver_id: session.user.id,
        };

        setMyClaims((current) => [updatedClaim, ...current.filter((post) => post.id !== itemId)]);
        setMyListings((current) => current.map((post) => (post.id === itemId ? updatedClaim : post)));
      }

      setPosts((current) => current.filter((post) => post.id !== itemId));
      setSystemMessage({ type: 'success', text: 'Food post claimed successfully and removed from the available feed.' });
    } catch (err) {
      const error = err as { message?: string; details?: string; hint?: string };
      console.error('Detailed Claim Error:', error.message, error.details, error.hint);
      setSystemMessage({
        type: 'error',
        text: error.message ?? 'This food post could not be claimed. Please refresh and try another listing.',
      });
    } finally {
      setLoadingPostId(null);
    }
  };

  // SETTINGS DISPATCH SUBMITTER ENGINE
  const handleUpdateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user?.id) return;
    setIsSavingSettings(true);
    setSettingsSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          organization_name: settingsOrgName.trim(),
          contact_phone: settingsPhone.trim() || null,
          primary_location: settingsLocation.trim()
        })
        .eq('id', session.user.id);

      if (error) throw error;
      
      setSettingsSuccess(true);
      setProfile(prev => prev ? {
        ...prev,
        organization_name: settingsOrgName.trim(),
        contact_phone: settingsPhone.trim() || null,
        primary_location: settingsLocation.trim()
      } : null);

      setTimeout(() => setSettingsSuccess(false), 4000);
    } catch (err) {
      console.error('Error rewriting settings profile information:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    try {
      const authAction = isCreatingAccount
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
      const { error } = await authAction;

      if (error) {
        throw error;
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSeedFirebasePosts = async () => {
    setIsSeedingFirebase(true);
    setSeedMessage('Seeding 45 Firebase listings across Alsager, Crewe, Stoke-on-Trent, and Kidsgrove...');

    try {
      const createdCount = await seedFirebasePosts(session.user.id);
      const refreshedPosts = await fetchNearbyPosts([userCoordinates.lat, userCoordinates.lon], localSearchRadiusMiles);

      setPosts(refreshedPosts);
      setSeedMessage(`Seed complete: ${createdCount} Firebase listings are now available.`);
      window.alert(`Seed complete: ${createdCount} Firebase listings added to Firestore.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Firebase seed error';
      console.error('Detailed Firebase Seed Error:', message);
      setSeedMessage(`Seed failed: ${message}`);
      window.alert(`Seed failed: ${message}`);
    } finally {
      setIsSeedingFirebase(false);
    }
  };

  if (!session) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-3xl border border-brand-slateSoft bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="mb-3 inline-flex rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
              Secure community access
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-brand-forest">
              {isCreatingAccount ? 'Create your account' : 'Sign in'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Use your email and password to access the live Save Our Supper community feed.
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                required
              />
            </label>

            {authError ? <p className="text-sm font-semibold text-red-500">{authError}</p> : null}

            <button
              type="submit"
              className="bg-brand-forest text-white w-full py-2.5 rounded-xl font-semibold"
            >
              {isCreatingAccount ? 'Create Account' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthError('');
                setIsCreatingAccount((current) => !current);
              }}
              className="rounded-xl border border-brand-slateSoft bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              {isCreatingAccount ? 'Already have an account? Sign In' : 'Need an account? Create Account'}
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  // Determine role classification clearance level
  const isHubManager = profile?.tier === 'distribution_hub';
  const isCommercialDonor = profile?.tier === 'commercial_donor';

  // DEFICIT BANNER CALCULATOR ENGINE
  const deficitItems = inventory
    .filter(item => Math.round((item.current_quantity / item.target_capacity) * 100) <= 20)
    .map(item => item.item_name);

  return (
    <AppShell
      onShowFeed={() => { setActiveView('feed'); setDashboardTab('find-food'); setFilter('all'); }}
      onAddPost={triggerOpenListingModal}
      onShowMyActivity={() => { setActiveView('feed'); setDashboardTab('my-claims'); setFilter('my-claims'); }}
    >
      {/* ─── APP HEADER ─── */}
      <div className="mb-6 rounded-3xl border border-brand-slateSoft bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
                Modern Crisis Logistics Engine
              </span>
              {profile && (
                <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  🏢 {profile.organization_name} ({profile.tier.replace('_', ' ')})
                </span>
              )}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-brand-forest">Save Our Supper</h1>
            <p className="text-slate-500 mt-2 max-w-2xl leading-6">
              Connecting supermarkets, foodbanks, and local networks across the region to cut waste and match emergency supply demands.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={triggerOpenListingModal}
              className="hidden md:flex bg-brand-amber text-white font-semibold rounded-xl px-4 py-2.5 shadow-sm"
            >
              Add a Listing
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-brand-slateSoft bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ─── 📍 VISUAL TAB SWITCHER SYSTEM ─── */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-100 p-1.5">
        <button
          type="button"
          onClick={() => setActiveView('feed')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all text-center ${
            activeView === 'feed' ? 'bg-white text-brand-forest shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Community Feed
        </button>
        {isHubManager && (
          <>
            <button
              type="button"
              onClick={() => setActiveView('inventory')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all text-center ${
                activeView === 'inventory' ? 'bg-white text-brand-forest shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stock Levels
            </button>
            <button
              type="button"
              onClick={() => setActiveView('referrals')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all text-center ${
                activeView === 'referrals' ? 'bg-white text-brand-forest shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Digital Referrals
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setActiveView('settings')}
          className={`px-4 rounded-xl py-2.5 text-sm font-bold transition-all text-center ${
            activeView === 'settings' ? 'bg-white text-brand-forest shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ⚙️ Settings
        </button>
      </div>

      {/* ─── VIEW VIEWPORTS ─── */}

      {/* VIEW A: THE COMMUNITY FEED */}
      {activeView === 'feed' && (
        <>
          {/* DYNAMIC LIVE DEFICIT BANNER */}
          {deficitItems.length > 0 && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-xs animate-pulse">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-red-900 text-sm md:text-base">Critical Hub Shortages Detected</h3>
                  <p className="text-xs md:text-sm text-red-700 mt-0.5">
                    Our warehouse is running dangerously low on: <strong>{deficitItems.join(', ')}</strong>. 
                    Donations containing these items will be prioritized for immediate processing.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1.5">
            {dashboardTabs.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setDashboardTab(option.value);
                  setFilter(option.value === 'my-claims' ? 'my-claims' : option.value === 'my-listings' ? 'my-posts' : 'all');
                }}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                  dashboardTab === option.value
                    ? 'bg-brand-forest text-white'
                    : 'bg-white text-slate-700 border border-brand-slateSoft hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {dashboardTab === 'find-food' ? (
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Showing food near {profile?.primary_location || settingsLocation || defaultPostLocation.postcode} within {localSearchRadiusMiles} miles
            </p>
          ) : null}

          {systemMessage ? (
            <div
              className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                systemMessage.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-green-200 bg-green-50 text-green-700'
              }`}
            >
              {systemMessage.text}
            </div>
          ) : null}

          {dashboardTab === 'find-food' ? (
            <FoodMap
              posts={filteredPosts}
              userCoordinates={userCoordinates}
              onReservePost={handleClaimListing}
            />
          ) : null}

          {dashboardTab === 'find-food' && loading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading live feed...</div>
          ) : null}

          {dashboardTab === 'find-food' && !loading && filteredListings.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-16 px-4">
              <p className="text-slate-400 font-medium text-lg">No active food posts found.</p>
              <p className="text-slate-400 text-sm mt-1">Your connection to Firebase Firestore is active and waiting for data!</p>
            </div>
          ) : null}

          {dashboardTab === 'find-food' && !loading && filteredListings.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredListings.map((item) => (
                <div key={item.id} className="bg-white border border-brand-slateSoft rounded-2xl p-6 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <img
                      src={getListingImageUrl(item)}
                      alt={`${item.category} food placeholder`}
                      className="mb-5 h-40 w-full rounded-2xl object-cover border border-brand-slateSoft bg-brand-cream"
                      loading="lazy"
                    />

                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                        item.post_type.toLowerCase() === 'surplus'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {item.post_type}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${getUrgencyBadgeClass(item.urgency)}`}>
                        {item.urgency}
                      </span>
                    </div>

                    <h3 className="text-slate-900 font-bold text-xl tracking-tight leading-tight">{item.title}</h3>

                    {item.description && (
                      <p className="text-sm text-slate-500 mt-2 line-clamp-2">{item.description}</p>
                    )}

                    {item.dietary_tags && item.dietary_tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.dietary_tags.map((tag) => (
                          <span key={`${item.id}-${tag}`} className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {item.is_foodbank_suitable ? (
                      <div className="mt-3 inline-flex text-xs font-bold text-brand-forest bg-emerald-50/50 border border-brand-slateSoft rounded-lg px-2 py-1">
                        ✓ Food Bank Choice
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-brand-cream px-3 py-1 font-semibold text-brand-forest">
                        {item.category}
                      </span>
                      <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-700 border border-brand-slateSoft">
                        {item.quantity}
                      </span>
                      {item.location ? (
                        <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-700 border border-brand-slateSoft">
                          {item.location}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span className="font-medium">{item.collection_window ?? 'Collection details to follow'}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${getStatusBadgeClass(item.status)}`}>
                        {item.status ?? 'available'}
                      </span>
                    </div>
                    <div>
                      {(item.status ?? 'available').toLowerCase() === 'available' && item.post_type.toLowerCase() === 'surplus' ? (
                        <button
                          type="button"
                          onClick={() => handleClaimListing(item.id)}
                          disabled={loadingPostId === item.id}
                          className="w-full mt-4 bg-brand-amber hover:bg-[#cc7a00] text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs hover:shadow-sm active:scale-[0.98] transition-all text-center block text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingPostId === item.id ? 'Securing...' : 'Claim'}
                        </button>
                      ) : null}
                      {(item.status ?? '').toLowerCase() === 'pending' ? (
                        <button
                          type="button"
                          disabled
                          className="w-full mt-4 bg-slate-100 text-slate-500 font-semibold py-2.5 px-4 rounded-xl shadow-xs cursor-not-allowed text-center block text-sm"
                        >
                          Claim Pending...
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {dashboardTab === 'my-claims' ? (
            <UserPostList
              posts={myClaims}
              loading={userPostsLoading}
              emptyMessage="You have not claimed any food posts yet."
            />
          ) : null}

          {dashboardTab === 'my-listings' ? (
            <UserPostList
              posts={myListings}
              loading={userPostsLoading}
              emptyMessage="You have not listed any food posts yet."
            />
          ) : null}
        </>
      )}

      {/* VIEW B: WAREHOUSE STOCK LEVELS */}
      {isHubManager && activeView === 'inventory' && (
        <div className="bg-white border border-brand-slateSoft rounded-2xl p-6 shadow-xs">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-brand-forest">Live Firestore Stock Levels</h2>
            <p className="text-sm text-slate-500">Available Firebase listings grouped by category. Totals update as posts are seeded or claimed.</p>
          </div>
          
          {inventoryLoading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading live Firebase stock levels...</div>
          ) : inventory.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-12 px-4 text-slate-400">
              No available Firebase listings to summarize yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {inventory.map((item) => {
                const percent = Math.round((item.current_quantity / item.target_capacity) * 100);
                
                let barColor = 'bg-emerald-600';
                let statusBadge = <span className="bg-emerald-50 text-emerald-800 text-xs px-2.5 py-0.5 rounded-md font-bold border border-emerald-200">OPTIMAL</span>;

                if (percent <= 20) {
                  barColor = 'bg-red-600';
                  statusBadge = <span className="bg-red-50 text-red-800 text-xs px-2.5 py-0.5 rounded-md font-bold border border-red-200 animate-pulse">CRITICAL DEFICIT</span>;
                } else if (percent >= 100) {
                  barColor = 'bg-purple-600';
                  statusBadge = <span className="bg-purple-50 text-purple-800 text-xs px-2.5 py-0.5 rounded-md font-bold border border-purple-200">MAX CAPACITY</span>;
                } else if (percent <= 50) {
                  barColor = 'bg-amber-500';
                  statusBadge = <span className="bg-amber-50 text-amber-800 text-xs px-2.5 py-0.5 rounded-md font-bold border border-brand-amber text-brand-amber bg-opacity-10">LOW STOCK</span>;
                }

                return (
                  <div key={item.id} className="border border-brand-slateSoft rounded-xl p-4 bg-slate-50 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg">{item.item_name}</h3>
                          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Source: {item.location || 'Live Firestore Feed'}</p>
                        </div>
                        {statusBadge}
                      </div>

                      <div className="flex justify-between text-xs text-slate-600 font-medium mt-3 mb-1">
                        <span>Available units: <strong>{item.current_quantity}</strong> across {item.listing_count ?? 0} listings</span>
                        <span>{percent}%</span>
                      </div>
                      
                      <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden border border-slate-300">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW C: SECURE DIGITAL REFERRALS */}
      {isHubManager && activeView === 'referrals' && (
        <div className="bg-white border border-brand-slateSoft rounded-2xl p-6 shadow-xs">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-brand-forest">Digital Referral Desk</h2>
            <p className="text-sm text-slate-500 mb-6">Secure interface for foodbank volunteers to verify and process authenticated agency vouchers.</p>
          </div>
          
          {referralsLoading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading referral vouchers...</div>
          ) : referrals.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-12 px-4 text-slate-400">
              <p className="font-medium text-lg">No active referral vouchers queued.</p>
              <p className="text-xs mt-1">Vouchers issued by local councils or care agencies will appear here securely.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {referrals.map((voucher) => {
                const isFulfilled = voucher.status === 'fulfilled';
                const dateIssued = new Date(voucher.created_at).toLocaleDateString('en-GB');

                return (
                  <div key={voucher.id} className={`border rounded-xl p-4 transition-all ${
                    isFulfilled 
                      ? 'border-slate-200 bg-slate-50 opacity-70' 
                      : 'border-brand-slateSoft bg-white shadow-xs'
                  }`}>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Voucher ID</span>
                        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono font-bold">
                          {voucher.id.substring(0, 8)}...
                        </code>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                        isFulfilled
                          ? 'bg-slate-100 text-slate-600 border-slate-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {voucher.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-slate-700 mb-4">
                      <p>👤 <strong>Client Ref:</strong> {voucher.client_reference}</p>
                      <p>🏢 <strong>Issued By:</strong> {voucher.issued_by}</p>
                      <p>📦 <strong>Parcel Type:</strong> {voucher.parcel_type}</p>
                      <p>📍 <strong>Collection Hub:</strong> {voucher.location}</p>
                      <p className="text-xs text-slate-400 pt-1">📅 Issued on: {dateIssued}</p>
                    </div>

                    {!isFulfilled && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { error } = await supabase.rpc('fulfill_voucher_with_stock', {
                              voucher_id: voucher.id,
                              parcel_type: voucher.parcel_type
                            });
                            
                            if (error) throw error;

                            setReferrals(prev => prev.map(v => v.id === voucher.id ? { ...v, status: 'fulfilled' } : v));
                            void refreshInventoryData();
                          } catch (err) {
                            console.error('Error fulfilling voucher with live deduction:', err);
                          }
                        }}
                        className="w-full bg-brand-forest hover:bg-opacity-90 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-all text-center block"
                      >
                        Fulfill & Hand Over Parcel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW D: RENDER PROFILE SETTINGS VIEWPORT PANEL */}
      {activeView === 'settings' && (
        <div className="mx-auto max-w-xl bg-white border border-brand-slateSoft rounded-2xl p-6 shadow-xs">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-brand-forest">Organization Settings</h2>
            <p className="text-sm text-slate-500">Manage your network identity profile, contact points, and target logistics routing hubs.</p>
          </div>

          <form onSubmit={handleUpdateSettings} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Organization Identity Name
              <input
                type="text"
                value={settingsOrgName}
                onChange={(e) => setSettingsOrgName(e.target.value)}
                className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                required
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Your postcode / local area
                <input
                  type="text"
                  value={settingsLocation}
                  onChange={(e) => setSettingsLocation(e.target.value)}
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Logistics Contact Phone (Optional)
                <input
                  type="tel"
                  value={settingsPhone}
                  onChange={(e) => setSettingsPhone(e.target.value)}
                  placeholder="e.g. +44 1782 ..."
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                />
              </label>
            </div>

            <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">
              🔒 <strong>Operational Access Tier Level:</strong> <code className="bg-white font-mono px-1 py-0.5 rounded border ml-1 text-slate-700 uppercase font-bold">{profile?.tier}</code>
              <p className="mt-1">Tier authorization metrics are immutable at standard configuration level. To modify security tier clearancy, contact council administrators.</p>
            </div>

            {settingsSuccess && (
              <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                ✓ Settings updated successfully. Database profile is synced live.
              </p>
            )}

            <button
              type="submit"
              disabled={isSavingSettings}
              className="mt-2 rounded-xl bg-brand-forest hover:bg-opacity-90 font-semibold text-white py-2.5 shadow-sm disabled:opacity-50"
            >
              {isSavingSettings ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>`r`n          </form>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-brand-forest">Temporary Firebase Seed Tools</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Add 45 realistic test listings across the local map clusters for feed and marker testing.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSeedFirebasePosts}
                disabled={isSeedingFirebase}
                className="rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSeedingFirebase ? 'Seeding...' : 'Seed Test Data'}
              </button>
            </div>
            {seedMessage ? <p className="mt-3 text-xs font-semibold text-slate-700">{seedMessage}</p> : null}
          </div>
        </div>
      )}

      {/* --- CREATION MODAL ─── */}
      {isModalOpen ? (
        <div className="bg-black/50 fixed inset-0 z-[5000] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="z-[5001] w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 shadow-xl fixed bottom-0 sm:relative max-h-[90vh] overflow-y-auto transform transition-all border border-brand-slateSoft">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-brand-forest">Add a Listing</h2>
                <p className="mt-1 text-sm text-slate-500">Post a surplus offer or urgent community food need.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border border-brand-slateSoft bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmitListing} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Post type
                  {isCommercialDonor ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-slate-900 font-bold text-sm">
                      📦 SURPLUS ONLY (Commercial Account)
                    </div>
                  ) : (
                    <select
                      value={formState.post_type}
                      onChange={(event) => updateFormField('post_type', event.target.value as ListingFormState['post_type'])}
                      className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                    >
                      <option value="surplus">Surplus</option>
                      <option value="need">Need</option>
                    </select>
                  )}
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Urgency
                  <select
                    value={formState.urgency}
                    onChange={(event) => updateFormField('urgency', event.target.value as ListingFormState['urgency'])}
                    className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Title
                <input
                  value={formState.title}
                  onChange={(event) => updateFormField('title', event.target.value)}
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Description
                <textarea
                  value={formState.description}
                  onChange={(event) => updateFormField('description', event.target.value)}
                  rows={3}
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Category
                  <input
                    value={formState.category}
                    onChange={(event) => updateFormField('category', event.target.value)}
                    className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Quantity
                  <input
                    value={formState.quantity}
                    onChange={(event) => updateFormField('quantity', event.target.value)}
                    className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Location / Drop-off Point
                  <input
                    value={formState.location}
                    onChange={(event) => updateFormField('location', event.target.value)}
                    className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Collection window
                  <input
                    value={formState.collection_window}
                    onChange={(event) => updateFormField('collection_window', event.target.value)}
                    className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 outline-none focus:border-brand-forest"
                    required
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-brand-slateSoft bg-brand-cream p-4">
                <p className="text-sm font-bold text-brand-forest">Dietary Information</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dietaryOptions.map((tag) => {
                    const isSelected = formState.dietary_tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleDietaryTag(tag)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${
                          isSelected
                            ? 'bg-brand-forest text-white border-brand-forest'
                            : 'bg-white text-slate-700 border-brand-slateSoft'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-brand-slateSoft bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Suitable for Food Bank Donation
                  <input
                    type="checkbox"
                    checked={formState.is_foodbank_suitable}
                    onChange={(event) => updateFormField('is_foodbank_suitable', event.target.checked)}
                    disabled={isCommercialDonor}
                    className="h-5 w-5 accent-brand-forest disabled:opacity-70"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 rounded-xl bg-brand-amber px-4 py-2.5 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Posting...' : 'Post Listing'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
