import React, { useState } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Input,
  Button,
  Title1,
  Title2,
  Text,
  MessageBar,
  MessageBarBody,
  Tab,
  TabList,
  Field,
  Spinner,
} from '@fluentui/react-components';
import { LockClosedRegular, KeyRegular } from '@fluentui/react-icons';
import { startLogin, finishLogin, startRegistration, finishRegistration } from '../api';
import { browserAuthenticate, browserRegister, deriveClientKey, deriveKeyFromPassphrase } from '../webauthn';
import WebAuthnDebugPanel from './WebAuthnDebugPanel';

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
  lockIcon: {
    fontSize: '48px',
    color: tokens.colorBrandForeground1,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '20px',
  },
  tabList: {
    marginBottom: '4px',
  },
  submitButton: {
    marginTop: '8px',
  },
  yubiKeyHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});

interface LoginPageProps {
  onLogin: (userId: string, username: string, credentialId: string, clientKey: CryptoKey | null) => void;
}

type TabValue = 'signin' | 'register';

export default function LoginPage({ onLogin }: LoginPageProps) {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<TabValue>('signin');

  // Sign-in state
  const [signInUsername, setSignInUsername] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInStatus, setSignInStatus] = useState('');
  const [signInError, setSignInError] = useState('');

  // Passphrase fallback state (shown when PRF is unavailable)
  const [pendingLogin, setPendingLogin] = useState<{
    userId: string;
    username: string;
    credentialId: string;
  } | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseLoading, setPassphraseLoading] = useState(false);
  const [passphraseError, setPassphraseError] = useState('');

  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regStatus, setRegStatus] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signInUsername.trim()) return;
    setSignInError('');
    setSignInStatus('');
    setSignInLoading(true);
    try {
      setSignInStatus('Starting authentication...');
      const { options, challengeId } = await startLogin(signInUsername.trim());
      setSignInStatus('Touch your YubiKey...');
      const { response: credential, prfOutput } = await browserAuthenticate(options);
      setSignInStatus('Verifying...');
      const result = await finishLogin(credential, challengeId, !!prfOutput);
      if (prfOutput) {
        const clientKey = await deriveClientKey(prfOutput);
        onLogin(result.userId, result.username, result.credentialId, clientKey);
      } else {
        // PRF unavailable (e.g. iOS Safari + external security key) — ask for passphrase
        setPendingLogin({ userId: result.userId, username: result.username, credentialId: result.credentialId });
        setSignInStatus('');
      }
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign in failed');
      setSignInStatus('');
    } finally {
      setSignInLoading(false);
    }
  }

  async function handlePassphraseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingLogin) return;
    setPassphraseError('');
    setPassphraseLoading(true);
    try {
      const clientKey = passphrase.trim()
        ? await deriveKeyFromPassphrase(passphrase, pendingLogin.credentialId)
        : null;
      onLogin(pendingLogin.userId, pendingLogin.username, pendingLogin.credentialId, clientKey);
    } catch (err) {
      setPassphraseError(err instanceof Error ? err.message : 'Failed to derive encryption key');
    } finally {
      setPassphraseLoading(false);
    }
  }

  function handleSkipEncryption() {
    if (!pendingLogin) return;
    onLogin(pendingLogin.userId, pendingLogin.username, pendingLogin.credentialId, null);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regUsername.trim()) return;
    setRegError('');
    setRegStatus('');
    setRegSuccess(false);
    setRegLoading(true);
    try {
      setRegStatus('Starting registration...');
      const { options, challengeId } = await startRegistration(regUsername.trim());
      setRegStatus('Touch your YubiKey to register...');
      const credential = await browserRegister(options);
      setRegStatus('Finishing registration...');
      await finishRegistration(credential, challengeId, regUsername.trim(), regDisplayName.trim() || regUsername.trim());
      setRegSuccess(true);
      setRegStatus('');
      setRegUsername('');
      setRegDisplayName('');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
      setRegStatus('');
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <LockClosedRegular className={styles.lockIcon} fontSize={48} color="var(--colorBrandForeground1)" />
          <Title1>SecSelfStorage</Title1>
          <Text align="center" style={{ color: 'var(--colorNeutralForeground3)' }}>
            Secure self-hosted file storage
          </Text>
        </div>

        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => setActiveTab(data.value as TabValue)}
          className={styles.tabList}
        >
          <Tab value="signin">Sign In</Tab>
          <Tab value="register">Register</Tab>
        </TabList>

        {activeTab === 'signin' && (
          <>
            {pendingLogin ? (
              <form onSubmit={handlePassphraseSubmit} className={styles.form}>
                <MessageBar intent="warning">
                  <MessageBarBody>
                    Your YubiKey authenticated successfully, but this device/browser does not support
                    the PRF extension for external security keys (a known iOS Safari limitation).
                    Enter an encryption passphrase to keep end-to-end encryption active, or skip to
                    sign in without file encryption.
                  </MessageBarBody>
                </MessageBar>

                <Field
                  label="Encryption passphrase (optional)"
                  hint="You must use the same passphrase every time you sign in. Losing it will make your encrypted files permanently unreadable."
                >
                  <Input
                    type="password"
                    value={passphrase}
                    onChange={(_, d) => setPassphrase(d.value)}
                    placeholder="Enter a memorable passphrase"
                    disabled={passphraseLoading}
                    autoComplete="current-password"
                    autoCapitalize="none"
                  />
                </Field>

                {passphraseError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{passphraseError}</MessageBarBody>
                  </MessageBar>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    appearance="primary"
                    type="submit"
                    icon={<KeyRegular />}
                    disabled={passphraseLoading || !passphrase.trim()}
                    className={styles.submitButton}
                    style={{ flex: 1 }}
                  >
                    {passphraseLoading ? 'Deriving key…' : 'Use passphrase'}
                  </Button>
                  <Button
                    appearance="secondary"
                    onClick={handleSkipEncryption}
                    disabled={passphraseLoading}
                    className={styles.submitButton}
                  >
                    Skip
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className={styles.form}>
                <Field label="Username" required>
                  <Input
                    value={signInUsername}
                    onChange={(_, d) => setSignInUsername(d.value)}
                    placeholder="Enter your username"
                    disabled={signInLoading}
                    autoComplete="username"
                    autoCapitalize="none"
                  />
                </Field>

                {signInError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{signInError}</MessageBarBody>
                  </MessageBar>
                )}

                {signInStatus && (
                  <div className={styles.yubiKeyHint}>
                    {signInLoading && <Spinner size="tiny" />}
                    <Text>{signInStatus}</Text>
                  </div>
                )}

                <Button
                  appearance="primary"
                  type="submit"
                  icon={<KeyRegular />}
                  disabled={signInLoading || !signInUsername.trim()}
                  className={styles.submitButton}
                >
                  {signInLoading ? 'Authenticating...' : 'Sign in with YubiKey'}
                </Button>
              </form>
            )}
          </>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className={styles.form}>
            {regSuccess && (
              <MessageBar intent="success">
                <MessageBarBody>
                  YubiKey registered successfully! Switch to the Sign In tab to log in.
                </MessageBarBody>
              </MessageBar>
            )}

            <Field label="Username" required>
              <Input
                value={regUsername}
                onChange={(_, d) => setRegUsername(d.value)}
                placeholder="Choose a username"
                disabled={regLoading}
                autoComplete="username"
                autoCapitalize="none"
              />
            </Field>

            <Field label="Display name">
              <Input
                value={regDisplayName}
                onChange={(_, d) => setRegDisplayName(d.value)}
                placeholder="Your display name (optional)"
                disabled={regLoading}
                autoComplete="name"
              />
            </Field>

            {regError && (
              <MessageBar intent="error">
                <MessageBarBody>{regError}</MessageBarBody>
              </MessageBar>
            )}

            {regStatus && (
              <div className={styles.yubiKeyHint}>
                {regLoading && <Spinner size="tiny" />}
                <Text>{regStatus}</Text>
              </div>
            )}

            <Button
              appearance="primary"
              type="submit"
              icon={<KeyRegular />}
              disabled={regLoading || !regUsername.trim()}
              className={styles.submitButton}
            >
              {regLoading ? 'Registering...' : 'Register YubiKey'}
            </Button>

            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
              Insert your YubiKey before clicking Register.
            </Text>
          </form>
        )}
      </Card>
      <WebAuthnDebugPanel />
    </div>
  );
}
