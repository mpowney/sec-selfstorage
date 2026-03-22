import React, { useState } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  Input,
  Button,
  Title1,
  Text,
  MessageBar,
  MessageBarBody,
  Field,
  Spinner,
} from '@fluentui/react-components';
import { ShieldKeyholeRegular, KeyRegular } from '@fluentui/react-icons';
import { adminLogin } from '../api';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '32px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  adminBadge: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  submitButton: {
    marginTop: '8px',
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});

interface AdminLoginPageProps {
  onLogin: (username: string) => void;
}

export default function AdminLoginPage({ onLogin }: AdminLoginPageProps) {
  const styles = useStyles();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      const result = await adminLogin(username.trim(), password);
      onLogin(result.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <ShieldKeyholeRegular fontSize={48} color="var(--colorPaletteRedForeground2)" />
          <Title1>SecSelfStorage</Title1>
          <span className={styles.adminBadge}>Admin Portal</span>
          <Text align="center" style={{ color: 'var(--colorNeutralForeground3)' }}>
            Sign in with your admin credentials
          </Text>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <Field label="Username" required>
            <Input
              value={username}
              onChange={(_, d) => setUsername(d.value)}
              placeholder="Admin username"
              disabled={loading}
              autoComplete="username"
            />
          </Field>

          <Field label="Password" required>
            <Input
              type="password"
              value={password}
              onChange={(_, d) => setPassword(d.value)}
              placeholder="Admin password"
              disabled={loading}
              autoComplete="current-password"
            />
          </Field>

          {error && (
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}

          {loading && (
            <div className={styles.hint}>
              <Spinner size="tiny" />
              <Text>Signing in...</Text>
            </div>
          )}

          <Button
            appearance="primary"
            type="submit"
            icon={<KeyRegular />}
            disabled={loading || !username.trim() || !password}
            className={styles.submitButton}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
