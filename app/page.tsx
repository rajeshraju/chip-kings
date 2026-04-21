import { getSession } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  return <Calculator role={session?.role ?? null} />;
}
