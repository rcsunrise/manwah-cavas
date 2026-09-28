import React, { useEffect, useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase, initRuntimeSupabase, purgeInvalidSupabaseSession } from './lib/supabase';
import LoginPage from './pages/Login';
import Layout from './components/Layout';
import PosterStudioPage from './pages/PosterStudioPage';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';

const ManwahStudio = lazyWithRetry(() => import('./pages/ManwahStudio'), 'ManwahStudio');
const CreativeCanvasPage = lazyWithRetry(() => import('./pages/creative-canvas/CreativeCanvasPage'), 'CreativeCanvasPage');
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'), 'Dashboard');
const AdminUsers = lazyWithRetry(() => import('./pages/AdminUsers'), 'AdminUsers');
const DepartmentBilling = lazyWithRetry(() => import('./pages/DepartmentBilling'), 'DepartmentBilling');
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'Profile');

// 认证保护组件
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let subscription: any = null;

    initRuntimeSupabase().then((client) => {
      if (client.isFailClosed) {
        setConfigError("正式环境数据库配置不可用，请联系管理员");
        setLoading(false);
        return;
      }

      const checkDemoSession = () => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('manwah_demo_mode') === 'true') {
          const raw = localStorage.getItem('manwah_user');
          if (raw) {
            try {
              const u = JSON.parse(raw);
              return {
                access_token: localStorage.getItem('token') || 'demo-token',
                user: u
              };
            } catch (e) {}
          }
        }
        return null;
      };

      const handleAuthError = (errMsg: string) => {
        if (
          errMsg.includes('Invalid Refresh Token') ||
          errMsg.includes('Refresh Token Not Found') ||
          errMsg.includes('invalid_grant')
        ) {
          console.warn('[AppAuth] Purging stale refresh token and signing out locally...');
          purgeInvalidSupabaseSession();
          if (client.auth && typeof client.auth.signOut === 'function') {
            client.auth.signOut({ scope: 'local' }).catch(() => {});
          }
        }
      };

      client.auth.getSession().then(({ data, error }: any) => {
        if (error) {
          console.warn("Auth session error:", error.message);
          handleAuthError(error.message || '');
          setSession(checkDemoSession());
        } else {
          setSession(data?.session || checkDemoSession());
        }
        setLoading(false);
      }).catch((err: any) => {
        const msg = err?.message || String(err || '');
        console.warn("Failed to get session:", msg);
        handleAuthError(msg);
        setSession(checkDemoSession());
        setLoading(false);
      });

      const res = client.auth.onAuthStateChange((_event: any, authSession: any) => {
        setSession(authSession || checkDemoSession());
      });
      subscription = res?.data?.subscription;
    }).catch(err => {
      console.error("Supabase init error:", err);
      setConfigError("正式环境数据库配置不可用，请联系管理员");
      setLoading(false);
    });

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-800 mx-auto mb-4"></div>
          <p className="text-stone-600 font-bold text-sm">正在连接数据服务...</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-md max-w-md text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">!</div>
          <h2 className="text-lg font-bold text-stone-800">数据库配置不可用</h2>
          <p className="text-stone-600 text-sm">{configError}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// loading fallback
const SuspenseFallback = () => <div className="min-h-screen flex items-center justify-center p-4">Loading...</div>;

function ProtectedApp() {
  const location = useLocation();
  const isManwah = location.pathname.startsWith('/manwah');
  const isCreativeCanvas = location.pathname.startsWith('/creative-canvas');
  const isPosterStudio = location.pathname.startsWith('/poster-studio');

  if (isPosterStudio) {
    return (
      <RouteErrorBoundary fallbackTitle="海报工坊加载遇到问题">
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>
            <Route path="/poster-studio/new" element={<PosterStudioPage />} />
            <Route path="/poster-studio/:workspaceId" element={<PosterStudioPage />} />
            <Route path="*" element={<Navigate to="/poster-studio/new" replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    );
  }
  
  if (isCreativeCanvas) {
    return (
      <RouteErrorBoundary fallbackTitle="创意画布加载遇到问题">
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>
            <Route path="/creative-canvas/new" element={<CreativeCanvasPage />} />
            <Route path="/creative-canvas/:workspaceId" element={<CreativeCanvasPage />} />
            <Route path="*" element={<Navigate to="/creative-canvas/new" replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    );
  }

  return (
    <RouteErrorBoundary fallbackTitle="系统应用加载遇到问题">
      <Layout>
        <div style={{ display: isManwah ? 'block' : 'none', height: '100%', width: '100%' }}>
          <Suspense fallback={<SuspenseFallback />}>
            <ManwahStudio />
          </Suspense>
        </div>
        <Suspense fallback={<SuspenseFallback />}>
          <Routes>
            <Route path="/manwah" element={null} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/billing" element={<DepartmentBilling />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/" element={<Navigate to="/manwah" replace />} />
            <Route path="*" element={<Navigate to="/manwah" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </RouteErrorBoundary>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="*" 
          element={
            <RequireAuth>
              <ProtectedApp />
            </RequireAuth>
          } 
        />
      </Routes>
    </Router>
  );
}
