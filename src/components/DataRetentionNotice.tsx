export function DataRetentionNotice() {
  return (
    <div className="mb-5 border border-emerald-300/40 bg-[#071711] p-5 shadow-[0_0_34px_rgba(16,185,129,0.12)]">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Security Protocol · Automated Retention</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-emerald-100">
        Personal referral details are anonymised as soon as a collection is completed. Names, phone numbers, email addresses, dietary notes, and public status records are removed at collection, while non-identifying operational data is retained for reporting. Full referral records are automatically deleted after 30 days in line with GDPR data minimisation principles.
      </p>
    </div>
  );
}
