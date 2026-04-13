import { redirect } from "next/navigation";

export default async function ParentGradesAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/parent/students/${encodeURIComponent(id)}/academics`);
}
