import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Divider,
  Field,
  Input,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CopyRegular, SettingsRegular } from '@fluentui/react-icons';
import { startLogin } from '../api';
import { arrayBufferToBase64url, base64urlToArrayBuffer } from '../webauthn';

// Must match the constant in webauthn.ts so the PRF output is comparable
const PRF_SALT: ArrayBuffer = new TextEncoder()
  .encode('sec-selfstorage-client-encryption-v1')
  .slice().buffer as ArrayBuffer;

const useStyles = makeStyles({
  cogButton: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    opacity: '0.35',
    minWidth: 'auto',
    ':hover': { opacity: '1' },
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '4px',
  },
  row: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
  },
  logArea: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
    height: '260px',
    resize: 'vertical',
  },
});

function getPlatformInfo(): string {
  return [
    `UA: ${navigator.userAgent}`,
    `Platform: ${(navigator as Navigator & { platform?: string }).platform ?? 'unknown'}`,
    `MaxTouchPoints: ${navigator.maxTouchPoints}`,
    `Languages: ${navigator.languages?.join(', ') ?? 'unknown'}`,
    `Online: ${navigator.onLine}`,
  ].join('\n');
}

async function checkCapabilities(): Promise<string[]> {
  const lines: string[] = ['=== WebAuthn Capabilities ==='];

  lines.push(
    `navigator.credentials: ${typeof navigator.credentials !== 'undefined' ? 'available ✅' : 'MISSING ❌'}`,
  );
  lines.push(
    `PublicKeyCredential: ${typeof PublicKeyCredential !== 'undefined' ? 'available ✅' : 'MISSING ❌'}`,
  );

  if (typeof PublicKeyCredential !== 'undefined') {
    try {
      const uvpa = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      lines.push(`isUserVerifyingPlatformAuthenticatorAvailable: ${uvpa}`);
    } catch (e) {
      lines.push(`isUserVerifyingPlatformAuthenticatorAvailable: ERROR — ${e}`);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkc = PublicKeyCredential as any;
      if (typeof pkc.isConditionalMediationAvailable === 'function') {
        const cma = await pkc.isConditionalMediationAvailable();
        lines.push(`isConditionalMediationAvailable: ${cma}`);
      } else {
        lines.push('isConditionalMediationAvailable: not supported by browser');
      }
    } catch (e) {
      lines.push(`isConditionalMediationAvailable: ERROR — ${e}`);
    }
  }

  return lines;
}

