interface SupportService {
  name: string;
  description: string;
  url: string;
  phone?: string;
}

interface SupportCategory {
  category: string;
  badgeClassName: string;
  services: SupportService[];
}

const supportCategories: SupportCategory[] = [
  {
    category: 'Mental Health',
    badgeClassName: 'bg-blue-100 text-blue-700',
    services: [
      {
        name: 'Cheshire & Wirral NHS Foundation Trust',
        description: 'Local NHS mental health, CAMHS, and community wellbeing services.',
        url: 'https://www.cwp.nhs.uk',
        phone: '01244 397397',
      },
      {
        name: 'Samaritans (Crewe & South Cheshire)',
        description: 'Free, confidential emotional support available 24 hours a day.',
        url: 'https://www.samaritans.org',
        phone: '116 123',
      },
      {
        name: 'Mind',
        description: 'Mental health information, advice, and routes into local support.',
        url: 'https://www.mind.org.uk',
      },
    ],
  },
  {
    category: 'Debt & Financial',
    badgeClassName: 'bg-amber-100 text-amber-700',
    services: [
      {
        name: 'Citizens Advice Cheshire East',
        description: 'Local advice for money, debt, benefits, housing, and practical support.',
        url: 'https://www.cheshireeast.gov.uk/council_and_democracy/contact_the_council',
        phone: '0808 278 7893',
      },
      {
        name: 'StepChange Debt Charity',
        description: 'Free debt advice and practical plans for managing repayments.',
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
    services: [
      {
        name: 'Cheshire East Housing Options Team',
        description: 'Housing advice, homelessness support, and local authority housing help.',
        url: 'https://www.cheshireeast.gov.uk/housing',
        phone: '0300 123 5500',
      },
      {
        name: 'Plus Dane Housing',
        description: 'Housing association support for tenants and residents.',
        url: 'https://www.plusdane.co.uk',
        phone: '0800 052 5419',
      },
      {
        name: 'Turn2us Benefits Calculator',
        description: 'Check which benefits, grants, or financial help may be available.',
        url: 'https://www.turn2us.org.uk',
      },
      {
        name: 'Universal Credit (Gov.uk)',
        description: 'Official information for Universal Credit claims and account management.',
        url: 'https://www.gov.uk/universal-credit',
      },
    ],
  },
  {
    category: 'Local Support',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    services: [
      {
        name: 'Alsager & District Foodbank',
        description: 'Local foodbank serving Alsager, Rode Heath, Oakhanger, Church Lawton, and Scholar Green.',
        url: 'https://alsagerfoodbank.wordpress.com',
        phone: '07743659906',
      },
      {
        name: 'Cheshire East Council',
        description: 'Council services, local support routes, housing, benefits, and community help.',
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
    <section className={publicView ? 'mx-auto mt-6 max-w-5xl' : 'mx-auto max-w-5xl'}>
      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-emerald-300">
          {publicView ? 'Need more help?' : 'Support directory'}
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">Local Cheshire East Support Links</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          These services are here to help. If someone you have helped today needs more support, share this page with them.
        </p>
        <p className="mt-3 max-w-3xl text-xs font-semibold leading-5 text-slate-400">
          These links are provided for information only. Save Our Supper is not affiliated with these services.
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {supportCategories.map((category) => (
          <div key={category.category} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${category.badgeClassName}`}>
              {category.category}
            </span>
            <div className="mt-4 grid gap-3">
              {category.services.map((service) => (
                <article key={service.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-base font-black leading-tight text-slate-950">{service.name}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{service.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {service.phone ? (
                      <a
                        href={phoneHref(service.phone)}
                        className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                      >
                        Call {service.phone}
                      </a>
                    ) : null}
                    <a
                      href={service.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                    >
                      Visit website
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}