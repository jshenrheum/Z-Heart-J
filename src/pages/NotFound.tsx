import { Link } from '../lib/router.tsx';
import { routes } from '../lib/routes.ts';
import { EmptyState } from '../components/ui.tsx';

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <div className="page">
      <h1 className="page-title">Not found</h1>
      <EmptyState
        title={`That ${what} isn’t here.`}
        body="It may have been renamed or removed."
        action={
          <Link to={routes.home} className="btn btn-primary">
            Back to Home
          </Link>
        }
      />
    </div>
  );
}
