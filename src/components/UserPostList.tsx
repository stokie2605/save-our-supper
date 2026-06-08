import type { Post } from '../lib/posts';

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
    <div className="grid gap-3">
      {posts.map((post) => (
        <article
          key={post.id}
          className="flex flex-col gap-3 rounded-2xl border border-brand-slateSoft bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-brand-slateSoft bg-brand-cream px-2 py-0.5 font-bold uppercase text-brand-forest">
                {post.status}
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                {post.postcode}
              </span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">{post.title}</h3>
            {post.description ? <p className="mt-1 text-sm text-slate-500">{post.description}</p> : null}
          </div>

          <div className="shrink-0 text-left text-sm text-slate-600 sm:text-right">
            <p className="font-semibold text-slate-900">{post.quantity}</p>
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
