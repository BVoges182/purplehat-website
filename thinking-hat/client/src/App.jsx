import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Shell from "./components/Shell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ManagementReports from "./pages/ManagementReports";
import FinancialStatements from "./pages/FinancialStatements";
import Billing from "./pages/Billing";
import RequestBuild from "./pages/RequestBuild";
import Business from "./pages/Business";
import AdminPeople from "./pages/AdminPeople";
import AdminUser from "./pages/AdminUser";
import AdminInvites from "./pages/AdminInvites";
import AdminRequests from "./pages/AdminRequests";

function Loading() {
  return <p className="grid min-h-screen place-items-center text-mute">Loading…</p>;
}

function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

function Home() {
  const { user } = useAuth();
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="reports" element={<ManagementReports />} />
          <Route path="statements" element={<FinancialStatements />} />
          <Route path="billing" element={<Billing />} />
          <Route path="request" element={<RequestBuild />} />
          <Route path="business" element={<Business />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin" element={<AdminPeople />} />
            <Route path="admin/invites" element={<AdminInvites />} />
            <Route path="admin/requests" element={<AdminRequests />} />
            <Route path="admin/users/:id" element={<AdminUser />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
