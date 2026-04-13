import { redirect } from "next/navigation";

export default async function ParentClassAliasPage({
  params,
}: {
  params: Promise<{ id: string; classId: string }>;
}) {
  const { id, classId } = await params;
  redirect(
    `/parent/students/${encodeURIComponent(id)}/classes/${encodeURIComponent(classId)}`,
  );
}
