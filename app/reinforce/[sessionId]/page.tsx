import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getReinforceSessionForUser } from "@/lib/reinforce/service";
import { ReinforceRunner } from "./reinforce-runner";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function ReinforceSessionPage({ params }: Props) {
  const { sessionId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // JSX — вне try: ошибки рендера try/catch не ловит (react-hooks/error-boundaries).
  let dto: Awaited<ReturnType<typeof getReinforceSessionForUser>>;
  try {
    dto = await getReinforceSessionForUser(session.user.id, sessionId);
  } catch {
    notFound();
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/plan" className="text-sm text-[var(--muted)] hover:text-[var(--brand)]">
        ← К плану
      </Link>
      <ReinforceRunner initial={dto} />
    </div>
  );
}
