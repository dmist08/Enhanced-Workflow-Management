import { Attribution } from "@/lib/types";

export default function AttributionBanner({ attribution }: { attribution: Attribution | null }) {
  if (!attribution || attribution.days_late === 0) return null;

  const isUnattributed = attribution.cause_type === "unattributed";

  return (
    <div className={`border-l-4 px-4 py-3 text-sm ${
      isUnattributed
        ? "border-yellow-400 bg-yellow-50 text-yellow-800"
        : "border-red-400 bg-red-50 text-red-800"
    }`}>
      {attribution.sentence}
    </div>
  );
}
