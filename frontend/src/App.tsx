import React, { useState, useEffect } from 'react';
import { Spinner, makeStyles } from '@fluentui/react-components';
import { getAuthStatus, getAdminStatus } from './api';
import LoginPage from './components/LoginPage';
import FilesPage from './components/FilesPage';
import AdminLoginPage from './components/AdminLoginPage';
import AdminDashboard from './components/AdminDashboard';
import DebugScreen from './components/DebugScreen';

const useStyles = makeStyles({
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
  },
});

const isAdminPath = window.location.pathname.startsWith('/admin');

export default function App() {
  const styles = useStyles();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [credentialId, setCredentialId] = useState<string | undefined>();
  const [clientKey, setClientKey] = useState<CryptoKey | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  // Admin state
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminUsername, setAdminUsername] = useState<string | undefined>();

  useEffect(() => {
    if (isAdminPath) {
      getAdminStatus()
        .then((status) => {
          setAdminAuthenticated(status.authenticated);
          setAdminUsername(status.username);
        })
        .catch(() => setAdminAuthenticated(false))
        .finally(() => setLoading(false));
    } else {
      getAuthStatus()
        .then((status) => {
          setAuthenticated(status.authenticated);
          setUsername(status.username);
          setUserId(status.userId);
          setCredentialId(status.credentialId);
        })
        .catch(() => setAuthenticated(false))
        .finally(() => setLoading(false));
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading..." />
      </div>
    );
  }

  // Admin route
  if (isAdminPath) {
    if (!adminAuthenticated) {
      return (
        <AdminLoginPage
          onLogin={(uname) => {
            setAdminUsername(uname);
            setAdminAuthenticated(true);
          }}
        />
      );
    }
    return (
      <AdminDashboard
        adminUsername={adminUsername ?? ''}
        onLogout={() => {
          setAdminAuthenticated(false);
          setAdminUsername(undefined);
        }}
      />
    );
  }

  // Regular user route
  if (!authenticated) {
    return (
      <>
        <LoginPage
          onLogin={(uid, uname, credId, key) => {
            setUserId(uid);
            setUsername(uname);
            setCredentialId(credId);
            setClientKey(key);
            setAuthenticated(true);
          }}
          onOpenDebug={() => setDebugOpen(true)}
        />
        <DebugScreen open={debugOpen} onClose={() => setDebugOpen(false)} />
      </>
    );
  }

  return (
    <>
      <FilesPage
        username={username ?? ''}
        userId={userId ?? ''}
        credentialId={credentialId ?? ''}
        clientKey={clientKey}
        onLogout={() => {
          setAuthenticated(false);
          setUsername(undefined);
          setUserId(undefined);
          setCredentialId(undefined);
          setClientKey(null);
        }}
        onOpenDebug={() => setDebugOpen(true)}
      />
      <DebugScreen open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}
