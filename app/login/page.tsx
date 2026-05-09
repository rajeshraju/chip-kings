import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const session = await getSession();
  const next = searchParams.next || "/games";
  if (session) redirect(next);

  return (
    <div className="max-w-md mx-auto">
      <div className="card">
        <div className="card-body pt-6 pb-5 space-y-1">
          <h1 className="font-display text-xl font-bold">Sign in</h1>
          <p className="text-sm text-fg-muted">
            Reports are view-restricted. Enter your credentials to continue.
          </p>
        </div>
        <div className="card-body">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
