export function DataRetentionNotice() {
  return (
    <div className="card-glass-emerald mb-5 rounded-3xl p-4">
      <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Data Retention Notice</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-emerald-100">
        Personal referral details are anonymised as soon as a collection is completed. Names, phone numbers, email addresses, dietary notes, and public status records are removed at collection, while non-identifying operational data is retained for reporting. Full referral records are automatically deleted after 30 days in line with GDPR data minimisation principles.
      </p>
    </div>
  );
}
