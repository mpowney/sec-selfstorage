import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Button,
  Text,
  Title2,
  Spinner,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  ProgressBar,
  Badge,
  Tooltip,
  Input,
  Label,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Divider,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from '@fluentui/react-components';
import {
  SignOutRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  DocumentRegular,
  FolderRegular,
  FolderOpenRegular,
  FolderAddRegular,
  ImageRegular,
  VideoRegular,
  SoundWaveCircleRegular,
  DocumentPdfRegular,
  DocumentTextRegular,
  CodeRegular,
  ArchiveRegular,
  EyeRegular,
  HomeRegular,
  ChevronRightRegular,
  LockClosedRegular,
  PersonRegular,
  MoreHorizontalRegular,
  AddRegular,
  PhoneRegular,
  WarningRegular,
  KeyRegular,
} from '@fluentui/react-icons';
import { listFiles, uploadFile, downloadFile, previewFile, deleteFile, logout, listCredentials, startAddCredential, finishAddCredential, getWrappedKey, storeWrappedKey, startLogin, updateCredentialName } from '../api';
import type { FileRecord, CredentialInfo } from '../api';
import { browserRegister, browserAuthenticate, deriveWrappingKey, wrapMasterKey, unwrapMasterKey, clientEncryptFile, clientDecryptFile, arrayBufferToBase64url, base64urlToArrayBuffer } from '../webauthn';
import { formatFileSize, formatDate } from '../utils';
import UploadArea from './UploadArea';

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: '12px 24px',
    '@media (max-width: 640px)': {
      padding: '8px 12px',
    },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  profilePopoverContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '4px 0',
    minWidth: '220px',
  },
  main: {
    flex: 1,
    padding: '24px',
    '@media (max-width: 640px)': {
      padding: '12px',
    },
    maxWidth: '1100px',
    width: '100%',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  uploadSection: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: '20px',
    '@media (max-width: 640px)': {
      padding: '12px',
    },
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: tokens.shadow4,
  },
  filesSection: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: '20px',
    '@media (max-width: 640px)': {
      padding: '12px',
    },
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: tokens.shadow4,
  },
  filesSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  filesSectionHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
  },
  breadcrumbSeparator: {
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: `2px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase300,
    verticalAlign: 'middle',
  },
  tdActions: {
    padding: '6px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  },
  filenameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '180px',
    '@media (max-width: 640px)': {
      minWidth: '0',
    },
  },
  mobileHidden: {
    '@media (max-width: 640px)': {
      display: 'none',
    },
  },
  actionsDesktop: {
    display: 'flex',
    gap: '4px',
    '@media (max-width: 640px)': {
      display: 'none',
    },
  },
  actionsMobile: {
    display: 'none',
    '@media (max-width: 640px)': {
      display: 'flex',
      justifyContent: 'flex-end',
    },
  },
  folderRow: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '48px 24px',
    color: tokens.colorNeutralForeground3,
  },
  uploadQueue: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  uploadItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
  uploadItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewOverlay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: '300px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
});

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface PreviewState {
  file: FileRecord;
  url: string;
  mimeType: string;
}

interface FilesPageProps {
  username: string;
  userId: string;
  credentialId: string;
  clientKey: CryptoKey | null;
  onLogout: () => void;
}

function getFileTypeIcon(mimeType: string): React.ReactElement {
  if (mimeType.startsWith('image/')) return <ImageRegular />;
  if (mimeType.startsWith('video/')) return <VideoRegular />;
  if (mimeType.startsWith('audio/')) return <SoundWaveCircleRegular />;
  if (mimeType === 'application/pdf') return <DocumentPdfRegular />;
  if (mimeType.startsWith('text/') || mimeType === 'application/rtf') return <DocumentTextRegular />;
  if (
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/typescript' ||
    mimeType === 'application/xml' ||
    mimeType === 'text/html' ||
    mimeType === 'text/css' ||
    mimeType === 'text/javascript'
  )
    return <CodeRegular />;
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    mimeType === 'application/x-tar' ||
    mimeType === 'application/gzip' ||
    mimeType === 'application/x-7z-compressed' ||
    mimeType === 'application/x-rar-compressed'
  )
    return <ArchiveRegular />;
  return <DocumentRegular />;
}

function isViewable(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

/** Returns a human-readable label for an authMechanisms value. */
function authMechanismsLabel(authMechanisms: string): string {
  switch (authMechanisms) {
    case 'e2e-platform': return 'E2E (platform authenticator, e.g. TouchID/Face ID)';
    case 'e2e-roaming': return 'E2E (security key)';
    case 'e2e-hybrid': return 'E2E (passkey/hybrid authenticator)';
    case 'e2e-unknown': return 'E2E (authenticator type unknown)';
    case 'server': return 'Server-side encrypted only';
    default: return 'Server-side encrypted only';
  }
}

/** Returns the icon used to indicate the type of authenticator that performed E2E encryption. */
function authMechanismsIcon(authMechanisms: string): React.ReactElement | undefined {
  if (authMechanisms === 'e2e-platform') return <PhoneRegular />;
  if (authMechanisms === 'e2e-hybrid') return <PhoneRegular />;
  if (authMechanisms.startsWith('e2e')) return <KeyRegular />;
  return undefined;
}

/** Returns a short display label for a credential based on its transports. */
function credentialTransportLabel(transports: string[]): string {
  if (transports.includes('internal')) return 'Platform authenticator (TouchID / Face ID)';
  if (transports.includes('hybrid')) return 'Passkey (hybrid)';
  return 'Security key';
}

export default function FilesPage({ username, credentialId, clientKey, onLogout }: FilesPageProps) {
  const styles = useStyles();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState('');
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState('');
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const previewUrlRef = useRef<string | null>(null);

  // Add-credential state
  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [decryptedCredentialNames, setDecryptedCredentialNames] = useState<Record<string, string>>({});
  const [addCredentialOpen, setAddCredentialOpen] = useState(false);
  const [addCredentialName, setAddCredentialName] = useState('');
  const [addCredentialStatus, setAddCredentialStatus] = useState('');
  const [addCredentialError, setAddCredentialError] = useState('');
  const [addCredentialSuccess, setAddCredentialSuccess] = useState(false);
  const [addCredentialLoading, setAddCredentialLoading] = useState(false);

  const loadFiles = useCallback(async (folder: string) => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const data = await listFiles(folder);
      setFiles(data.files);
      setFolders(data.folders);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles(currentFolder);
  }, [loadFiles, currentFolder]);

  // Load credentials list on mount for display in profile popover; decrypt names if clientKey available
  useEffect(() => {
    void listCredentials().then(async (creds) => {
      setCredentials(creds);
      if (!clientKey) return;
      const names: Record<string, string> = {};
      await Promise.all(
        creds.map(async (cred) => {
          if (!cred.nameEncrypted) return;
          try {
            const encBytes = base64urlToArrayBuffer(cred.nameEncrypted);
            const decBytes = await clientDecryptFile(encBytes, clientKey);
            names[cred.credentialId] = new TextDecoder().decode(decBytes);
          } catch {
            // Decryption failed (e.g. encrypted with a different key) — skip
          }
        }),
      );
      setDecryptedCredentialNames(names);
    }).catch((err: unknown) => {
      console.warn('Failed to load credentials list:', err instanceof Error ? err.message : err);
    });
  }, [clientKey]);

  // Clean up any outstanding preview object URL when the component unmounts
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  async function handleAddCredential() {
    setAddCredentialError('');
    setAddCredentialStatus('');
    setAddCredentialSuccess(false);
    setAddCredentialLoading(true);
    try {
      // Step 1: Register the new credential
      setAddCredentialStatus('Starting registration...');
      const { options, challengeId } = await startAddCredential();
      setAddCredentialStatus('Touch your authenticator (TouchID, Face ID, or security key)...');
      const newCredential = await browserRegister(options);
      setAddCredentialStatus('Completing registration...');
      await finishAddCredential(newCredential, challengeId);

      const newCredentialId = newCredential.id;

      // Step 2: If the current session has a master key, wrap it for the new credential.
      // This enables the new credential to decrypt any file encrypted with the master key,
      // regardless of which credential originally uploaded it.
      if (clientKey) {
        try {
          setAddCredentialStatus('Activating shared encryption for the new authenticator — touch your new authenticator again to confirm.');
          // Get a WebAuthn challenge so we can call navigator.credentials.get() on the new
          // credential and extract its PRF output. We reuse login/start (with the current user's
          // username) to obtain a server-generated challenge; we intentionally do NOT call
          // login/finish afterwards — the session remains unchanged and the orphaned challenge
          // entry in the DB is harmless (it contains no sensitive data and is never consumed).
          const { options: loginOptions } = await startLogin(username);
          const { prfOutput: newPrfOutput } = await browserAuthenticate({
            ...loginOptions,
            // Restrict to just the newly registered credential
            allowCredentials: [{ id: newCredentialId, type: 'public-key' }],
          });

          if (newPrfOutput) {
            // Derive a wrapping key from the new credential's PRF and wrap the shared master key
            const newWrappingKey = await deriveWrappingKey(newPrfOutput);
            const { wrappedKey, iv } = await wrapMasterKey(clientKey, newWrappingKey);
            await storeWrappedKey(newCredentialId, wrappedKey, iv);
          }
          // If newPrfOutput is null the new credential doesn't support PRF — the credential
          // is still registered, but cross-credential decryption won't be available for it.
        } catch {
          // Key wrapping failed (e.g. user cancelled the second touch) — the credential is
          // still registered; cross-credential decryption can be set up by signing in with
          // the new credential and then re-adding it.
        }

        // Step 3: Encrypt and store the authenticator name if provided
        const trimmedName = addCredentialName.trim();
        if (trimmedName) {
          try {
            const encBytes = await clientEncryptFile(new TextEncoder().encode(trimmedName).buffer as ArrayBuffer, clientKey);
            await updateCredentialName(newCredentialId, arrayBufferToBase64url(encBytes));
          } catch {
            // Name storage failure is non-fatal
          }
        }
      }

      setAddCredentialSuccess(true);
      setAddCredentialStatus('');
      setAddCredentialName('');
      // Refresh credentials list and decrypt names
      const updated = await listCredentials();
      setCredentials(updated);
      if (clientKey) {
        const names: Record<string, string> = { ...decryptedCredentialNames };
        await Promise.all(
          updated.map(async (cred) => {
            if (!cred.nameEncrypted) return;
            try {
              const encBytes = base64urlToArrayBuffer(cred.nameEncrypted);
              const decBytes = await clientDecryptFile(encBytes, clientKey);
              names[cred.credentialId] = new TextDecoder().decode(decBytes);
            } catch { /* skip */ }
          }),
        );
        setDecryptedCredentialNames(names);
      }
    } catch (err) {
      setAddCredentialError(err instanceof Error ? err.message : 'Failed to add authenticator');
      setAddCredentialStatus('');
    } finally {
      setAddCredentialLoading(false);
    }
  }

  function handleFilesSelected(selected: File[]) {
    const newItems: UploadItem[] = selected.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'pending',
    }));
    setUploadQueue((prev) => [...prev, ...newItems]);
    for (const item of newItems) {
      void startUpload(item);
    }
  }

  async function startUpload(item: UploadItem) {
    setUploadQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)),
    );
    try {
      const result = await uploadFile(item.file, credentialId, currentFolder, clientKey, (pct) => {
        setUploadQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)),
        );
      });
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'done', progress: 100 } : i)),
      );
      if (result.folderPath === currentFolder) {
        setFiles((prev) => [result, ...prev]);
      }
      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((i) => i.id !== item.id));
      }, 2000);
    } catch (err) {
      setUploadQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
            : i,
        ),
      );
    }
  }

  async function handleDownload(file: FileRecord) {
    setActionError('');
    try {
      await downloadFile(file.id, file.filename, file.mimeType, clientKey);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function handlePreview(file: FileRecord) {
    setActionError('');
    setPreviewLoadingId(file.id);
    try {
      const { url, mimeType } = await previewFile(file.id, file.mimeType, clientKey);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = url;
      setPreview({ file, url, mimeType });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewLoadingId(null);
    }
  }

  function handleClosePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setActionError('');
    try {
      await deleteFile(deleteTarget.id);
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  function navigateToFolder(folder: string) {
    setCurrentFolder(folder);
  }

  function getBreadcrumbSegments(): Array<{ label: string; path: string }> {
    if (!currentFolder) return [];
    const parts = currentFolder.split('/');
    return parts.map((part, i) => ({
      label: part,
      path: parts.slice(0, i + 1).join('/'),
    }));
  }

  function handleNewFolder() {
    // Only allow alphanumeric, spaces, hyphens, underscores, and dots in folder names
    const name = newFolderName.trim().replace(/[^a-zA-Z0-9 ._-]/g, '');
    if (!name) return;
    const newPath = currentFolder ? `${currentFolder}/${name}` : name;
    setNewFolderName('');
    setNewFolderOpen(false);
    navigateToFolder(newPath);
  }

  const breadcrumbSegments = getBreadcrumbSegments();
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Title2>SecSelfStorage</Title2>
        </div>
        <div className={styles.headerRight}>
          <Popover positioning="below-end">
            <PopoverTrigger disableButtonEnhancement>
              <Button
                appearance="subtle"
                icon={<PersonRegular />}
                aria-label="Profile"
              />
            </PopoverTrigger>
            <PopoverSurface>
              <div className={styles.profilePopoverContent}>
                <Text size={300} style={{ color: 'var(--colorNeutralForeground2)' }}>
                  Signed in as <strong>{username}</strong>
                </Text>
                {clientKey ? (
                  <Badge appearance="tint" color="success" icon={<LockClosedRegular />}>
                    E2E Encrypted
                  </Badge>
                ) : (
                  <Badge appearance="tint" color="subtle">
                    Session encryption only
                  </Badge>
                )}
                {credentials.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Text size={200} style={{ color: 'var(--colorNeutralForeground3)', fontWeight: 600 }}>
                      Registered authenticators
                    </Text>
                    {credentials.map((cred) => {
                      const isCurrentSession = cred.credentialId === credentialId;
                      const isPlatform = cred.transports.includes('internal');
                      const isHybrid = cred.transports.includes('hybrid');
                      const label = credentialTransportLabel(cred.transports);
                      const displayName = decryptedCredentialNames[cred.credentialId];
                      return (
                        <div key={cred.credentialId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isPlatform || isHybrid ? <PhoneRegular fontSize={14} /> : <KeyRegular fontSize={14} />}
                          <Text size={200}>{displayName ? displayName : label}</Text>
                          {isCurrentSession && (
                            <Badge appearance="tint" color="brand" size="small">current</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <Button
                  appearance="subtle"
                  icon={<AddRegular />}
                  size="small"
                  onClick={() => {
                    setAddCredentialOpen(true);
                    setAddCredentialError('');
                    setAddCredentialStatus('');
                    setAddCredentialSuccess(false);
                    setAddCredentialName('');
                  }}
                >
                  Add authenticator
                </Button>
                <Divider />
                <Button
                  appearance="subtle"
                  icon={<SignOutRegular />}
                  onClick={() => void handleLogout()}
                >
                  Sign out
                </Button>
              </div>
            </PopoverSurface>
          </Popover>
        </div>
      </header>

      <main className={styles.main}>
        {/* Upload Section */}
        <section className={styles.uploadSection}>
          <Text weight="semibold" size={400}>
            Upload Files{currentFolder ? ` to /${currentFolder}` : ''}
          </Text>
          <UploadArea
            onFilesSelected={handleFilesSelected}
            disabled={uploadQueue.some((i) => i.status === 'uploading')}
          />
          {uploadQueue.length > 0 && (
            <div className={styles.uploadQueue}>
              {uploadQueue.map((item) => (
                <div key={item.id} className={styles.uploadItem}>
                  <div className={styles.uploadItemHeader}>
                    <Text size={200} truncate>
                      {item.file.name}
                    </Text>
                    <Badge
                      appearance="tint"
                      color={
                        item.status === 'done'
                          ? 'success'
                          : item.status === 'error'
                            ? 'danger'
                            : 'brand'
                      }
                    >
                      {item.status === 'done'
                        ? 'Done'
                        : item.status === 'error'
                          ? 'Error'
                          : item.status === 'uploading'
                            ? `${item.progress}%`
                            : 'Pending'}
                    </Badge>
                  </div>
                  {(item.status === 'uploading' || item.status === 'pending') && (
                    <ProgressBar value={item.progress / 100} />
                  )}
                  {item.status === 'error' && item.error && (
                    <Text size={100} style={{ color: 'var(--colorPaletteRedForeground1)' }}>
                      {item.error}
                    </Text>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Files Section */}
        <section className={styles.filesSection}>
          <div className={styles.filesSectionHeader}>
            <Text weight="semibold" size={400}>
              Your Files
            </Text>
            <div className={styles.filesSectionHeaderActions}>
              <Button
                appearance="subtle"
                size="small"
                icon={<FolderAddRegular />}
                onClick={() => setNewFolderOpen(true)}
              >
                New Folder
              </Button>
              <Button appearance="subtle" size="small" onClick={() => void loadFiles(currentFolder)}>
                Refresh
              </Button>
            </div>
          </div>

          {/* Breadcrumb navigation */}
          <div className={styles.breadcrumb}>
            <Button
              appearance="subtle"
              size="small"
              icon={<HomeRegular />}
              onClick={() => navigateToFolder('')}
              style={{ minWidth: 0, padding: '4px 8px' }}
            >
              Home
            </Button>
            {breadcrumbSegments.map((seg) => (
              <React.Fragment key={seg.path}>
                <span className={styles.breadcrumbSeparator}>
                  <ChevronRightRegular fontSize={14} />
                </span>
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => navigateToFolder(seg.path)}
                  style={{ minWidth: 0, padding: '4px 8px' }}
                >
                  {seg.label}
                </Button>
              </React.Fragment>
            ))}
          </div>

          {actionError && (
            <MessageBar intent="error">
              <MessageBarBody>{actionError}</MessageBarBody>
            </MessageBar>
          )}

          {filesError && (
            <MessageBar intent="error">
              <MessageBarBody>{filesError}</MessageBarBody>
            </MessageBar>
          )}

          {filesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Spinner label="Loading files..." />
            </div>
          ) : isEmpty ? (
            <div className={styles.emptyState}>
              <FolderOpenRegular fontSize={56} />
              <Text size={400} weight="semibold">
                {currentFolder ? 'This folder is empty' : 'No files yet'}
              </Text>
              <Text size={300}>
                {currentFolder
                  ? 'Upload files here or navigate to another folder.'
                  : 'Upload your first file using the area above.'}
              </Text>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Size</th>
                  <th className={mergeClasses(styles.th, styles.mobileHidden)}>Type</th>
                  <th className={mergeClasses(styles.th, styles.mobileHidden)}>Uploaded</th>
                  <th className={mergeClasses(styles.th, styles.mobileHidden)}>Encryption</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((folderName) => {
                  const folderPath = currentFolder
                    ? `${currentFolder}/${folderName}`
                    : folderName;
                  return (
                    <tr
                      key={`folder:${folderPath}`}
                      className={styles.folderRow}
                      onClick={() => navigateToFolder(folderPath)}
                    >
                      <td className={styles.td}>
                        <div className={styles.filenameCell}>
                          <FolderRegular
                            fontSize={18}
                            style={{ flexShrink: 0, color: 'var(--colorBrandForeground1)' }}
                          />
                          <Text truncate title={folderName}>
                            {folderName}
                          </Text>
                        </div>
                      </td>
                      <td className={styles.td}>—</td>
                      <td className={mergeClasses(styles.td, styles.mobileHidden)}>
                        <Badge appearance="tint" color="subtle">
                          Folder
                        </Badge>
                      </td>
                      <td className={mergeClasses(styles.td, styles.mobileHidden)}>—</td>
                      <td className={mergeClasses(styles.td, styles.mobileHidden)} />
                      <td className={styles.tdActions} />
                    </tr>
                  );
                })}
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className={styles.td}>
                      <div className={styles.filenameCell}>
                        <span
                          style={{
                            flexShrink: 0,
                            color: 'var(--colorBrandForeground1)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {getFileTypeIcon(file.mimeType)}
                        </span>
                        <Text truncate title={file.filename}>
                          {file.filename}
                        </Text>
                      </div>
                    </td>
                    <td className={styles.td}>{formatFileSize(file.size)}</td>
                    <td className={mergeClasses(styles.td, styles.mobileHidden)}>
                      <Badge appearance="tint" color="informative">
                        {file.mimeType || 'unknown'}
                      </Badge>
                    </td>
                    <td className={mergeClasses(styles.td, styles.mobileHidden)}>{formatDate(file.uploadedAt)}</td>
                    <td className={mergeClasses(styles.td, styles.mobileHidden)}>
                      {file.clientEncrypted ? (
                        file.credentialId === credentialId ? (
                          <Tooltip
                            content={`${authMechanismsLabel(file.authMechanisms)} — this session can decrypt`}
                            relationship="label"
                          >
                            <Badge
                              appearance="tint"
                              color="success"
                              icon={authMechanismsIcon(file.authMechanisms) ?? <LockClosedRegular />}
                            >
                              E2E ✓
                            </Badge>
                          </Tooltip>
                        ) : (
                          <Tooltip
                            content={`${authMechanismsLabel(file.authMechanisms)} — log in with the original authenticator to decrypt client-side`}
                            relationship="label"
                          >
                            <Badge
                              appearance="tint"
                              color="warning"
                              icon={<WarningRegular />}
                            >
                              E2E
                            </Badge>
                          </Tooltip>
                        )
                      ) : (
                        <Tooltip content="Server-side encrypted only" relationship="label">
                          <Badge appearance="tint" color="subtle">
                            Server
                          </Badge>
                        </Tooltip>
                      )}
                    </td>
                    <td className={styles.tdActions}>
                      {/* Desktop: inline icon buttons */}
                      <div className={styles.actionsDesktop}>
                        {isViewable(file.mimeType) && (
                          <Tooltip content="Preview" relationship="label">
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={previewLoadingId === file.id ? <Spinner size="tiny" /> : <EyeRegular />}
                              onClick={() => void handlePreview(file)}
                              aria-label={`Preview ${file.filename}`}
                              disabled={previewLoadingId !== null}
                            />
                          </Tooltip>
                        )}
                        <Tooltip content="Download" relationship="label">
                          <Button
                            appearance="subtle"
                            size="small"
                            icon={<ArrowDownloadRegular />}
                            onClick={() => void handleDownload(file)}
                            aria-label={`Download ${file.filename}`}
                          />
                        </Tooltip>
                        <Tooltip content="Delete" relationship="label">
                          <Button
                            appearance="subtle"
                            size="small"
                            icon={<DeleteRegular />}
                            onClick={() => setDeleteTarget(file)}
                            aria-label={`Delete ${file.filename}`}
                            style={{ color: 'var(--colorPaletteRedForeground1)' }}
                          />
                        </Tooltip>
                      </div>
                      {/* Mobile: context menu */}
                      <div className={styles.actionsMobile}>
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<MoreHorizontalRegular />}
                              aria-label={`Actions for ${file.filename}`}
                              disabled={previewLoadingId !== null}
                            />
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              {isViewable(file.mimeType) && (
                                <MenuItem
                                  icon={previewLoadingId === file.id ? <Spinner size="tiny" /> : <EyeRegular />}
                                  onClick={() => void handlePreview(file)}
                                >
                                  Preview
                                </MenuItem>
                              )}
                              <MenuItem
                                icon={<ArrowDownloadRegular />}
                                onClick={() => void handleDownload(file)}
                              >
                                Download
                              </MenuItem>
                              <MenuItem
                                icon={<DeleteRegular />}
                                onClick={() => setDeleteTarget(file)}
                                style={{ color: 'var(--colorPaletteRedForeground1)' }}
                              >
                                Delete
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogContent>
              <Text>
                Are you sure you want to delete{' '}
                <strong>{deleteTarget?.filename}</strong>? This action cannot be undone.
              </Text>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary" disabled={deleteLoading}>
                  Cancel
                </Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                style={{ backgroundColor: 'var(--colorPaletteRedBackground3)' }}
                onClick={() => void handleDeleteConfirm()}
                disabled={deleteLoading}
                icon={deleteLoading ? <Spinner size="tiny" /> : <DeleteRegular />}
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog
        open={newFolderOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setNewFolderOpen(false);
            setNewFolderName('');
          }
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>New Folder</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Label htmlFor="new-folder-name">Folder name</Label>
                <Input
                  id="new-folder-name"
                  value={newFolderName}
                  onChange={(_, d) => setNewFolderName(d.value)}
                  placeholder="e.g. Documents"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNewFolder();
                  }}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={handleNewFolder}
                disabled={!newFolderName.trim()}
              >
                Create
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Preview / Lightbox Dialog */}
      <Dialog
        open={preview !== null}
        onOpenChange={(_, data) => {
          if (!data.open) handleClosePreview();
        }}
      >
        <DialogSurface style={{ maxWidth: '90vw', width: 'auto' }}>
          <DialogBody>
            <DialogTitle>{preview?.file.filename}</DialogTitle>
            <DialogContent>
              {preview && (
                <div className={styles.previewOverlay}>
                  {preview.mimeType.startsWith('image/') ? (
                    <img
                      src={preview.url}
                      alt={preview.file.filename}
                      style={{
                        maxWidth: '80vw',
                        maxHeight: '70vh',
                        objectFit: 'contain',
                        borderRadius: tokens.borderRadiusMedium,
                      }}
                    />
                  ) : preview.mimeType === 'application/pdf' ? (
                    <iframe
                      src={preview.url}
                      title={preview.file.filename}
                      style={{
                        width: '75vw',
                        height: '70vh',
                        border: 'none',
                        borderRadius: tokens.borderRadiusMedium,
                      }}
                    />
                  ) : null}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="subtle"
                icon={<ArrowDownloadRegular />}
                onClick={() => preview && void handleDownload(preview.file)}
              >
                Download
              </Button>
              <Button appearance="primary" onClick={handleClosePreview}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Register Authenticator Dialog */}
      <Dialog
        open={addCredentialOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setAddCredentialOpen(false);
            setAddCredentialError('');
            setAddCredentialStatus('');
            setAddCredentialSuccess(false);
            setAddCredentialName('');
          }
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Register authenticator</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Text>
                  Register an additional authenticator (e.g. security key, TouchID, Face ID, Windows Hello, or a passkey)
                  to share the same encryption key. You will be prompted twice: once to register the
                  authenticator and once to activate shared encryption. After this, signing in with either
                  authenticator will give access to all your E2E encrypted files.
                </Text>
                {clientKey && !addCredentialLoading && !addCredentialSuccess && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Label htmlFor="add-cred-name">Authenticator name (optional)</Label>
                    <Input
                      id="add-cred-name"
                      placeholder="e.g. Work security key, Home laptop"
                      value={addCredentialName}
                      onChange={(_, d) => setAddCredentialName(d.value)}
                      disabled={addCredentialLoading}
                    />
                    <Text size={100} style={{ color: 'var(--colorNeutralForeground3)' }}>
                      The name is encrypted and only visible to you.
                    </Text>
                  </div>
                )}
                {addCredentialSuccess && (
                  <MessageBar intent="success">
                    <MessageBarBody>
                      Authenticator added successfully! You can now sign in with it to enable E2E encryption.
                    </MessageBarBody>
                  </MessageBar>
                )}
                {addCredentialError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{addCredentialError}</MessageBarBody>
                  </MessageBar>
                )}
                {addCredentialStatus && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {addCredentialLoading && <Spinner size="tiny" />}
                    <Text size={200}>{addCredentialStatus}</Text>
                  </div>
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary" disabled={addCredentialLoading}>
                  {addCredentialSuccess ? 'Close' : 'Cancel'}
                </Button>
              </DialogTrigger>
              {!addCredentialSuccess && (
                <Button
                  appearance="primary"
                  icon={addCredentialLoading ? <Spinner size="tiny" /> : <AddRegular />}
                  onClick={() => void handleAddCredential()}
                  disabled={addCredentialLoading}
                >
                  {addCredentialLoading ? 'Registering...' : 'Register'}
                </Button>
              )}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
