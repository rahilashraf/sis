import { redirect } from "next/navigation";

export default async function AdminClassGradebookAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/gradebook?classId=${encodeURIComponent(id)}`);
}
