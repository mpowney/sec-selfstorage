import React, { useState, useEffect } from 'react';
import { Spinner, makeStyles } from '@fluentui/react-components';
import { getAuthStatus } from './api';
import LoginPage from './components/LoginPage';
import FilesPage from './components/FilesPage';

const useStyles = makeStyles({
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
  },
});

export default function App() {
  const styles = useStyles();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [credentialId, setCredentialId] = useState<string | undefined>();

  useEffect(() => {
    getAuthStatus()
      .then((status) => {
        setAuthenticated(status.authenticated);
        setUsername(status.username);
        setUserId(status.userId);
        setCredentialId(status.credentialId);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading..." />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginPage
        onLogin={(uid, uname, credId) => {
          setUserId(uid);
          setUsername(uname);
          setCredentialId(credId);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <FilesPage
      username={username ?? ''}
      userId={userId ?? ''}
      credentialId={credentialId ?? ''}
      onLogout={() => {
        setAuthenticated(false);
        setUsername(undefined);
        setUserId(undefined);
        setCredentialId(undefined);
      }}
    />
  );
}
