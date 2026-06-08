import type { Post } from '../lib/posts';

interface FoodCardProps {
  post: Post;
  currentUserId?: string;
  onReserve: (postId: string) => void;
}

const fallbackFoodImage = 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=500&auto=format&fit=crop&q=80';

export function FoodCard({ post, currentUserId, onReserve }: FoodCardProps) {
  const expiryDate = new Date(post.expiry_time);
  const isOwnPost = post.donor_id === currentUserId;

  return (
    <article className="bg-white border border-brand-slateSoft rounded-2xl p-6 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between">
      <div>
        <img
          src={fallbackFoodImage}
          alt=""
          className="mb-5 h-40 w-full rounded-2xl object-cover border border-brand-slateSoft bg-brand-cream"
          loading="lazy"
        />

        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
            Available
          </span>
          <span className="rounded-md border border-brand-slateSoft bg-brand-cream px-2 py-0.5 text-xs font-medium text-brand-forest">
            {post.postcode}
          </span>
        </div>

        <h3 className="text-slate-900 font-bold text-xl tracking-tight leading-tight">{post.title}</h3>

        {post.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-slate-500">{post.description}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-brand-cream px-3 py-1 font-semibold text-brand-forest">
            {post.quantity}
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-700 border border-brand-slateSoft">
            Expires {expiryDate.toLocaleString('en-GB', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={isOwnPost}
          onClick={() => onReserve(post.id)}
          className="w-full mt-4 bg-brand-amber hover:bg-[#cc7a00] text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs hover:shadow-sm active:scale-[0.98] transition-all text-center block text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          {isOwnPost ? 'Your Post' : 'Reserve'}
        </button>
      </div>
    </article>
  );
}
