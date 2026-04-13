import { redirect } from "next/navigation";

export default async function AdminClassStudentsAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/classes/${encodeURIComponent(id)}/summary`);
}
