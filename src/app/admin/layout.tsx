import { AppShell } from "@/components/layout/Chrome";
import { RequireRole } from "@/components/layout/RequireRole";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="admin" title="Admin">
      <RequireRole allow={["admin"]} label="Admin">{children}</RequireRole>
    </AppShell>
  );
}
