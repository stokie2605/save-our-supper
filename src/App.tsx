import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { AppShell } from './components/AppShell';
import { CommunityHub } from './components/CommunityHub';
import { ExpiryCountdown } from './components/ExpiryCountdown';
import { FoodMap } from './components/FoodMap';
import { UserPostList } from './components/UserPostList';
import { AdminPanel as RoleAdminPanel } from './components/admin/AdminPanel';
import { AuthGuard } from './components/auth/AuthGuard';
import { IntakePortal } from './components/foodbank/IntakePortal';
import ReferralQueue from './components/foodbank/ReferralQueue';
import LiveInventory from './components/foodbank/LiveInventory';
import {
  claimFirebaseSupper as claimSupper,
  completeFirebaseClaim as completeClaim,
  createFirebasePost as createPost,
  fetchFirebaseNearbyPosts as fetchNearbyPosts,
  fetchFirebasePostsByDonor as fetchPostsByDonor,
  fetchFirebasePostsByReceiver as fetchPostsByReceiver,
} from './lib/firebasePosts';
import {
  defaultHubCoordinates,
  getCoordinatesFromPostcode,
  type Post,
} from './lib/posts';
import { db, firebaseAuth } from './lib/firebaseConfig';
import type { UserRole } from './types/user';

interface UserProfile {
  id: string;
  organization_name: string;
  tier: 'commercial_donor' | 'distribution_hub' | 'grassroots_partner';
  primary_location: string;
  contact_phone: string | null;
  role?: UserRole;
}

type AppSession = {
  user: {
    id: string;
    email: string | null;
  };
};

type UserProfileDocument = Partial<UserProfile> & {
  organizationName?: string;
  primaryLocation?: string;
  contactPhone?: string | null;
  role?: string | string[];
  roles?: string[];
  isAdmin?: boolean;
  isVolunteer?: boolean;
};

type FeedFilter = 'all' | 'surplus' | 'need' | 'my-posts' | 'my-claims';
type ActiveView = 'community' | 'feed' | 'inventory' | 'settings' | 'admin';
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

const defaultSearchRadiusMiles = 5;

const getExpiryTimestamp = (value: string) => {
  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString();
};

const dietaryOptions = ['Vegan', 'Vegetarian', 'Gluten-Free', 'Nut-Free'];
const communityUpdateCategory = 'community-update';
const showLegacyCommunityBoard = false;
const foodbankAccessRoles = ['volunteer', 'moderator', 'admin'] as const;
const referralAccessRoles = ['partner', 'volunteer', 'moderator', 'admin'] as const;
const adminAccessRoles = ['admin'] as const;

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

type NavIconProps = { className?: string };

function PlusCircleIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PackageIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 7.5 9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 7.5v9l9 4 9-4v-9M12 11.5v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 19c0-2.2-1.8-4-4-4H8c-2.2 0-4 1.8-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M20 19c0-1.8-1.1-3.3-2.7-3.8M17 4.4a4 4 0 0 1 0 7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MessageIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-5 4v-4.4A3.5 3.5 0 0 1 3 11.2V6.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ className = 'h-6 w-6' }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 14v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [session, setSession] = useState<AppSession | null>(null);
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
  const [completingPostId, setCompletingPostId] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<SystemMessage>(null);
  const [communityPostText, setCommunityPostText] = useState('');
  const [isSharingCommunityPost, setIsSharingCommunityPost] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<ListingFormState>(emptyListingForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [donationSessionTotal, setDonationSessionTotal] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>('feed');

  const [settingsOrgName, setSettingsOrgName] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsLocation, setSettingsLocation] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const feedRequestIdRef = useRef(0);

  const fetchUserProfile = async (userId: string, fallbackEmail?: string | null) => {
    setProfileLoading(true);
    try {
      const userSnapshot = await getDoc(doc(db, 'users', userId));

      if (userSnapshot.exists()) {
        const data = userSnapshot.data() as UserProfileDocument;
        const rawRoles = Array.isArray(data.roles) ? data.roles : Array.isArray(data.role) ? data.role : [data.role];
        const normalizedRoles = rawRoles.map((role) => String(role).toLowerCase().trim());
        const normalizedRole: UserRole = data.isAdmin === true
          ? 'admin'
          : normalizedRoles.includes('admin')
            ? 'admin'
            : normalizedRoles.includes('moderator') || normalizedRoles.includes('mod')
              ? 'moderator'
              : normalizedRoles.includes('partner')
                ? 'partner'
              : normalizedRoles.includes('volunteer') || data.isVolunteer === true
                ? 'volunteer'
                : 'client';
        const isAdminProfile = normalizedRole === 'admin';
        const normalizedProfile: UserProfile = {
          id: userId,
          organization_name:
            data.organization_name ?? data.organizationName ?? (isAdminProfile ? 'Alsager Central Hub' : 'Community member'),
          tier: data.tier ?? (isAdminProfile ? 'distribution_hub' : 'grassroots_partner'),
          primary_location: data.primary_location ?? data.primaryLocation ?? 'ST7',
          contact_phone: data.contact_phone ?? data.contactPhone ?? null,
          role: normalizedRole,
        };

        setProfile(normalizedProfile);
        setSettingsOrgName(normalizedProfile.organization_name);
        setSettingsPhone(normalizedProfile.contact_phone || '');
        setSettingsLocation(normalizedProfile.primary_location);
        if (normalizedProfile.primary_location) {
          getCoordinatesFromPostcode(normalizedProfile.primary_location)
            .then(setUserCoordinates)
            .catch((err) => console.error('Error geocoding profile location:', err));
        }
      } else {
        const fallbackProfile: UserProfile = {
          id: userId,
          organization_name: fallbackEmail === 'stokie2605@gmail.com' ? 'Alsager Central Hub' : 'Community member',
          tier: fallbackEmail === 'stokie2605@gmail.com' ? 'distribution_hub' : 'grassroots_partner',
          primary_location: 'ST7',
          contact_phone: null,
          role: fallbackEmail === 'stokie2605@gmail.com' ? 'admin' : 'client',
        };

        setProfile(fallbackProfile);
        setSettingsOrgName(fallbackProfile.organization_name);
        setSettingsPhone('');
        setSettingsLocation(fallbackProfile.primary_location);
      }
    } catch (err) {
      console.error('Error getting organization profile details:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setSession({
          user: {
            id: user.uid,
            email: user.email,
          },
        });
        void fetchUserProfile(user.uid, user.email);
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    return unsubscribe;
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

    const userId = session.user.id;
    let isMounted = true;

    async function fetchUserDashboardPosts() {
      setUserPostsLoading(true);
      try {
        const [claimsResult, listingsResult] = await Promise.all([
          fetchPostsByReceiver(userId),
          fetchPostsByDonor(userId),
        ]);

        if (!isMounted) return;
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

    return () => {
      isMounted = false;
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

  const triggerOpenListingModal = () => {
    if (profile) {
      setFormState({
        ...emptyListingForm,
        location: profile.primary_location || 'Alsager',
        post_type: 'surplus',
        is_foodbank_suitable: profile.tier === 'commercial_donor',
      });
    } else {
      setFormState(emptyListingForm);
    }
    setIsModalOpen(true);
  };

  const handleSubmitListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user?.id) return;
    const userId = session.user.id;
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
        donor_id: userId,
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
    const userId = session.user.id;

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
        donor_id: userId,
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
    if (!session?.user?.id) return;
    const userId = session.user.id;
    setLoadingPostId(itemId);
    setSystemMessage(null);

    try {
      await claimSupper(itemId, userId);
      const claimedPost = posts.find((post) => post.id === itemId);

      if (claimedPost) {
        const updatedClaim: Post = {
          ...claimedPost,
          status: 'claimed',
          receiver_id: userId,
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

  const handleMarkClaimCollected = async (itemId: string) => {
    if (!session?.user?.id) {
      setSystemMessage({ type: 'error', text: 'Please sign in before completing a claimed post.' });
      return;
    }
    const userId = session.user.id;

    setCompletingPostId(itemId);
    setSystemMessage(null);

    try {
      await completeClaim(itemId, userId);
      const markCompleted = (post: Post): Post => ({ ...post, status: 'completed' });
      setMyClaims((current) => current.map((post) => (post.id === itemId ? markCompleted(post) : post)));
      setMyListings((current) => current.map((post) => (post.id === itemId ? markCompleted(post) : post)));
      setPosts((current) => current.filter((post) => post.id !== itemId));
      setSystemMessage({ type: 'success', text: 'Collection completed. The post is now closed.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Claim could not be marked as collected.';
      console.error('Detailed Completion Error:', message);
      setSystemMessage({ type: 'error', text: message });
    } finally {
      setCompletingPostId(null);
    }
  };

  const handleUpdateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user?.id) return;
    const userId = session.user.id;
    setIsSavingSettings(true);
    setSettingsSuccess(false);

    try {
      await updateDoc(doc(db, 'users', userId), {
        organization_name: settingsOrgName.trim(),
        contact_phone: settingsPhone.trim() || null,
        primary_location: settingsLocation.trim(),
      });
      
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

        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);

        await setDoc(doc(db, 'users', credential.user.uid), {
            uid: credential.user.uid,
            email: credential.user.email,
            role: 'client',
            roles: ['client'],
            isAdmin: false,
            isVolunteer: false,
            organization_name: 'Community member',
            tier: 'grassroots_partner',
            primary_location: cleanedLocation,
            contact_phone: null,
          }, { merge: true });

          setSettingsLocation(cleanedLocation);
          getCoordinatesFromPostcode(cleanedLocation)
            .then(setUserCoordinates)
            .catch((err) => console.error('Error geocoding registration location:', err));
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await signOut(firebaseAuth);
  };

  if (!session) {
    return (
      <AppShell>
        <div className="mx-auto w-full min-w-0 max-w-md rounded-3xl border border-brand-slateSoft bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6 min-w-0">
            <div className="mb-3 inline-flex rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
              Secure community access
            </div>
            <h1 className="break-words text-2xl font-black tracking-tight text-brand-forest sm:text-3xl">
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

  const isStaffProfile = profile?.role === 'partner' || profile?.role === 'volunteer' || profile?.role === 'moderator' || profile?.role === 'admin';
  const isHubManager = profile?.tier === 'distribution_hub' || isStaffProfile;
  const isCommercialDonor = profile?.tier === 'commercial_donor';
  const activeLocationLabel = profile?.primary_location || settingsLocation || defaultPostLocation.postcode;

  const isSystemAdminAccount = session?.user?.email === 'stokie2605@gmail.com';
  const redirectToPublicFeed = () => {
    setActiveView('community');
    setDashboardTab('find-food');
    setFilter('all');
  };

  if (!profile) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
          <p className="text-xs font-black uppercase tracking-widest text-teal-700">Loading your hub</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Checking your community profile...</p>
        </div>
      </AppShell>
    );
  }

  if (profile.role === 'client') {
    return (
      <AppShell>
        <div className="mb-4 min-w-0 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] sm:p-5">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex rounded-full bg-brand-cream px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-forest">
                Community client space
              </div>
              <h1 className="break-words text-2xl font-black tracking-tight text-brand-forest sm:text-3xl">Save Our Supper</h1>
              <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-500 sm:text-base">
                Peer support, useful crisis links, and donation needs for the local community.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-xl border border-brand-slateSoft bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm sm:w-auto"
            >
              Sign Out
            </button>
          </div>
        </div>

        <CommunityHub
          userId={session.user.id}
          authorName={profile.organization_name || session.user.email || 'Community member'}
          postcode={profile.primary_location}
          userRole={profile.role}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* ─── APP HEADER ─── */}
      <div className="relative mb-6 min-w-0 overflow-hidden rounded-3xl bg-slate-900 p-6 text-white shadow-2xl">
        <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="max-w-full break-words rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-300">
                Crisis Logistics Console
              </span>
              {profile && (
                <span className="max-w-full break-words rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300">
                  {profile.organization_name} / {profile.tier.replace('_', ' ')}
                </span>
              )}
            </div>
            <h1 className="break-words text-xl font-black tracking-tight text-emerald-400 sm:text-3xl">Save Our Supper</h1>
            <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-300">
              Live intake, stock, referrals, and access control for the local food support hub.
            </p>
          </div>
          <div className="relative flex w-full flex-wrap items-start gap-2 sm:w-auto sm:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Connected
            </span>
            <button
              type="button"
              onClick={triggerOpenListingModal}
              className="hidden rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg transition-all hover:bg-emerald-300 md:flex"
            >
              Add a Listing
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 shadow-sm transition-all hover:bg-white hover:text-slate-950"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-slate-800">1</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Volunteers on Shift</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-slate-800">{donationSessionTotal}</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Priority Points</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-slate-800">{donationSessionTotal}</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Needs Emptying</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_40px_-5px_rgba(15,23,42,0.06)] transform transition-all duration-300 hover:-translate-y-0.5">
          <p className="text-4xl font-black tracking-tight text-emerald-500">OK</p>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Hub Link</p>
        </div>
      </div>

      {/* ─── 📍 VISUAL TAB SWITCHER SYSTEM ─── */}
      <div className="mb-6 hidden min-w-0 gap-2 rounded-2xl bg-slate-100 p-1.5 md:flex md:flex-wrap md:items-center">
        <button
          type="button"
          onClick={() => setActiveView('community')}
          className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
            activeView === 'community'
              ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
              : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
          }`}
        >
          Community Feed
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView('feed');
            setDashboardTab('find-food');
            setFilter('all');
          }}
          className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
            activeView === 'feed' && dashboardTab === 'find-food'
              ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
              : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
          }`}
        >
          Donations Page
        </button>
        {isHubManager && (
          <>
            <button
              type="button"
              onClick={() => {
                setActiveView('inventory');
                setDashboardTab('my-listings');
              }}
              className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
                activeView === 'inventory'
                  ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
                  : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
              }`}
            >
              Stock Inventory Page
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('feed');
                setDashboardTab('my-claims');
                setFilter('my-claims');
              }}
              className={`min-w-0 rounded-xl py-2.5 text-center text-sm font-bold transition-all sm:flex-1 ${
                activeView === 'feed' && dashboardTab === 'my-claims'
                  ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
                  : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
              }`}
            >
              Referral Queue Page
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setActiveView('settings')}
          className={`min-w-0 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all ${
            activeView === 'settings'
              ? 'border border-emerald-200 bg-white text-emerald-700 shadow-xs'
              : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
          }`}
        >
          ⚙️ Settings
        </button>

        {isSystemAdminAccount && (
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`min-w-0 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all border border-red-200 ${
              activeView === 'admin' ? 'bg-red-600 text-white shadow-xs' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            🛡️ Admin Panel
          </button>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full justify-around border-t border-slate-200 bg-white p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] md:hidden" aria-label="Mobile staff navigation">
        <button
          type="button"
          onClick={() => setActiveView('community')}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
            activeView === 'community'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          aria-label="Community Feed"
          title="Community Feed"
        >
          <MessageIcon />
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView('feed');
            setDashboardTab('find-food');
            setFilter('all');
          }}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
            activeView === 'feed' && dashboardTab === 'find-food'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          aria-label="Donations Page"
          title="Donations Page"
        >
          <PlusCircleIcon />
        </button>

        {isHubManager ? (
          <>
            <button
              type="button"
              onClick={() => {
                setActiveView('inventory');
                setDashboardTab('my-listings');
              }}
              className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
                activeView === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label="Stock Inventory Page"
              title="Stock Inventory Page"
            >
              <PackageIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('feed');
                setDashboardTab('my-claims');
                setFilter('my-claims');
              }}
              className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
                activeView === 'feed' && dashboardTab === 'my-claims'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label="Referral Queue Page"
              title="Referral Queue Page"
            >
              <UsersIcon />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveView('settings')}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
            activeView === 'settings'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>

        {isSystemAdminAccount ? (
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`grid h-11 w-11 place-items-center rounded-2xl transition-all ${
              activeView === 'admin'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-red-600 hover:bg-red-50 hover:text-red-700'
            }`}
            aria-label="Admin Panel"
            title="Admin Panel"
          >
            <LockIcon />
          </button>
        ) : null}
      </nav>

      {/* ─── VIEW VIEWPORTS ─── */}

      {/* VIEW A: STANDALONE COMMUNITY FEED */}
      {activeView === 'community' && (
        <CommunityHub
          userId={session.user.id}
          authorName={profile.organization_name || session.user.email || 'Community member'}
          postcode={profile.primary_location}
          userRole={profile.role}
        />
      )}

      {/* VIEW B: OPERATIONS FEED */}
      {activeView === 'feed' && (
        <>
          {dashboardTab === 'find-food' ? (
            <AuthGuard
              uid={session?.user?.id}
              fallbackEmail={session?.user?.email}
              allowedRoles={foodbankAccessRoles}
              onAccessDenied={redirectToPublicFeed}
            >
              <IntakePortal
                onQueuedItemsChange={setDonationSessionTotal}
                userId={session.user.id}
                userRole={profile.role}
              />
            </AuthGuard>
          ) : null}

          {dashboardTab === 'my-claims' ? (
            <AuthGuard
              uid={session?.user?.id}
              fallbackEmail={session?.user?.email}
              allowedRoles={referralAccessRoles}
              onAccessDenied={redirectToPublicFeed}
            >
              <ReferralQueue userId={session.user.id} userRole={profile.role} />
            </AuthGuard>
          ) : null}

          {showLegacyCommunityBoard && dashboardTab === 'find-food' ? (
            <div className="mb-5 min-w-0 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-xs font-bold uppercase tracking-wide text-brand-forest">Local community board</p>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                    Showing posts near <span className="font-semibold text-slate-700">{activeLocationLabel}</span> within {searchRadiusMiles} miles.
                  </p>
                </div>
                <label className="grid w-full min-w-0 gap-2 rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 sm:min-w-72 sm:w-auto">
                  <span className="flex items-center justify-between gap-3">
                    Search Radius
                    <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold normal-case tracking-normal text-brand-forest shadow-xs">
                      {searchRadiusMiles} {searchRadiusMiles === 1 ? 'mile' : 'miles'}
                    </span>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="25"
                    step="1"
                    value={searchRadiusMiles}
                    onChange={(event) => setSearchRadiusMiles(Number(event.target.value))}
                    className="h-2 w-full cursor-pointer accent-brand-forest"
                    aria-label={`Search radius: ${searchRadiusMiles} miles`}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {showLegacyCommunityBoard && dashboardTab === 'find-food' ? (
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

          {showLegacyCommunityBoard && dashboardTab === 'find-food' ? (
            <FoodMap
              posts={filteredPosts}
              userCoordinates={userCoordinates}
              onReservePost={handleClaimListing}
            />
          ) : null}

          {showLegacyCommunityBoard && dashboardTab === 'find-food' && loading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Loading live feed...</div>
          ) : null}

          {showLegacyCommunityBoard && dashboardTab === 'find-food' && !loading && filteredPosts.length === 0 ? (
            <div className="min-w-0 rounded-2xl border border-dashed border-brand-slateSoft bg-white px-4 py-14 text-center shadow-xs sm:px-5">
              <p className="break-words text-lg font-bold tracking-tight text-slate-700">No local board posts found.</p>
              <p className="mx-auto mt-2 max-w-xl break-words text-sm leading-6 text-slate-500">
                No community board posts found near {activeLocationLabel} within {searchRadiusMiles} miles yet. Share a neighbor update above to get the local board started.
              </p>
            </div>
          ) : null}

          {showLegacyCommunityBoard && dashboardTab === 'find-food' && !loading && filteredPosts.length > 0 ? (
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
                        <span className="inline-flex max-w-full break-words rounded-full bg-[#FBF7EF] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-brand-forest">
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

          {showLegacyCommunityBoard && dashboardTab === 'my-claims' ? (
            <UserPostList
              posts={myClaims}
              loading={userPostsLoading}
              emptyMessage="You have not claimed any food posts yet."
              completingPostId={completingPostId}
              onMarkCollected={handleMarkClaimCollected}
            />
          ) : null}

          {showLegacyCommunityBoard && dashboardTab === 'my-listings' ? (
            <UserPostList
              posts={myListings}
              loading={userPostsLoading}
              emptyMessage="You have not listed any food posts yet."
            />
          ) : null}
        </>
      )}

      {/* VIEW B: WAREHOUSE STOCK LEVELS */}
      {isHubManager && activeView === 'inventory' && <LiveInventory />}
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
                  type="text"
                  value={settingsPhone}
                  onChange={(e) => setSettingsPhone(e.target.value)}
                  placeholder="e.g. +44 1782 ..."
                  className="rounded-xl border border-brand-slateSoft bg-brand-cream px-3 py-2.5 text-slate-900 font-medium outline-none focus:border-brand-forest"
                />
              </label>
            </div>

            <div className="mt-2 min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              🔒 <strong>Operational Access Tier Level:</strong> <code className="bg-white font-mono px-1 py-0.5 rounded border ml-1 text-slate-700 uppercase font-bold">{profile?.tier}</code>
              <p className="mt-1 break-words">Tier authorization metrics are immutable at standard configuration level. To modify security tier clearance, contact council administrators.</p>
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
            </button>
          </form>

        </div>
      )}

      {/* 🛡️ VIEW E: SECURE SYSTEM ADMINISTRATION VIEWPORT */}
      {activeView === 'admin' && (
        <AuthGuard
          uid={session?.user?.id}
          fallbackEmail={session?.user?.email}
          allowedRoles={adminAccessRoles}
          onAccessDenied={redirectToPublicFeed}
        >
          <RoleAdminPanel />
        </AuthGuard>
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










