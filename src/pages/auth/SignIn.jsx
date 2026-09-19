import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { roleHome, useMockAuth } from '../../lib/auth.jsx';

export default function SignIn() {
  const { switchRole } = useMockAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('student');

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <PageHeader title="Sign in" description="Mock sign-in — real email verification and approvals ship with the backend." />
      <Card title="Welcome back" meta="Email + password (mocked)">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            switchRole(role);
            navigate(roleHome(role));
          }}
        >
          <Field label="Email"><TextInput type="email" required placeholder="you@example.edu" defaultValue="amaya@example.edu" /></Field>
          <Field label="Password"><TextInput type="password" required placeholder="••••••••" defaultValue="password" /></Field>
          <Field label="Preview as role" hint="Demo only — server role checks land with the backend.">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="parent">Parent</option>
              <option value="coordinator">Coordinator</option>
              <option value="evaluator">Evaluator</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Button type="submit">Sign in</Button>
          <p style={{ fontSize: 14 }}>
            <Link to="/forgot-password" className="link-strong">Forgot password?</Link>
            <span className="em-meta"> · New here? </span>
            <Link to="/sign-up" className="link-strong">Create an account</Link>
          </p>
          <p className="em-meta">Pending, rejected, suspended, or changes-requested accounts see an explicit status screen after sign-in (mocked as Approved here).</p>
        </form>
      </Card>
    </div>
  );
}
