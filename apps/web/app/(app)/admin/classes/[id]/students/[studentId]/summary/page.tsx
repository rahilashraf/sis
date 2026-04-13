import { redirect } from "next/navigation";

export default async function AdminStudentSummaryAliasPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id, studentId } = await params;
  redirect(`/admin/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(studentId)}`);
}
