import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Return to the library. Goes back in history when we came from inside the app, so the
 * Android back button and our Back button agree; replaces instead when this page was the
 * entry point (e.g. opened from a shared link), so we never navigate out of the app.
 */
export function useLeave() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.key === 'default') void navigate('/', { replace: true });
    else void navigate(-1);
  }, [navigate, location.key]);
}
