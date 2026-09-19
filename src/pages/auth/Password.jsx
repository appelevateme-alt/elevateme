import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';

export function ForgotPassword() {
  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <Eyebrow>Account recovery</Eyebrow>
      <PageHeader title="Forgot password" description="Enter your account email. If it exists, a time-limited reset link is sent." />
      <Card title="Request reset link" meta="Mock — no email is sent">
        <form className="form-stack" onSubmit={(e) => e.preventDefault()}>
          <Field label="Email"><TextInput type="email" required placeholder="you@example.edu" /></Field>
          <div className="row">
            <Button type="submit">Send reset link</Button>
            <Link to="/sign-in" className="btn">Back to sign in</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function ResetPassword() {
  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <Eyebrow>Account recovery</Eyebrow>
      <PageHeader title="Reset password" description="Links expire. After reset, sign in again on all devices." />
      <Card title="Choose a new password" meta="Mock — validation mirrors signup rules">
        <form className="form-stack" onSubmit={(e) => e.preventDefault()}>
          <Field label="New password" hint="At least 8 characters."><TextInput type="password" required placeholder="New password" /></Field>
          <Field label="Confirm password"><TextInput type="password" required placeholder="Repeat password" /></Field>
          <div className="row">
            <Button type="submit">Reset password</Button>
            <Link to="/sign-in" className="btn">Back to sign in</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
