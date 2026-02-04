import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return <Outlet />;
}

function NotFound() {
  const navigate = useNavigate();

  // Redirect /admin to /manage
  useEffect(() => {
    if (window.location.pathname === '/admin') {
      navigate({ to: '/manage', replace: true });
    }
    if (window.location.pathname === '/settings') {
      navigate({ to: '/', replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-text-secondary mb-6">Page not found</p>
        <button
          onClick={() => navigate({ to: '/' })}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}
