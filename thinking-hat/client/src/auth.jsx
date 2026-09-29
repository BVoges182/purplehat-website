import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, api, setUnauthorizedHandler } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    });
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return undefined;
    }
    let stop = false;
    api.me()
      .then((data) => {
        if (!stop) setUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        if (!stop) setReady(true);
      });
    return () => {
      stop = true;
    };
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    setUser,
    async login(email, password) {
      const data = await api.login({ email, password });
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      return data.user;
    },
    logout() {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
