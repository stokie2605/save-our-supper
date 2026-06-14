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
  const [postText, setPostText] = useState('');
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
    <section className="min-w-0 bg-white p-4 shadow-sm sm:rounded-3xl sm:border sm:border-slate-200 sm:p-5">
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

      <div className="grid grid-cols-1 gap-0">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-400">
            No community notices yet. Be the first to share something useful.
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="flex w-full flex-col gap-1 border-b border-gray-100 bg-white px-4 py-3 text-left">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-gray-500 md:text-sm">
                <span className="min-w-0 break-words font-semibold text-emerald-700">{post.authorName}</span>
                {post.postcode ? (
                  <>
                    <span aria-hidden="true">&bull;</span>
                    <span className="shrink-0 uppercase tracking-wide">{post.postcode}</span>
                  </>
                ) : null}
                <span aria-hidden="true">&bull;</span>
                <span className="shrink-0">{formatPostDate(post.createdAt)}</span>
              </div>
              <p className="line-clamp-3 break-words pt-0.5 text-sm leading-relaxed text-gray-800 md:text-base">{post.body}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );


  return (
    <main className="mx-auto grid w-full max-w-4xl min-w-0 gap-5 px-4 py-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Community Feed</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-brand-forest">Welcome to Save Our Supper</h1>
        <p className="mt-2 max-w-3xl break-words text-base leading-7 text-slate-600">
          A calm place to share practical food support and local notes without the foodbank operations dashboard around it.
        </p>
      </div>

      {feedPanel}
    </main>
  );
}

export default CommunityHub;









