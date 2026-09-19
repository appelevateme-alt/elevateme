import { AppShell } from "@/components/layout/Chrome";
import { RequireRole } from "@/components/layout/RequireRole";

export default function EvaluatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="evaluator" title="Evaluator">
      <RequireRole allow={["evaluator", "coordinator"]} label="Evaluator">{children}</RequireRole>
    </AppShell>
  );
}
