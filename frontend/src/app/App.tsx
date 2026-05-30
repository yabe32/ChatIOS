import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ChatPage } from "../pages/ChatPage";
import { LoginPage } from "../pages/LoginPage";
import { apiGetMe } from "../lib/api";

export function App() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGetMe()
      .then((result) => {
        if (!alive) return;
        setAuthenticated(result.authenticated);
        setChecked(true);
      })
      .catch(() => {
        if (!alive) return;
        setAuthenticated(false);
        setChecked(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (!checked) {
    return <div className="app-shell loading">Loading...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage
            onLoggedIn={() => {
              setAuthenticated(true);
              navigate("/chat", { replace: true });
            }}
          />
        }
      />
      <Route
        path="/chat"
        element={authenticated ? <ChatPage onLogout={() => setAuthenticated(false)} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={authenticated ? "/chat" : "/login"} replace />} />
    </Routes>
  );
}
