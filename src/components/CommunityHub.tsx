import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { defaultHubCoordinates } from '../lib/posts';

type CommunityHubProps = {
  userId: string;
  authorName: string;
  postcode?: string;
};

type CommunityPost = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  postcode?: string;
};

type WishlistItem = {
  id: string;
  label: string;
  quantity: number;
};

const lowStockThreshold = 10;

const usefulLinks = [
  {
    label: 'Debt and benefits advice',
    description: 'Free, independent help with debt, benefits, bills, and household money worries.',
    href: 'https://www.citizensadvice.org.uk/',
  },
  {
    label: 'Housing support',
    description: 'Guidance for homelessness risk, renting problems, repairs, and emergency housing rights.',
    href: 'https://england.shelter.org.uk/',
  },
  {
    label: 'Mental health support',
    description: 'Plain-language information and routes to urgent support for mental health concerns.',
    href: 'https://www.mind.org.uk/need-urgent-help/',
  },
  {
    label: 'NHS 111',
    description: 'Medical help when it is not a 999 emergency.',
    href: 'https://111.nhs.uk/',
  },
  {
    label: 'Help with energy and bills',
    description: 'Check government guidance on cost-of-living support, energy help, and grants.',
    href: 'https://www.gov.uk/cost-of-living',
  },
  {
    label: 'Turn2us grants search',
    description: 'Search for charitable grants and support funds that may match your situation.',
    href: 'https://www.turn2us.org.uk/',
  },
];

