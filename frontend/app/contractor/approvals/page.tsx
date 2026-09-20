"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Approval } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

export default function ContractorApprovalsPage() {
  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ["my-approvals"],
    queryFn: () => api.get("/me/approvals").then(r => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">My approval history</h1>

      {(!approvals || approvals.length === 0) ? (
        <EmptyState title="No approval requests" description="You haven't requested any approvals yet." />
      ) : (
        <table className="w-full text-sm border border-gray-200">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left px-4 py-2 font-medium">Task</th>
              <th className="text-left px-4 py-2 font-medium">Decision</th>
              <th className="text-left px-4 py-2 font-medium">Requested</th>
              <th className="text-left px-4 py-2 font-medium">Decided</th>
              <th className="text-left px-4 py-2 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map(a => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-gray-600">{a.task_id?.slice(0, 8)}…</td>
                <td className="px-4 py-2"><StatusBadge status={a.decision} /></td>
                <td className="px-4 py-2 text-gray-500">{a.requested_at?.slice(0, 10)}</td>
                <td className="px-4 py-2 text-gray-500">{a.decided_at?.slice(0, 10) ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{a.remarks ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
