import { type FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { ExpiryCountdown } from './components/ExpiryCountdown';
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

const defaultSearchRadiusMiles = 15;

const radiusOptions = [
  { value: 2, label: '2 miles', description: 'Walking' },
  { value: 5, label: '5 miles', description: 'Local' },
  { value: 15, label: '15 miles', description: 'Wider Area' },
];

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
const communityUpdateCategory = 'community-update';

const getPostcodePrefix = (postcode?: string | null) => {
  const cleanedPostcode = (postcode ?? defaultPostLocation.postcode).trim().toUpperCase();
  return cleanedPostcode.split(/\s+/)[0] || 'LOCAL';
};

const isCitizenPost = (post: Post) =>
  post.board_type === 'citizen_post' || post.category?.toLowerCase() === communityUpdateCategory;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const getDistanceLabel = (post: Post, coordinates: { lat: number; lon: number }) => {
  if (!Number.isFinite(post.lat) || !Number.isFinite(post.lon)) {
    return 'nearby';
  }

  const earthRadiusMiles = 3958.8;
  const latDistance = toRadians(post.lat - coordinates.lat);
  const lonDistance = toRadians(post.lon - coordinates.lon);
  const startLat = toRadians(coordinates.lat);
  const endLat = toRadians(post.lat);
  const haversine =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDistance / 2) ** 2;
  const miles = earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} miles away`;
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [, setProfileLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationLocation, setRegistrationLocation] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userCoordinates, setUserCoordinates] = useState({
    lat: defaultPostLocation.lat,
    lon: defaultPostLocation.lon,
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchRadiusMiles, setSearchRadiusMiles] = useState(defaultSearchRadiusMiles);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('find-food');
  const [myClaims, setMyClaims] = useState<Post[]>([]);
  const [myListings, setMyListings] = useState<Post[]>([]);
  const [userPostsLoading, setUserPostsLoading] = useState(false);
  const [loadingPostId, setLoadingPostId] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<SystemMessage>(null);
  const [communityPostText, setCommunityPostText] = useState('');
  const [isSharingCommunityPost, setIsSharingCommunityPost] = useState(false);
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
  const feedRequestIdRef = useRef(0);

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
      const requestId = feedRequestIdRef.current + 1;
      feedRequestIdRef.current = requestId;
      setLoading(true);

      try {
        const nearbyPosts = await fetchNearbyPosts([userCoordinates.lat, userCoordinates.lon], searchRadiusMiles);

        if (isMounted && feedRequestIdRef.current === requestId) {
          setPosts(nearbyPosts);
        }
      } catch (err) {
        console.error('Detailed Firebase Feed Error:', err);

        if (isMounted && feedRequestIdRef.current === requestId) {
          setPosts([]);
        }
      } finally {
        if (isMounted && feedRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }

    void fetchFirebaseFeed();

    return () => {
      isMounted = false;
    };
  }, [searchRadiusMiles, userCoordinates.lat, userCoordinates.lon]);

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
        board_type: 'foodbank_broadcast',
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

  const handleShareCommunityPost = async () => {
    if (!session?.user?.id) {
      setSystemMessage({ type: 'error', text: 'Please sign in before sharing a community update.' });
      return;
    }

    const trimmedText = communityPostText.trim();

    if (!trimmedText) {
      setSystemMessage({ type: 'error', text: 'Write a short update before sharing it with neighbors.' });
      return;
    }

    const locationLabel = (profile?.primary_location || settingsLocation || defaultPostLocation.postcode)
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    setIsSharingCommunityPost(true);
    setSystemMessage(null);

    try {
      const coordinates = await getCoordinatesFromPostcode(locationLabel);
      const createdPost = await createPost({
        title: 'Neighbor update',
        description: trimmedText,
        quantity: 'Community update',
        expiry_time: expiry.toISOString(),
        postcode: locationLabel || defaultPostLocation.postcode,
        lat: coordinates.lat,
        lon: coordinates.lon,
        donor_id: session.user.id,
        category: communityUpdateCategory,
        urgency: 'low',
        board_type: 'citizen_post',
      });

      setPosts((current) => [createdPost, ...current]);
      setMyListings((current) => [createdPost, ...current]);
      setCommunityPostText('');
      setSystemMessage({ type: 'success', text: 'Your update is now live on the local community board.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Community update could not be shared.';
      console.error('Detailed Community Post Error:', message);
      setSystemMessage({ type: 'error', text: message });
    } finally {
      setIsSharingCommunityPost(false);
    }
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
      setSystemMessage({ type: 'success', text: 'Interest registered. The hub update has been removed from the open board.' });
    } catch (err) {
      const error = err as { message?: string; details?: string; hint?: string };
      console.error('Detailed Claim Error:', error.message, error.details, error.hint);
      setSystemMessage({
        type: 'error',
        text: error.message ?? 'Interest could not be registered. Please refresh and try another update.',
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
      if (isCreatingAccount) {
        const cleanedLocation = registrationLocation.trim().replace(/\s+/g, ' ').toUpperCase();

        if (!cleanedLocation) {
          throw new Error('Please enter your postcode or local area.');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              primary_location: cleanedLocation,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            organization_name: 'Community member',
            tier: 'grassroots_partner',
            primary_location: cleanedLocation,
            contact_phone: null,
          });

          if (profileError) {
            throw profileError;
          }

          setSettingsLocation(cleanedLocation);
          getCoordinatesFromPostcode(cleanedLocation)
            .then(setUserCoordinates)
            .catch((err) => console.error('Error geocoding registration location:', err));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          throw error;
        }
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
      const refreshedPosts = await fetchNearbyPosts([userCoordinates.lat, userCoordinates.lon], searchRadiusMiles);

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
        <div className="mx-auto w-full min-w-0 max-w-md rounded-3xl border border-brand-slateSoft bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6 min-w-0">
            <div className="mb-3 inline-flex rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
              Secure community access
            </div>
            <h1 className="break-words text-3xl font-extrabold tracking-tight text-brand-forest">
              {isCreatingAccount ? 'Create your account' : 'Sign in'}
            </h1>
            <p className="mt-2 break-words text-sm leading-6 text-slate-500">
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

            {isCreatingAccount ? (
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Postcode / Local Area
                <input
                  value={registrationLocation}
                  onChange={(event) => setRegistrationLocation(event.target.value)}
                  placeholder="e.g. ST7 or ST4 1AA"
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 uppercase outline-none focus:border-brand-forest"
                  required
                />
              </label>
            ) : null}

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
  const activeLocationLabel = profile?.primary_location || settingsLocation || defaultPostLocation.postcode;

  return (
    <AppShell
      onShowFeed={() => { setActiveView('feed'); setDashboardTab('find-food'); setFilter('all'); }}
      onAddPost={triggerOpenListingModal}
      onShowMyActivity={() => { setActiveView('feed'); setDashboardTab('my-claims'); setFilter('my-claims'); }}
    >
      {/* ─── APP HEADER ─── */}
      <div className="mb-6 min-w-0 rounded-3xl border border-brand-slateSoft bg-white p-5 shadow-xs sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex flex-wrap items-center gap-2">
              <span className="max-w-full break-words rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
                Modern Crisis Logistics Engine
              </span>
              {profile && (
                <span className="max-w-full break-words rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  🏢 {profile.organization_name} ({profile.tier.replace('_', ' ')})
                </span>
              )}
            </div>
            <h1 className="break-words text-3xl font-extrabold tracking-tight text-brand-forest">Save Our Supper</h1>
            <p className="mt-2 max-w-2xl break-words leading-6 text-slate-500">
              Connecting supermarkets, foodbanks, and local networks across the region to cut waste and match emergency supply demands.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
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
      <div className="mb-6 grid min-w-0 grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-1.5 sm:flex sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={() => setActiveView('feed')}
          className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
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
              className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
                activeView === 'inventory' ? 'bg-white text-brand-forest shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stock Levels
            </button>
            <button
              type="button"
              onClick={() => setActiveView('referrals')}
              className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
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
          className={`min-w-0 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all ${
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
            <div className="mb-6 min-w-0 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-xs animate-pulse">
              <div className="flex min-w-0 items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold text-red-900 md:text-base">Critical Hub Shortages Detected</h3>
                  <p className="mt-0.5 break-words text-xs text-red-700 md:text-sm">
                    Our warehouse is running dangerously low on: <strong>{deficitItems.join(', ')}</strong>. 
                    Donations containing these items will be prioritized for immediate processing.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 grid min-w-0 grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-1.5 sm:grid-cols-3">
            {dashboardTabs.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setDashboardTab(option.value);
                  setFilter(option.value === 'my-claims' ? 'my-claims' : option.value === 'my-listings' ? 'my-posts' : 'all');
                }}
                className={`min-w-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
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
            <div className="mb-5 min-w-0 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-xs font-bold uppercase tracking-wide text-brand-forest">Local community board</p>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                    Showing posts near <span className="font-semibold text-slate-700">{activeLocationLabel}</span> within {searchRadiusMiles} miles.
                  </p>
                </div>
                <label className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 sm:min-w-56 sm:w-auto">
                  Radius
                  <select
                    value={searchRadiusMiles}
                    onChange={(event) => setSearchRadiusMiles(Number(event.target.value))}
                    className="rounded-lg border border-brand-slateSoft bg-white px-2.5 py-1.5 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-xs outline-none focus:border-brand-forest"
                  >
                    {radiusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} ({option.description})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}

          {dashboardTab === 'find-food' ? (
            <div className="mb-5 min-w-0 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs">
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-bold text-brand-forest">Share a local update</span>
                <textarea
                  value={communityPostText}
                  onChange={(event) => setCommunityPostText(event.target.value)}
                  rows={3}
                  placeholder="Let neighbors know about a local collection, a community need, or a helpful food support update."
                  className="min-h-24 w-full resize-none rounded-2xl border border-brand-slateSoft bg-brand-cream px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-forest"
                />
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="break-words text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Posting near {getPostcodePrefix(activeLocationLabel)}
                </p>
                <button
                  type="button"
                  onClick={handleShareCommunityPost}
                  disabled={isSharingCommunityPost}
                  className="rounded-xl bg-brand-forest px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSharingCommunityPost ? 'Sharing...' : 'Share with Neighbors'}
                </button>
              </div>
            </div>
          ) : null}

          {systemMessage ? (
            <div
              className={`mb-6 min-w-0 break-words rounded-2xl border px-4 py-3 text-sm font-semibold ${
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

          {dashboardTab === 'find-food' && !loading && filteredPosts.length === 0 ? (
            <div className="min-w-0 rounded-2xl border border-dashed border-brand-slateSoft bg-white px-4 py-14 text-center shadow-xs sm:px-5">
              <p className="break-words text-lg font-bold tracking-tight text-slate-700">No local board posts found.</p>
              <p className="mx-auto mt-2 max-w-xl break-words text-sm leading-6 text-slate-500">
                No community board posts found near {activeLocationLabel} within {searchRadiusMiles} miles yet. Share a neighbor update above, or use Seed Test Data in Settings to populate demo items.
              </p>
            </div>
          ) : null}

          {dashboardTab === 'find-food' && !loading && filteredPosts.length > 0 ? (
            <div className="grid min-w-0 gap-4">
              {filteredPosts.map((item) => {
                const citizenPost = isCitizenPost(item);
                const postcodePrefix = getPostcodePrefix(item.postcode);
                const distanceLabel = getDistanceLabel(item, userCoordinates);

                return (
                <article key={item.id} className={`min-w-0 rounded-2xl border p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm sm:p-5 ${
                  citizenPost ? 'border-brand-slateSoft bg-white' : 'border-emerald-300 bg-white ring-1 ring-emerald-50'
                }`}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      {citizenPost ? (
                        <span className="inline-flex max-w-full break-words rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
                          Neighbor Update
                        </span>
                      ) : (
                        <span className="inline-flex max-w-full break-words rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
                          Official Hub Update
                        </span>
                      )}
                      <div className="flex min-w-0 flex-wrap gap-2 text-xs font-semibold text-slate-500 sm:justify-end">
                        <span className="max-w-full break-words rounded-full border border-brand-slateSoft bg-slate-50 px-3 py-1">
                          {postcodePrefix}
                        </span>
                        <span className="max-w-full break-words rounded-full border border-brand-slateSoft bg-slate-50 px-3 py-1">
                          {distanceLabel}
                        </span>
                        <ExpiryCountdown expiresAt={item.expiry_time} />
                      </div>
                    </div>

                    <h3 className="mt-3 break-words text-xl font-bold leading-tight tracking-tight text-slate-900">
                      {citizenPost ? item.description || item.title : item.title}
                    </h3>

                    {!citizenPost && item.description && (
                      <p className="mt-2 break-words text-sm text-slate-500 line-clamp-2">{item.description}</p>
                    )}

                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex min-w-0 flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <span className="break-words font-medium">
                        Open until{' '}
                        {new Date(item.expiry_time).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="w-fit max-w-full break-words rounded bg-brand-cream px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand-forest">
                        {item.status ?? 'available'}
                      </span>
                    </div>
                    <div>
                      {!citizenPost && item.status === 'available' ? (
                        <button
                          type="button"
                          onClick={() => handleClaimListing(item.id)}
                          disabled={loadingPostId === item.id}
                          className="w-full mt-4 bg-brand-amber hover:bg-[#cc7a00] text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs hover:shadow-sm active:scale-[0.98] transition-all text-center block text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingPostId === item.id ? 'Registering...' : 'I Can Help'}
                        </button>
                      ) : null}
                      {(item.status ?? '').toLowerCase() === 'pending' ? (
                        <button
                          type="button"
                          disabled
                          className="w-full mt-4 bg-slate-100 text-slate-500 font-semibold py-2.5 px-4 rounded-xl shadow-xs cursor-not-allowed text-center block text-sm"
                        >
                          Interest Registered
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
                );
              })}
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
        <div className="min-w-0 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs sm:p-6">
          <div className="mb-6 min-w-0">
            <h2 className="break-words text-2xl font-bold text-brand-forest">Live Firestore Stock Levels</h2>
            <p className="break-words text-sm text-slate-500">Available Firebase listings grouped by category. Totals update as posts are seeded or claimed.</p>
          </div>
          
          {inventoryLoading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading live Firebase stock levels...</div>
          ) : inventory.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-12 px-4 text-slate-400">
              No available Firebase listings to summarize yet.
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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
                  <div key={item.id} className="flex min-w-0 flex-col justify-between rounded-xl border border-brand-slateSoft bg-slate-50 p-4">
                    <div className="min-w-0">
                      <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="break-words text-lg font-bold text-slate-900">{item.item_name}</h3>
                          <p className="break-words text-xs font-semibold uppercase tracking-wider text-slate-400">Source: {item.location || 'Live Firestore Feed'}</p>
                        </div>
                        {statusBadge}
                      </div>

                      <div className="mt-3 mb-1 flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600 sm:flex-row sm:justify-between">
                        <span className="break-words">Available units: <strong>{item.current_quantity}</strong> across {item.listing_count ?? 0} listings</span>
                        <span className="shrink-0">{percent}%</span>
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
        <div className="min-w-0 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs sm:p-6">
          <div className="mb-6 min-w-0">
            <h2 className="break-words text-2xl font-bold text-brand-forest">Digital Referral Desk</h2>
            <p className="mb-6 break-words text-sm text-slate-500">Secure interface for foodbank volunteers to verify and process authenticated agency vouchers.</p>
          </div>
          
          {referralsLoading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading referral vouchers...</div>
          ) : referrals.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-12 px-4 text-slate-400">
              <p className="font-medium text-lg">No active referral vouchers queued.</p>
              <p className="text-xs mt-1">Vouchers issued by local councils or care agencies will appear here securely.</p>
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {referrals.map((voucher) => {
                const isFulfilled = voucher.status === 'fulfilled';
                const dateIssued = new Date(voucher.created_at).toLocaleDateString('en-GB');

                return (
                  <div key={voucher.id} className={`min-w-0 rounded-xl border p-4 transition-all ${
                    isFulfilled 
                      ? 'border-slate-200 bg-slate-50 opacity-70' 
                      : 'border-brand-slateSoft bg-white shadow-xs'
                  }`}>
                    <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Voucher ID</span>
                        <code className="inline-block max-w-full break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
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

                    <div className="mb-4 min-w-0 space-y-1 break-words text-sm text-slate-700">
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
        <div className="mx-auto min-w-0 max-w-xl rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs sm:p-6">
          <div className="mb-6 min-w-0">
            <h2 className="break-words text-2xl font-bold text-brand-forest">Organization Settings</h2>
            <p className="break-words text-sm text-slate-500">Manage your network identity profile, contact points, and target logistics routing hubs.</p>
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

            <div className="mt-2 min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              🔒 <strong>Operational Access Tier Level:</strong> <code className="bg-white font-mono px-1 py-0.5 rounded border ml-1 text-slate-700 uppercase font-bold">{profile?.tier}</code>
              <p className="mt-1 break-words">Tier authorization metrics are immutable at standard configuration level. To modify security tier clearancy, contact council administrators.</p>
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

          <div className="mt-6 min-w-0 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-bold text-brand-forest">Temporary Firebase Seed Tools</h3>
                <p className="mt-1 break-words text-xs leading-5 text-slate-600">
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
            {seedMessage ? <p className="mt-3 break-words text-xs font-semibold text-slate-700">{seedMessage}</p> : null}
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
