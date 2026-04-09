import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

function ProtectedRoute({ children, allowedRoles }) {
    const { user, token, loading } = useAuth();

    if (loading) return null;
    if (!token || !user) return <Navigate to="/login" replace />;
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to={user.role === "operator" ? "/dashboard" : "/admin"} replace />;
    }
    return children;
}

function AppRoutes() {
    const { user, token, loading } = useAuth();

    if (loading) return null;

    return (
        <Routes>
            <Route
                path="/login"
                element={
                    token && user
                        ? <Navigate to={user.role === "operator" ? "/dashboard" : "/admin"} replace />
                        : <LoginPage />
                }
            />
            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute allowedRoles={["operator"]}>
                        <DashboardPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin"
                element={
                    <ProtectedRoute allowedRoles={["admin", "lead"]}>
                        <AdminPage />
                    </ProtectedRoute>
                }
            />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
