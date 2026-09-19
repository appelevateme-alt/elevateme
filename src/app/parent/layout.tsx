import { AppShell } from "@/components/layout/Chrome";
import { RequireRole } from "@/components/layout/RequireRole";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="parent" title="Parent">
      <RequireRole allow={["parent"]} label="Parent">{children}</RequireRole>
    </AppShell>
  );
}
