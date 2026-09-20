export default function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div className={`${dim} border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin`} />
  );
}
