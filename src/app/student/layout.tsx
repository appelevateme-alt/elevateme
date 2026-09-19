import { AppShell } from "@/components/layout/Chrome";
import { RequireRole } from "@/components/layout/RequireRole";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="student" title="Student">
      <RequireRole allow={["student"]} label="Student">{children}</RequireRole>
    </AppShell>
  );
}