function formatDisplayLabel(value: string | undefined) {
  return (value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCreatedAt(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  return new Date().toISOString();
}

function formatPostDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CommunityHub({ userId, authorName, postcode = 'Local area' }: CommunityHubProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [postText, setPostText] = useState('');
  const [activeMobilePanel, setActiveMobilePanel] = useState<'board' | 'wishlist' | 'links'>('board');
  const [isPosting, setIsPosting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'posts'),
      (snapshot) => {
        const communityPosts = snapshot.docs
          .map((documentSnapshot) => {
            const data = documentSnapshot.data();
            const body = String(data.description ?? data.body ?? data.title ?? '').trim();

            return {
              id: documentSnapshot.id,
              body,
              authorName: String(data.author_name ?? data.authorName ?? 'Community member'),
              createdAt: getCreatedAt(data.created_at ?? data.createdAt),
              postcode: typeof data.postcode === 'string' ? data.postcode : undefined,
            } satisfies CommunityPost;
          })
          .filter((post) => post.body.length > 0)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setPosts(communityPosts);
      },
      (error) => {
        console.error('Community noticeboard stream failed:', error);
        setMessage({ tone: 'error', text: 'Could not load the community noticeboard right now.' });
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'inventory'),
      (snapshot) => {
        const lowStockItems = snapshot.docs
          .map((documentSnapshot) => {
            const data = documentSnapshot.data();
            return {
              id: documentSnapshot.id,
              label: formatDisplayLabel(data.label ?? data.item_name ?? documentSnapshot.id),
              quantity: Number(data.current_quantity) || 0,
            } satisfies WishlistItem;
          })
          .filter((item) => item.quantity <= lowStockThreshold)
          .sort((a, b) => a.quantity - b.quantity || a.label.localeCompare(b.label));

        setWishlist(lowStockItems);
      },
      (error) => {
        console.error('Community wishlist stream failed:', error);
        setMessage({ tone: 'error', text: 'Could not load the current donation wishlist.' });
      },
    );

    return () => unsubscribe();
  }, []);

  const shortPostcode = useMemo(() => postcode.trim().toUpperCase().split(/\s+/)[0] || 'LOCAL', [postcode]);

  const handleSubmitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = postText.trim();

    if (!body) {
      setMessage({ tone: 'error', text: 'Write a short note before sharing it.' });
      return;
    }

    setIsPosting(true);
    setMessage(null);

    try {
      const now = new Date().toISOString();
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);

      await addDoc(collection(db, 'posts'), {
        title: 'Community notice',
        description: body,
        body,
        author_name: authorName || 'Community member',
        author_id: userId,
        donor_id: userId,
        quantity: 'Community notice',
        category: 'community-update',
        board_type: 'citizen_post',
        status: 'available',
        postcode: shortPostcode,
        lat: defaultHubCoordinates.lat,
        lon: defaultHubCoordinates.lon,
        lng: defaultHubCoordinates.lon,
        expiry_time: expiry.toISOString(),
        expires_at: expiry.toISOString(),
        created_at: now,
      });

      setPostText('');
      setMessage({ tone: 'success', text: 'Your notice has been shared with the community.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not share your notice right now.';
      setMessage({ tone: 'error', text });
    } finally {
      setIsPosting(false);
    }
  };

  const feedPanel = (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Community noticeboard</p>
        <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950">Share local support</h2>
        <p className="mt-1 break-words text-sm leading-6 text-slate-500">
          A quiet, ad-free place for useful tips, recipes, donation ideas, and neighbor-to-neighbor support.
        </p>
      </div>

      <form onSubmit={handleSubmitPost} className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-800">Share a tip or recipe...</span>
          <textarea
            value={postText}
            onChange={(event) => setPostText(event.target.value)}
            rows={4}
            placeholder="Example: A simple meal idea, a local support tip, or something helpful for neighbours."
            className="min-h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={isPosting}
          className="mt-3 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
        >
          {isPosting ? 'Sharing...' : 'Share with the community'}
        </button>
      </form>

      {message ? (
        <div
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid max-h-[65vh] gap-3 overflow-y-auto overscroll-contain pr-1 md:max-h-none md:overflow-visible md:pr-0">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-400">
            No community notices yet. Be the first to share something useful.
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                <span className="rounded-full bg-emerald-50 px-3 py-1 uppercase tracking-wide text-emerald-700">
                  {post.authorName}
                </span>
                <span>{formatPostDate(post.createdAt)}</span>
                {post.postcode ? <span className="rounded-full bg-slate-100 px-2 py-1">{post.postcode}</span> : null}
              </div>
              <p className="break-words text-base leading-7 text-slate-800">{post.body}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );

  const wishlistPanel = (
    <aside className="min-w-0 rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm sm:p-5">
      <p className="text-xs font-black uppercase tracking-widest text-amber-700">Donation wishlist</p>
      <h3 className="mt-2 break-words text-xl font-black tracking-tight text-slate-950">Most needed now</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Read-only stock signals from the food bank shelves.</p>

      <div className="mt-4 grid gap-2">
        {wishlist.length === 0 ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800">
            No urgent low-stock items are showing right now.
          </p>
        ) : (
          wishlist.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3">
              <span className="min-w-0 break-words text-sm font-black text-slate-800">{item.label}</span>
              <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                {item.quantity} left
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  );

  const linksPanel = (
    <aside className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-black uppercase tracking-widest text-teal-700">Local help and resources</p>
      <h3 className="mt-2 break-words text-xl font-black tracking-tight text-slate-950">Useful links</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">Simple routes to help. No ads, no clutter.</p>

      <div className="mt-4 grid gap-3">
        {usefulLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white hover:shadow-sm"
          >
            <span className="block break-words text-sm font-black text-slate-900">{link.label}</span>
            <span className="mt-1 block break-words text-xs leading-5 text-slate-500">{link.description}</span>
          </a>
        ))}
      </div>
    </aside>
  );

  return (
    <div className="grid min-w-0 gap-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Public Community Hub</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-brand-forest">Welcome to Save Our Supper</h1>
        <p className="mt-2 max-w-3xl break-words text-base leading-7 text-slate-600">
          A calm place to share practical food support, see what the food bank most needs, and find trusted help links.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5 md:hidden">
        {([
          ['board', 'Board'],
          ['wishlist', 'Wishlist'],
          ['links', 'Links'],
        ] as const).map(([panel, label]) => (
          <button
            key={panel}
            type="button"
            onClick={() => setActiveMobilePanel(panel)}
            className={`rounded-xl px-3 py-2.5 text-sm font-black transition-all ${
              activeMobilePanel === panel ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-5 md:grid-cols-3 md:items-start">
        <div className={`${activeMobilePanel === 'wishlist' ? 'block' : 'hidden'} md:order-1 md:block`}>
          {wishlistPanel}
        </div>
        <div className={`${activeMobilePanel === 'board' ? 'block' : 'hidden'} min-w-0 md:order-2 md:block`}>
          {feedPanel}
        </div>
        <div className={`${activeMobilePanel === 'links' ? 'block' : 'hidden'} md:order-3 md:block`}>
          {linksPanel}
        </div>
      </div>
    </div>
  );
}

export default CommunityHub;


