import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, increment, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { defaultHubCoordinates } from '../lib/posts';
import type { UserRole } from '../types/user';

type CommunityHubProps = {
  userId: string;
  authorName: string;
  postcode?: string;
  userRole?: UserRole;
};

type CommunityPost = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  postcode?: string;
  status?: string;
  verifiedCount: number;
  archived: boolean;
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

function maskPostcodeForCommunity(location: string, role: string) {
  const canSeeFullPostcode = ['admin', 'mod', 'moderator', 'partner'].includes(role.toLowerCase().trim());

  if (canSeeFullPostcode) {
    return location;
  }

  return location.replace(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/gi, (_, outwardCode: string) =>
    outwardCode.toUpperCase(),
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 7.5 9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 7.5v9l9 4 9-4v-9M12 11.5v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CommunityHub({ userId, authorName, postcode = 'Local area', userRole = 'client' }: CommunityHubProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postText, setPostText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [activePostAction, setActivePostAction] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const canModerate = userRole === 'admin' || userRole === 'moderator';

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
              status: typeof data.status === 'string' ? data.status : 'available',
              verifiedCount: Number(data.verifiedCount ?? 0),
              archived: data.archived === true,
            } satisfies CommunityPost;
          })
          .filter((post) => post.body.length > 0 && !post.archived)
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
    const handleScroll = () => {
      setShowScrollButton(window.scrollY > 400);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  const shortPostcode = useMemo(() => postcode.trim().toUpperCase().split(/\s+/)[0] || 'LOCAL', [postcode]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const handleVerifyPost = async (postId: string) => {
    setActivePostAction(`verify-${postId}`);
    setMessage(null);

    try {
      await updateDoc(doc(db, 'posts', postId), {
        verifiedCount: increment(1),
        verified_at: new Date().toISOString(),
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not verify this notice right now.';
      setMessage({ tone: 'error', text });
    } finally {
      setActivePostAction(null);
    }
  };

  const handleClaimPost = async (postId: string) => {
    setActivePostAction(`claim-${postId}`);
    setMessage(null);

    try {
      await updateDoc(doc(db, 'posts', postId), {
        status: 'claimed',
        receiver_id: userId,
        claimed_at: new Date().toISOString(),
      });
      setMessage({ tone: 'success', text: 'Marked as claimed so the community knows it has gone.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not mark this notice as claimed.';
      setMessage({ tone: 'error', text });
    } finally {
      setActivePostAction(null);
    }
  };

  const handleArchivePost = async (postId: string) => {
    if (!canModerate) return;

    setActivePostAction(`archive-${postId}`);
    setMessage(null);

    try {
      await updateDoc(doc(db, 'posts', postId), {
        archived: true,
        archived_by: userId,
        archived_at: new Date().toISOString(),
      });
      setMessage({ tone: 'success', text: 'The notice has been taken down from the public feed.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not take down this notice.';
      setMessage({ tone: 'error', text });
    } finally {
      setActivePostAction(null);
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
          posts.map((post) => {
            const isClaimed = post.status === 'claimed';
            const displayPostcode = post.postcode ? maskPostcodeForCommunity(post.postcode, userRole) : undefined;

            return (
              <article
                key={post.id}
                className={`flex w-full flex-col gap-1 border-b border-gray-100 bg-white px-4 py-3 text-left transition-colors ${
                  isClaimed ? 'bg-slate-50/70 text-slate-400' : ''
                }`}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-gray-500 md:text-sm">
                    <span className="min-w-0 break-words font-semibold text-emerald-700">{post.authorName}</span>
                    {displayPostcode ? (
                      <>
                        <span aria-hidden="true">&bull;</span>
                        <span className="max-w-full break-words uppercase tracking-wide">{displayPostcode}</span>
                      </>
                    ) : null}
                    <span aria-hidden="true">&bull;</span>
                    <span className="shrink-0">{formatPostDate(post.createdAt)}</span>
                    {isClaimed ? (
                      <>
                        <span aria-hidden="true">&bull;</span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700">
                          Claimed
                        </span>
                      </>
                    ) : null}
                  </div>

                  {canModerate ? (
                    <button
                      type="button"
                      onClick={() => handleArchivePost(post.id)}
                      disabled={activePostAction === `archive-${post.id}`}
                      className="shrink-0 rounded-full border border-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Take Down
                    </button>
                  ) : null}
                </div>

                <p className={`line-clamp-3 break-words pt-0.5 text-sm leading-relaxed md:text-base ${
                  isClaimed ? 'text-slate-400' : 'text-gray-800'
                }`}>
                  {post.body}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleVerifyPost(post.id)}
                    disabled={activePostAction === `verify-${post.id}` || isClaimed}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckIcon />
                    Verify{post.verifiedCount > 0 ? ` ${post.verifiedCount}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClaimPost(post.id)}
                    disabled={activePostAction === `claim-${post.id}` || isClaimed}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PackageIcon />
                    {isClaimed ? 'Claimed' : 'Claimed?'}
                  </button>
                </div>
              </article>
            );
          })
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

      {showScrollButton ? (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 grid h-12 w-12 place-items-center rounded-full border border-emerald-200 bg-white text-emerald-700 shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          aria-label="Back to top"
          title="Back to top"
        >
          <ArrowUpIcon />
        </button>
      ) : null}
    </main>
  );
}

export default CommunityHub;









