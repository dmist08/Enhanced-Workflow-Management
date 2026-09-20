// Status badge — colored text labels, no rounded pills, no shadows
const STATUS_STYLES: Record<string, string> = {
  NOT_STARTED:     "text-gray-500 bg-gray-100",
  IN_PROGRESS:     "text-blue-700 bg-blue-50",
  BLOCKED:         "text-orange-700 bg-orange-50",
  COMPLETED:       "text-green-700 bg-green-50",
  ACTIVE:          "text-green-700 bg-green-50",
  ON_HOLD:         "text-yellow-700 bg-yellow-50",
  CANCELLED:       "text-red-700 bg-red-50",
  PENDING:         "text-yellow-700 bg-yellow-50",
  APPROVED:        "text-green-700 bg-green-50",
  REJECTED:        "text-red-700 bg-red-50",
  MEDIUM:          "text-orange-700 bg-orange-50",
  HIGH:            "text-red-700 bg-red-50",
  CRITICAL:        "text-red-800 bg-red-100 font-semibold",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "text-gray-600 bg-gray-100";
  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
