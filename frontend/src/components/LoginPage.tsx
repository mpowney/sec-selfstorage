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
  Tab,
  TabList,
  Field,
  Spinner,
  Link,
} from '@fluentui/react-components';
import { LockClosedRegular, KeyRegular, EyeRegular, EyeOffRegular } from '@fluentui/react-icons';
import { startLogin, finishLogin, startRegistration, finishRegistration } from '../api';
import { browserAuthenticate, browserRegister, deriveClientKey, deriveKeyFromPassphrase } from '../webauthn';

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
  passphraseToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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
  const [signInPassphrase, setSignInPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showPassphraseField, setShowPassphraseField] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInStatus, setSignInStatus] = useState('');
  const [signInError, setSignInError] = useState('');

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
      console.debug('[E2E debug] handleSignIn: environment', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        webAuthnSupported: typeof window.PublicKeyCredential !== 'undefined',
        conditionalMediationAvailable: typeof window.PublicKeyCredential !== 'undefined'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? typeof (window.PublicKeyCredential as any).isConditionalMediationAvailable === 'function'
          : null,
        secureContext: window.isSecureContext,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
      });
      setSignInStatus('Starting authentication...');
      const { options, challengeId, encryptionSalt } = await startLogin(signInUsername.trim());
      console.debug('[E2E debug] handleSignIn: login/start options received', {
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        allowCredentialsCount: options.allowCredentials?.length ?? 0,
        allowCredentialTransports: options.allowCredentials?.map((c: { id: string; type: string; transports?: string[] }) => c.transports),
        hasEncryptionSalt: !!encryptionSalt,
      });
      setSignInStatus('Authenticate with your passkey or security key...');
      const { response: credential, prfOutput } = await browserAuthenticate(options);
      console.debug('[E2E debug] handleSignIn: authentication complete', {
        prfOutputReceived: prfOutput !== null,
        prfOutputByteLength: prfOutput !== null ? prfOutput.byteLength : null,
      });
      setSignInStatus('Verifying...');

      // Derive the client E2E key.  PRF takes priority (it's hardware-bound and
      // requires no passphrase to remember).  If PRF is unavailable (which happens
      // on iOS Safari with NFC security keys) and the user supplied a passphrase,
      // fall back to PBKDF2.
      let clientKey: CryptoKey | null = null;
      if (prfOutput) {
        clientKey = await deriveClientKey(prfOutput);
        console.debug('[E2E debug] handleSignIn: E2E key derived from PRF output');
      } else if (signInPassphrase && encryptionSalt) {
        clientKey = await deriveKeyFromPassphrase(signInPassphrase, encryptionSalt);
        console.debug('[E2E debug] handleSignIn: E2E key derived from passphrase (PRF unavailable)');
      } else {
        console.debug('[E2E debug] handleSignIn: no PRF output and no passphrase — session-only encryption');
      }

      const result = await finishLogin(credential, challengeId, !!clientKey);
      console.debug('[E2E debug] handleSignIn: login complete', {
        userId: result.userId,
        e2eEncryptionActive: clientKey !== null,
      });
      onLogin(result.userId, result.username, result.credentialId, clientKey);
    } catch (err) {
      console.debug('[E2E debug] handleSignIn: error', {
        name: err instanceof Error ? err.name : typeof err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      setSignInError(err instanceof Error ? err.message : 'Sign in failed');
      setSignInStatus('');
    } finally {
      setSignInLoading(false);
    }
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
      setRegStatus('Authenticate with your passkey or security key to register...');
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

            {/* Passphrase field for E2E encryption on platforms where PRF is unavailable */}
            {showPassphraseField ? (
              <Field
                label="Encryption passphrase"
                hint="Must be the same passphrase you used last time. Leave blank to skip E2E encryption."
              >
                <Input
                  type={showPassphrase ? 'text' : 'password'}
                  value={signInPassphrase}
                  onChange={(_, d) => setSignInPassphrase(d.value)}
                  placeholder="Your encryption passphrase"
                  disabled={signInLoading}
                  autoComplete="off"
                  contentAfter={
                    <Button
                      appearance="transparent"
                      icon={showPassphrase ? <EyeOffRegular /> : <EyeRegular />}
                      onClick={() => setShowPassphrase((v) => !v)}
                      aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                    />
                  }
                />
              </Field>
            ) : (
              <div className={styles.passphraseToggle}>
                <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
                  E2E encryption not working?{' '}
                </Text>
                <Link
                  onClick={() => setShowPassphraseField(true)}
                  style={{ fontSize: tokens.fontSizeBase200 }}
                >
                  Use a passphrase instead
                </Link>
              </div>
            )}

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
              {signInLoading ? 'Authenticating...' : 'Sign in with passkey or security key'}
            </Button>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className={styles.form}>
            {regSuccess && (
              <MessageBar intent="success">
                <MessageBarBody>
                  Passkey or security key registered successfully! Switch to the Sign In tab to log in.
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
              {regLoading ? 'Registering...' : 'Register passkey or security key'}
            </Button>

            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
              Use a passkey (Face ID, Touch ID) or insert a security key before clicking Register.
            </Text>
          </form>
        )}
      </Card>
    </div>
  );
}

