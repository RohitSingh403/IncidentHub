import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => localStorage.getItem('incidenthub_token'));

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/api/auth/me'),
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (me.error?.status === 401) {
      localStorage.removeItem('incidenthub_token');
      setToken(null);
    }
  }, [me.error]);

  function signIn(nextToken) {
    localStorage.setItem('incidenthub_token', nextToken);
    setToken(nextToken);
    queryClient.invalidateQueries({ queryKey: ['me'] });
  }

  function signOut() {
    localStorage.removeItem('incidenthub_token');
    setToken(null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user: me.data?.data?.user ?? null,
        loading: Boolean(token) && me.isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
