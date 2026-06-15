import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, arrayUnion, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import type { UserRole } from '../types/user';
import { IntakePortal } from './foodbank/IntakePortal';

type CommunityHubProps = {
  userId?: string;
  authorName?: string;
  postcode?: string;
  userRole?: UserRole;
};

type WishlistItem = {
  id: string;
  label: string;
  currentQuantity: number;
};

type TipReply = {
  body: string;
  authorName: string;
  authorId: string;
  createdAt: string;
};

type KitchenTip = {
  id: string;
  title: string;
  body: string;
  replies: TipReply[];
  createdAt: string;
  archived: boolean;
};

const lowStockThreshold = 20;

const defaultKitchenTips: KitchenTip[] = [
  {
    id: 'default-tinned-tomatoes',
    title: 'Nutritious meals from tinned tomatoes',
    body: 'Tinned tomatoes can become pasta sauce, soup, chilli base, or a simple stew with beans and rice.',
    replies: [],
    createdAt: new Date(0).toISOString(),
    archived: false,
  },
  {
    id: 'default-uht-milk',
    title: 'Making UHT milk go further',
    body: 'UHT milk works well for porridge, custard, packet sauces, and hot drinks when fresh milk is limited.',
    replies: [],
    createdAt: new Date(0).toISOString(),
    archived: false,
  },
  {
    id: 'default-tinned-fish',
    title: 'Simple protein from tinned fish',
    body: 'Tinned tuna, salmon, and sardines can be mixed with pasta, rice, potatoes, or beans for quick filling meals.',
    replies: [],
    createdAt: new Date(0).toISOString(),
    archived: false,
  },
];

const resourceLinks = [
  {
    title: 'Alsager Central Hub Hours',
    description: 'Opening times, drop-off guidance, and local hub notes.',
    href: 'https://www.alsagerfoodbank.org.uk/',
  },
  {
    title: 'Council Support Lines',
    description: 'Local authority routes for urgent support and welfare advice.',
    href: 'https://www.cheshireeast.gov.uk/',
  },
  {
    title: 'Citizens Advice Crisis Pathways',
    description: 'Benefits, debt, housing, and emergency advice routes.',
    href: 'https://www.citizensadvice.org.uk/',
  },
];

