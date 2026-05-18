import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, rolesLoading, isMasterAdmin, isManager } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    
    if (loading || rolesLoading) return;

    if (!user) {
      navigate("/auth", { replace: true });
    } else if (isMasterAdmin) {
      navigate("/admin", { replace: true });
    } else if (isManager) {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [user, loading, rolesLoading, isMasterAdmin, isManager, navigate, location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">Carregando...</h1>
        <p className="mb-4 text-xl text-muted-foreground">Redirecionando...</p>
      </div>
    </div>
  );
};

export default NotFound;