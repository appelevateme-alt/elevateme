const tone: Record<string, string> = {
  Published: "bg-green-50 text-green-800 border-green-300",
  Approved: "bg-green-50 text-green-800 border-green-300",
  Confirmed: "bg-green-50 text-green-800 border-green-300",
  Locked: "bg-green-50 text-green-800 border-green-300",
  Replied: "bg-green-50 text-green-800 border-green-300",
  Completed: "bg-green-50 text-green-800 border-green-300",
  InProgress: "bg-blue-50 text-blue-800 border-blue-300",
  Submitted: "bg-blue-50 text-blue-800 border-blue-300",
  Pending: "bg-amber-50 text-amber-900 border-amber-300",
  PendingReview: "bg-amber-50 text-amber-900 border-amber-300",
  UnderReview: "bg-amber-50 text-amber-900 border-amber-300",
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  NotStarted: "bg-gray-100 text-gray-700 border-gray-300",
  New: "bg-gray-100 text-gray-700 border-gray-300",
  Open: "bg-amber-50 text-amber-900 border-amber-300",
  Waitlisted: "bg-amber-50 text-amber-900 border-amber-300",
  ChangesRequested: "bg-amber-50 text-amber-900 border-amber-300",
  Rejected: "bg-red-50 text-red-800 border-red-300",
  Suspended: "bg-red-50 text-red-800 border-red-300",
  High: "bg-red-50 text-red-800 border-red-300",
  Medium: "bg-amber-50 text-amber-900 border-amber-300",
  Low: "bg-gray-100 text-gray-700 border-gray-300",
};

export function Badge({ value }: { value: string }) {
  const cls = tone[value] ?? "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}
