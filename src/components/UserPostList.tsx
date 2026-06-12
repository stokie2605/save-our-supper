import type { Post } from '../lib/posts';
import { ExpiryCountdown } from './ExpiryCountdown';

interface UserPostListProps {
  emptyMessage: string;
  loading: boolean;
  posts: Post[];
}

export function UserPostList({ emptyMessage, loading, posts }: UserPostListProps) {
  if (loading) {
    return <div className="text-center py-12 text-slate-400 font-medium">Loading posts...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-16 px-4">
        <p className="text-slate-400 font-medium text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {posts.map((post) => (
        <article
          key={post.id}
          className="flex min-w-0 flex-col gap-3 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              <span className="max-w-full break-words rounded-md border border-brand-slateSoft bg-brand-cream px-2 py-0.5 font-bold uppercase text-brand-forest">
                {post.status}
              </span>
              <span className="max-w-full break-words rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                {post.postcode}
              </span>
              <ExpiryCountdown expiresAt={post.expiry_time} />
            </div>
            <h3 className="break-words text-lg font-bold tracking-tight text-slate-900">{post.title}</h3>
            {post.description ? <p className="mt-1 break-words text-sm text-slate-500">{post.description}</p> : null}
          </div>

          <div className="w-full min-w-0 text-left text-sm text-slate-600 sm:w-auto sm:shrink-0 sm:text-right">
            <p className="break-words font-semibold text-slate-900">{post.quantity}</p>
            <p>
              {new Date(post.expiry_time).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