export default function WebAuthnDebugPanel() {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState('');
  const [username, setUsername] = useState('');
  const [testing, setTesting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const appendLog = useCallback((lines: string | string[]) => {
    setLog((prev) => {
      const add = Array.isArray(lines) ? lines.join('\n') : lines;
      return prev ? `${prev}\n${add}` : add;
    });
  }, []);

  const runCapabilityCheck = useCallback(async () => {
    setLog('=== Platform Info ===\n' + getPlatformInfo());
    appendLog('');
    const capLines = await checkCapabilities();
    appendLog(capLines);
  }, [appendLog]);

  const runPrfTest = useCallback(async () => {
    if (!username.trim()) {
      appendLog('[ERROR] Enter a username first');
      return;
    }
    setTesting(true);
    appendLog('');
    appendLog('=== PRF Authentication Test ===');
    appendLog(`Username: ${username.trim()}`);
    try {
      appendLog('1. Calling startLogin...');
      const { options, challengeId } = await startLogin(username.trim());
      appendLog(`   challengeId: ${challengeId}`);
      appendLog(`   rpId: ${options.rpId ?? `(not set — browser defaults to ${window.location.hostname})`}`);
      appendLog(`   server extensions: ${JSON.stringify(options.extensions ?? null)}`);
      appendLog(`   allowCredentials count: ${options.allowCredentials?.length ?? 0}`);
      appendLog(`   options: ${JSON.stringify(options, null, 2).replace(/\n/g, '\n   ')}`);
      if (options.allowCredentials?.length) {
        appendLog(
          `   transports[0]: ${JSON.stringify(options.allowCredentials[0].transports ?? [])}`,
        );
      }

      appendLog('2. Calling navigator.credentials.get() with PRF extension...');
      const publicKey: PublicKeyCredentialRequestOptions = {
        ...options,
        challenge: base64urlToArrayBuffer(options.challenge),
        allowCredentials: options.allowCredentials?.map(
          (c: { id: string; type: string; transports?: string[] }) => ({
            id: base64urlToArrayBuffer(c.id),
            type: c.type as PublicKeyCredentialType,
            transports: c.transports as AuthenticatorTransport[] | undefined,
          }),
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extensions: { prf: { eval: { first: PRF_SALT } } } as any,
      };

      const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
      if (!credential) {
        appendLog('[ERROR] navigator.credentials.get() returned null');
        return;
      }
      appendLog(`   credential.id: ${credential.id}`);
      appendLog(`   credential.type: ${credential.type}`);

      const extResults = credential.getClientExtensionResults();
      appendLog(
        `3. Raw getClientExtensionResults():\n   ${JSON.stringify(extResults, null, 2).replace(/\n/g, '\n   ')}`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prfResult = (extResults as any)?.prf;
      let prfPresent = false;
      if (prfResult !== undefined) {
        appendLog(`   prf.enabled: ${prfResult.enabled ?? '(absent)'}`);
        if (prfResult.results?.first) {
          prfPresent = true;
          const buf = prfResult.results.first as ArrayBuffer;
          appendLog(
            `   prf.results.first (base64url): ${arrayBufferToBase64url(buf)} (${buf.byteLength} bytes) ✅`,
          );
        } else {
          appendLog('   prf.results.first: null/undefined ❌');
        }
      } else {
        appendLog('   prf key absent from extension results ❌');
      }

      const assertionResponse = credential.response as AuthenticatorAssertionResponse;
      const authDataBytes = new Uint8Array(assertionResponse.authenticatorData);
      const flagsByte = authDataBytes[32];
      const upFlag = !!(flagsByte & 0x01);
      const uvFlag = !!(flagsByte & 0x04);
      const atFlag = !!(flagsByte & 0x40);
      const edFlag = !!(flagsByte & 0x80);
      appendLog(`4. authenticatorData: ${assertionResponse.authenticatorData.byteLength} bytes`);
      appendLog(
        `   flags byte 0x${flagsByte.toString(16).padStart(2, '0')}: ` +
          `UP=${upFlag ? 1 : 0} UV=${uvFlag ? 1 : 0} AT=${atFlag ? 1 : 0} ED=${edFlag ? 1 : 0}`,
      );
      appendLog(
        `   ED (Extension Data present in authenticatorData): ${edFlag ? 'YES ✅' : 'NO ❌'}`,
      );
      if (!edFlag) {
        appendLog(
          '   ↳ The authenticator returned no extension outputs. The PRF/hmac-secret',
        );
        appendLog(
          '     extension was either not forwarded to the key, or the credential was',
        );
        appendLog('     not enrolled with hmac-secret enabled.');
      }

      appendLog('[DONE] Test complete — check prf results above');

      // Diagnosis section
      appendLog('');
      appendLog('=== Diagnosis ===');
      const firstCred = options.allowCredentials?.[0];
      const transports: string[] = firstCred?.transports ?? [];
      const isExternalKey = transports.some((t) => t === 'usb' || t === 'nfc');
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

      if (!prfPresent && !edFlag && isExternalKey) {
        appendLog('LIKELY CAUSE: iOS Safari (and many mobile browsers) do not forward the');
        appendLog('PRF/hmac-secret extension to external USB or NFC security keys.');
        appendLog('PRF is only supported for platform authenticators (Face ID / Touch ID)');
        appendLog('on iOS. The 37-byte authenticatorData (no ED flag) confirms the key');
        appendLog('itself received no extension request from the browser.');
        appendLog('');
        appendLog('SOLUTIONS:');
        appendLog('  1. Use the passphrase fallback shown on the sign-in screen.');
        appendLog('  2. Re-register using Face ID / Touch ID as the platform authenticator.');
        appendLog('  3. Sign in on a desktop browser (Chrome/Firefox) which supports PRF');
        appendLog('     for external security keys via CTAP2.1.');
        if (!isIos) {
          appendLog('');
          appendLog('NOTE: This browser does not appear to be iOS Safari. If PRF is still');
          appendLog('absent, the credential may have been enrolled without hmac-secret');
          appendLog('(registered before PRF support was added). Re-register the key.');
        }
      } else if (prfPresent) {
        appendLog('PRF extension output received ✅ — E2E encryption should work normally.');
      } else {
        appendLog('Could not determine cause automatically. See raw results above.');
      }
    } catch (e) {
      if (e instanceof Error) {
        appendLog(`[ERROR] ${e.name}: ${e.message}`);
        if (e.stack) appendLog(e.stack);
      } else {
        appendLog(`[ERROR] ${String(e)}`);
      }
    } finally {
      setTesting(false);
    }
  }, [username, appendLog]);

  const copyLog = useCallback(() => {
    if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    navigator.clipboard.writeText(log).then(() => {
      setCopyStatus('copied');
      copyTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(() => {
      setCopyStatus('error');
      copyTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
    });
  }, [log]);

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          icon={<SettingsRegular />}
          className={styles.cogButton}
          title="Open WebAuthn debug panel"
          aria-label="Open WebAuthn debug panel"
        />
      </DialogTrigger>

      <DialogSurface style={{ maxWidth: '600px', width: '95vw' }}>
        <DialogTitle>WebAuthn Debug Panel</DialogTitle>
        <DialogBody>
          <DialogContent>
            <div className={styles.section}>
              <Text>
                Inspect browser WebAuthn capabilities and test the PRF extension end-to-end.
                Useful for diagnosing why a YubiKey via USB-C on iOS may not produce PRF output.
              </Text>
              <Button onClick={runCapabilityCheck} appearance="secondary">
                Check Capabilities
              </Button>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            <div className={styles.section}>
              <Text weight="semibold">PRF Extension Test</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Enter a registered username to run a full WebAuthn authentication and inspect the
                raw PRF extension results. The sign-in will not be completed.
              </Text>
              <div className={styles.row}>
                <Field style={{ flex: 1 }} label="Registered username">
                  <Input
                    value={username}
                    onChange={(_, d) => setUsername(d.value)}
                    placeholder="e.g. alice"
                    disabled={testing}
                    autoCapitalize="none"
                    autoComplete="username"
                  />
                </Field>
                <Button
                  onClick={runPrfTest}
                  disabled={testing || !username.trim()}
                  appearance="primary"
                >
                  {testing ? 'Testing…' : 'Test PRF'}
                </Button>
              </div>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            <div className={styles.section}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text weight="semibold" style={{ flex: 1 }}>
                  Log Output
                </Text>
                <Button
                  icon={<CopyRegular />}
                  appearance="subtle"
                  size="small"
                  onClick={copyLog}
                  disabled={!log}
                  title="Copy log to clipboard"
                >
                  {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy'}
                </Button>
              </div>
              <Textarea
                className={styles.logArea}
                value={log}
                readOnly
                placeholder="Click 'Check Capabilities' or 'Test PRF' to see output here…"
                resize="vertical"
              />
            </div>
          </DialogContent>
        </DialogBody>

        <DialogActions>
          <Button onClick={() => setLog('')} appearance="secondary" disabled={!log}>
            Clear Log
          </Button>
          <DialogTrigger disableButtonEnhancement>
            <Button appearance="primary">Close</Button>
          </DialogTrigger>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
