interface SupportService {
  name: string;
  description: string;
  url: string;
  phone?: string;
}

interface SupportCategory {
  category: string;
  badgeClassName: string;
  borderClassName: string;
  services: SupportService[];
}

const supportCategories: SupportCategory[] = [
  {
    category: 'Mental Health',
    badgeClassName: 'bg-blue-100 text-blue-700',
    borderClassName: 'border-blue-100',
    services: [
      {
        name: 'Cheshire & Wirral NHS Foundation Trust',
        description: 'Local NHS mental health, CAMHS, and community wellbeing.',
        url: 'https://www.cwp.nhs.uk',
        phone: '01244 397397',
      },
      {
        name: 'Samaritans',
        description: 'Free, confidential support available 24 hours a day.',
        url: 'https://www.samaritans.org',
        phone: '116 123',
      },
      {
        name: 'Mind',
        description: 'Mental health information and routes into local support.',
        url: 'https://www.mind.org.uk',
      },
    ],
  },
  {
    category: 'Debt & Financial',
    badgeClassName: 'bg-amber-100 text-amber-700',
    borderClassName: 'border-amber-100',
    services: [
      {
        name: 'Citizens Advice Cheshire East',
        description: 'Advice on money, debt, benefits, housing, and more.',
        url: 'https://www.cheshireeast.gov.uk/council_and_democracy/contact_the_council',
        phone: '0808 278 7893',
      },
      {
        name: 'StepChange Debt Charity',
        description: 'Free debt advice and practical repayment plans.',
        url: 'https://www.stepchange.org',
        phone: '0800 138 1111',
      },
      {
        name: 'National Debtline',
        description: 'Free independent debt guidance by phone and online.',
        url: 'https://www.nationaldebtline.org',
        phone: '0808 808 4000',
      },
    ],
  },
  {
    category: 'Benefits & Housing',
    badgeClassName: 'bg-purple-100 text-purple-700',
    borderClassName: 'border-purple-100',
    services: [
      {
        name: 'Cheshire East Housing Options',
        description: 'Housing advice, homelessness support, and local help.',
        url: 'https://www.cheshireeast.gov.uk/housing',
        phone: '0300 123 5500',
      },
      {
        name: 'Plus Dane Housing',
        description: 'Support for tenants and residents.',
        url: 'https://www.plusdane.co.uk',
        phone: '0800 052 5419',
      },
      {
        name: 'Turn2us Benefits Calculator',
        description: 'Check which benefits or grants may be available.',
        url: 'https://www.turn2us.org.uk',
      },
      {
        name: 'Universal Credit',
        description: 'Official information for Universal Credit claims.',
        url: 'https://www.gov.uk/universal-credit',
      },
    ],
  },
  {
    category: 'Local Support',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    borderClassName: 'border-emerald-100',
    services: [
      {
        name: 'Alsager & District Foodbank',
        description: 'Serving Alsager, Rode Heath, Oakhanger, Church Lawton, and Scholar Green.',
        url: 'https://alsagerfoodbank.wordpress.com',
        phone: '07743659906',
      },
      {
        name: 'Cheshire East Council',
        description: 'Council services, housing, benefits, and community help.',
        url: 'https://www.cheshireeast.gov.uk',
      },
    ],
  },
];

function phoneHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, '')}`;
}

export function SupportLinks({ publicView = false }: { publicView?: boolean }) {
  return (
    <section className={publicView ? 'mx-auto mt-6 max-w-4xl' : 'mx-auto max-w-4xl'}>
      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-300">
          {publicView ? 'Need more help?' : 'Support directory'}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">Local Cheshire East Support Links</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          These services are here to help. Share this page with anyone who needs more support.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          For information only. Save Our Supper is not affiliated with these services.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {supportCategories.map((cat) => (
          <div key={cat.category} className={`rounded-3xl border bg-white p-5 shadow-sm ${cat.borderClassName}`}>
            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${cat.badgeClassName}`}>
              {cat.category}
            </span>
            <ul className="mt-3 divide-y divide-slate-100">
              {cat.services.map((service) => (
                <li key={service.name} className="py-3">
                  <p className="text-sm font-black text-slate-950">{service.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{service.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {service.phone ? (
                      <a
                        href={phoneHref(service.phone)}
                        className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                      >
                        {service.phone}
                      </a>
                    ) : null}
                    <a
                      href={service.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700"
                    >
                      Visit →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}