import { StudentStatementView } from "@/components/billing/student-statement";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ParentStatementPage({ params }: Props) {
  const { id } = await params;
  return <StudentStatementView studentId={id} isParent={true} />;
}
