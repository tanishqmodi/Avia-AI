import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CommandCenter from './pages/CommandCenter';
import Airspace from './pages/Airspace';
import Cameras from './pages/Cameras';
import Upload from './pages/Upload';
import Runway from './pages/Runway';
import Alerts from './pages/Alerts';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import EditProfile from './pages/EditProfile';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

import { useGlobalAlerts } from './hooks/useGlobalAlerts';
import { useStore } from './store/useStore';
import { useAuthStore } from './store/useAuthStore';
import { useUploadStore } from './store/useUploadStore';

function GlobalLogic() {
  const token = useAuthStore(state => state.token);
  const userId = useAuthStore(state => state.user?.id ?? null);
  useGlobalAlerts();
  const { fetchCameras, fetchStats } = useStore();

  // TestHistory: scope upload history per user. Swap the active user context
  // whenever the auth user changes so one account never sees another's runs.
  useEffect(() => {
    useUploadStore.getState().setUserContext(userId);
  }, [userId]);

  useEffect(() => {
    if (token) {
      fetchCameras().catch(console.error);
      fetchStats().catch(console.error);
      const interval = setInterval(() => fetchStats().catch(console.error), 5000);
      return () => clearInterval(interval);
    }
  }, [fetchCameras, fetchStats, token]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <GlobalLogic />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<CommandCenter />} />
          <Route path="airspace" element={<Airspace />} />
          <Route path="cameras" element={<Cameras />} />
          <Route path="upload" element={<Upload />} />
          <Route path="runway" element={<Runway />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<EditProfile />} />
          <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
