import { AppShell } from "@/components/layout/Chrome";
import { RequireRole } from "@/components/layout/RequireRole";

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="coordinator" title="Coordinator">
      <RequireRole allow={["coordinator"]} label="Coordinator">{children}</RequireRole>
    </AppShell>
  );
}
