import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';

export default function NotFound() {
  return (
    <div className="container not-found">
      <PageHeader title="Page not found" description="This page does not exist or you do not have access to it." />
      <Link to="/" className="btn">Back home</Link>
    </div>
  );
}

export function PermissionDenied({ label }) {
  return (
    <div className="container">
      <PageHeader title="Permission denied" description={`The ${label} area requires a different role.`} />
      <Link to="/"><Button variant="secondary">Back home</Button></Link>
    </div>
  );
}
