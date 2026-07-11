/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';

export interface SupportLinkItem {
  id: string;
  name: string;
  description: string;
  url: string;
  phone?: string;
  category: string;
  order: number;
}

interface SupportServiceSeed {
  name: string;
  description: string;
  url: string;
  phone?: string;
  category: string;
  order: number;
}

const defaultSupportLinks: SupportServiceSeed[] = [
  // Mental Health
  {
    category: 'Mental Health',
    name: 'Cheshire & Wirral NHS Foundation Trust',
    description: 'Local NHS mental health, CAMHS, and community wellbeing.',
    url: 'https://www.cwp.nhs.uk',
    phone: '01244 397397',
    order: 0,
  },
  {
    category: 'Mental Health',
    name: 'Samaritans',
    description: 'Free, confidential support available 24 hours a day.',
    url: 'https://www.samaritans.org',
    phone: '116 123',
    order: 1,
  },
  {
    category: 'Mental Health',
    name: 'Mind',
    description: 'Mental health information and routes into local support.',
    url: 'https://www.mind.org.uk',
    order: 2,
  },
  // Debt & Financial
  {
    category: 'Debt & Financial',
    name: 'Citizens Advice Cheshire East',
    description: 'Advice on money, debt, benefits, housing, and more.',
    url: 'https://www.citizensadvicece.org.uk/',
    phone: '0808 278 7893',
    order: 0,
  },
  {
    category: 'Debt & Financial',
    name: 'StepChange Debt Charity',
    description: 'Free debt advice and practical repayment plans.',
    url: 'https://www.stepchange.org',
    phone: '0800 138 1111',
    order: 1,
  },
  {
    category: 'Debt & Financial',
    name: 'National Debtline',
    description: 'Free independent debt guidance by phone and online.',
    url: 'https://www.nationaldebtline.org',
    phone: '0808 808 4000',
    order: 2,
  },
  // Benefits & Housing
  {
    category: 'Benefits & Housing',
    name: 'Cheshire East Housing Options',
    description: 'Housing advice, homelessness support, and local help.',
    url: 'https://www.cheshireeast.gov.uk/housing',
    phone: '0300 123 5500',
    order: 0,
  },
  {
    category: 'Benefits & Housing',
    name: 'Plus Dane Housing',
    description: 'Support for tenants and residents.',
    url: 'https://www.plusdane.co.uk',
    phone: '0800 052 5419',
    order: 1,
  },
  {
    category: 'Benefits & Housing',
    name: 'Turn2us Benefits Calculator',
    description: 'Check which benefits or grants may be available.',
    url: 'https://www.turn2us.org.uk',
    order: 2,
  },
  {
    category: 'Benefits & Housing',
    name: 'Universal Credit',
    description: 'Official information for Universal Credit claims.',
    url: 'https://www.gov.uk/universal-credit',
    order: 3,
  },
  // Local Support
  {
    category: 'Local Support',
    name: 'Alsager & District Foodbank',
    description: 'Serving Alsager, Rode Heath, Oakhanger, Church Lawton, and Scholar Green.',
    url: 'https://alsagerfoodbank.wordpress.com',
    phone: '07743659906',
    order: 0,
  },
  {
    category: 'Local Support',
    name: 'Cheshire East Council',
    description: 'Council services, housing, benefits, and community help.',
    url: 'https://www.cheshireeast.gov.uk',
    order: 1,
  },
];

export function categoryBadgeClass(category: string) {
  switch (category) {
    case 'Mental Health': return 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/30';
    case 'Debt & Financial': return 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-400/30';
    case 'Benefits & Housing': return 'bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400/30';
    case 'Local Support': return 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30';
    default: return 'bg-slate-800 text-slate-400';
  }
}

export function categoryBorderClass(category: string) {
  switch (category) {
    case 'Mental Health': return 'border-blue-400/20';
    case 'Debt & Financial': return 'border-amber-400/20';
    case 'Benefits & Housing': return 'border-cyan-400/20';
    case 'Local Support': return 'border-emerald-400/20';
    default: return 'border-slate-800/20';
  }
}

function phoneHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, '')}`;
}

export function useSupportLinks() {
  const [links, setLinks] = useState<SupportLinkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'support_links'),
      (snapshot) => {
        if (snapshot.empty) {
          void Promise.all(
            defaultSupportLinks.map((link) => {
              const slug = link.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
              const docId = `${link.category.toLowerCase().replace(/[^a-z]+/g, '')}_${slug}`;
              return setDoc(doc(db, 'support_links', docId), {
                ...link,
                createdAt: serverTimestamp(),
              });
            })
          );
          return;
        }

        const items = snapshot.docs.map((itemDoc) => ({
          id: itemDoc.id,
          name: String(itemDoc.data().name ?? ''),
          description: String(itemDoc.data().description ?? ''),
          url: String(itemDoc.data().url ?? ''),
          phone: itemDoc.data().phone ? String(itemDoc.data().phone) : undefined,
          category: String(itemDoc.data().category ?? ''),
          order: Number(itemDoc.data().order ?? 0),
        }));

        items.sort((a, b) => a.order - b.order);
        setLinks(items);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load support links:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  return { links, loading };
}

export function SupportLinks({ publicView = false }: { publicView?: boolean }) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const { links, loading } = useSupportLinks();

  const categories = ['All', 'Mental Health', 'Debt & Financial', 'Benefits & Housing', 'Local Support'];

  const filteredServices = links.filter(
    (link) => activeCategory === 'All' || link.category === activeCategory
  );

  return (
    <section className={publicView ? 'mx-auto mt-6 max-w-5xl' : 'mx-auto max-w-5xl'}>
      <div className="card-glass-cyan rounded-3xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-300">
          {publicView ? 'Need more help?' : 'Support directory'}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white text-glow-cyan">Local Cheshire East Support Links</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          These services are here to help. Share this page with anyone who needs more support.
        </p>
        <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-slate-500">
          These links are provided for information only. Save Our Supper is not affiliated with these services.
        </p>
      </div>

      {/* Category Tabs Selection */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider transition ${
              activeCategory === cat
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.22)] border border-transparent'
                : 'border border-slate-800 bg-[var(--bg-sidebar)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card-glass-base mt-6 rounded-3xl p-8 text-center text-sm font-bold text-slate-400">
          Loading support directory...
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className={`card-glass-base rounded-3xl p-5 flex flex-col justify-between min-h-48 border-t-2 ${categoryBorderClass(service.category)}`}
            >
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${categoryBadgeClass(service.category)}`}>
                  {service.category}
                </span>
                <h3 className="mt-3 text-sm font-black leading-tight text-slate-100">{service.name}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{service.description}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-800/40">
                {service.phone ? (
                  <a
                    href={phoneHref(service.phone)}
                    className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-black text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.16)] hover:bg-emerald-500/20"
                  >
                    {service.phone}
                  </a>
                ) : null}
                <a
                  href={service.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-black text-cyan-300 shadow-[0_0_14px_rgba(6,182,212,0.16)] hover:bg-cyan-500/20"
                >
                  Visit
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}