function getCreatedAt(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function formatDisplayLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTipDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return 'Pinned guide';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function CommunityHub({ userId, authorName = 'Community member', userRole }: CommunityHubProps) {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [tips, setTips] = useState<KitchenTip[]>(defaultKitchenTips);
  const [openTipId, setOpenTipId] = useState(defaultKitchenTips[0]?.id ?? '');
  const [newTipTitle, setNewTipTitle] = useState('');
  const [newTipBody, setNewTipBody] = useState('');
  const [isPostingTip, setIsPostingTip] = useState(false);
  const [replyingTipId, setReplyingTipId] = useState<string | null>(null);
  const [replyTextByTip, setReplyTextByTip] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const canPostTips = userRole === 'admin' || userRole === 'moderator' || userRole === 'volunteer';

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'inventory'),
      (snapshot) => {
        const nextWishlist = snapshot.docs
          .map((stockSnapshot) => {
            const data = stockSnapshot.data();
            return {
              id: stockSnapshot.id,
              label: typeof data.label === 'string' && data.label.trim()
                ? data.label
                : typeof data.item_name === 'string' && data.item_name.trim()
                  ? data.item_name
                  : formatDisplayLabel(stockSnapshot.id),
              currentQuantity: Number(data.current_quantity ?? data.quantity) || 0,
            };
          })
          .filter((item) => item.currentQuantity <= lowStockThreshold)
          .sort((a, b) => a.currentQuantity - b.currentQuantity);

        setWishlist(nextWishlist);
      },
      (error) => {
        console.error('Public wishlist stream failed:', error);
        setWishlist([]);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'kitchen_tips'),
      (snapshot) => {
        const liveTips = snapshot.docs
          .map((tipSnapshot) => {
            const data = tipSnapshot.data();
            return {
              id: tipSnapshot.id,
              title: String(data.title ?? 'Kitchen tip'),
              body: String(data.body ?? data.description ?? '').trim(),
              createdAt: getCreatedAt(data.created_at ?? data.createdAt),
              archived: data.archived === true,
              replies: Array.isArray(data.replies)
                ? data.replies
                    .map((reply) => {
                      const replyData = reply && typeof reply === 'object' ? reply as Partial<TipReply> : {};
                      return {
                        body: String(replyData.body ?? '').trim(),
                        authorName: String(replyData.authorName ?? 'Community member'),
                        authorId: String(replyData.authorId ?? 'unknown'),
                        createdAt: getCreatedAt(replyData.createdAt),
                      };
                    })
                    .filter((reply) => reply.body.length > 0)
                : [],
            } satisfies KitchenTip;
          })
          .filter((tip): tip is KitchenTip => Boolean(tip && tip.body && !tip.archived))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setTips([...liveTips, ...defaultKitchenTips]);
      },
      (error) => {
        console.error('Kitchen tips stream failed:', error);
      },
    );

    return () => unsubscribe();
  }, []);

  const activeTip = useMemo(() => tips.find((tip) => tip.id === openTipId) ?? tips[0], [openTipId, tips]);

  const handleSubmitTip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canPostTips || !userId) return;
    const title = newTipTitle.trim();
    const body = newTipBody.trim();
    if (!title || !body) {
      setMessage({ tone: 'error', text: 'Add both a title and the tip text.' });
      return;
    }

    setIsPostingTip(true);
    setMessage(null);
    try {
      await addDoc(collection(db, 'kitchen_tips'), {
        title,
        body,
        author_name: authorName,
        author_id: userId,
        archived: false,
        created_at: new Date().toISOString(),
      });
      setNewTipTitle('');
      setNewTipBody('');
      setMessage({ tone: 'success', text: 'Kitchen tip published.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not publish this tip.' });
    } finally {
      setIsPostingTip(false);
    }
  };

  const handleSubmitReply = async (tip: KitchenTip) => {
    if (!userId) {
      setMessage({ tone: 'error', text: 'Please sign in before replying.' });
      return;
    }
    const body = (replyTextByTip[tip.id] ?? '').trim();
    if (!body) {
      setMessage({ tone: 'error', text: 'Write a short reply before sending it.' });
      return;
    }
    if (tip.id.startsWith('default-')) {
      setMessage({ tone: 'error', text: 'Replies can be added to live hub tips once staff publish them.' });
      return;
    }

    try {
      await updateDoc(doc(db, 'kitchen_tips', tip.id), {
        replies: arrayUnion({
          body,
          authorName,
          authorId: userId,
          createdAt: new Date().toISOString(),
        }),
      });
      setReplyTextByTip((current) => ({ ...current, [tip.id]: '' }));
      setReplyingTipId(null);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not send this reply.' });
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl min-w-0 gap-6 px-4 py-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Public Community Hub</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-brand-forest">Save Our Supper Resource Centre</h1>
        <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-slate-600">
          A curated, ad-free place for current donation needs, local support links, and practical kitchen guidance.
        </p>
      </section>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
          message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Live Wishlist</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Most Needed This Week</h2>
          <div className="mt-4 grid gap-2">
            {wishlist.length === 0 ? (
              <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm font-bold text-emerald-700">
                No urgent shortages showing right now.
              </p>
            ) : (
              wishlist.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-3 py-3">
                  <span className="break-words text-sm font-black text-slate-800">{item.label}</span>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-amber-800">{item.currentQuantity}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-teal-700">Local Help</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Crisis Resources</h2>
          <div className="mt-4 grid gap-3">
            {resourceLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
              >
                <span className="block text-sm font-black text-slate-900">{link.title}</span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{link.description}</span>
              </a>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Kitchen Tips & Tricks</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Useful Food Ideas</h2>

          {canPostTips ? (
            <form onSubmit={handleSubmitTip} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <input
                value={newTipTitle}
                onChange={(event) => setNewTipTitle(event.target.value)}
                placeholder="Tip title"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500"
              />
              <textarea
                value={newTipBody}
                onChange={(event) => setNewTipBody(event.target.value)}
                placeholder="Add a short practical kitchen tip..."
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
              />
              <button type="submit" disabled={isPostingTip} className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-emerald-600 disabled:opacity-50">
                {isPostingTip ? 'Posting...' : 'Post Official Tip'}
              </button>
            </form>
          ) : null}

          <div className="mt-4 grid gap-2">
            {tips.map((tip) => (
              <button
                key={tip.id}
                type="button"
                onClick={() => setOpenTipId(tip.id)}
                className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                  activeTip?.id === tip.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="block text-sm font-black text-slate-900">{tip.title}</span>
                <span className="mt-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{formatTipDate(tip.createdAt)}</span>
              </button>
            ))}
          </div>

          {activeTip ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-black text-slate-950">{activeTip.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{activeTip.body}</p>
              {activeTip.replies.length > 0 ? (
                <ul className="mt-3 space-y-1 border-l-2 border-emerald-100 pl-3">
                  {activeTip.replies.map((reply, index) => (
                    <li key={`${reply.createdAt}-${index}`} className="break-words text-xs leading-5 text-slate-600">
                      <span className="font-bold text-emerald-700">{reply.authorName}: </span>
                      {reply.body}
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                onClick={() => setReplyingTipId((current) => current === activeTip.id ? null : activeTip.id)}
                className="mt-3 text-xs font-bold text-slate-500 underline-offset-4 hover:text-emerald-700 hover:underline"
              >
                Reply
              </button>
              {replyingTipId === activeTip.id ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={replyTextByTip[activeTip.id] ?? ''}
                    onChange={(event) => setReplyTextByTip((current) => ({ ...current, [activeTip.id]: event.target.value }))}
                    placeholder="Add a helpful reply..."
                    className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSubmitReply(activeTip)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-600"
                  >
                    Send
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>

      {userId ? (
        <section>
          <IntakePortal userId={userId} userRole={userRole ?? 'partner'} />
        </section>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold leading-6 text-slate-600 shadow-sm">
          Sign in to report full collection bins or access the live collection points tracker.
        </section>
      )}
    </main>
  );
}

export default CommunityHub;
