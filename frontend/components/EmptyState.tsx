export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}
