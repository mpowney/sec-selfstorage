import React, { useCallback, useEffect, useState } from 'react';
import {
  makeStyles,
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
} from '@fluentui/react-components';
import {
  SignOutRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  DocumentRegular,
  FolderRegular,
} from '@fluentui/react-icons';
import { listFiles, uploadFile, downloadFile, deleteFile, logout } from '../api';
import type { FileRecord } from '../api';
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
  main: {
    flex: 1,
    padding: '24px',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: tokens.shadow4,
  },
  filesSection: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: tokens.shadow4,
  },
  filesSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
});

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface FilesPageProps {
  username: string;
  userId: string;
  credentialId: string;
  onLogout: () => void;
}

export default function FilesPage({ username, credentialId, onLogout }: FilesPageProps) {
  const styles = useStyles();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState('');
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const data = await listFiles();
      setFiles(data);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  function handleFilesSelected(selected: File[]) {
    const newItems: UploadItem[] = selected.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'pending',
    }));
    setUploadQueue((prev) => [...prev, ...newItems]);
    // Start uploading immediately
    for (const item of newItems) {
      void startUpload(item);
    }
  }

  async function startUpload(item: UploadItem) {
    setUploadQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)),
    );
    try {
      const result = await uploadFile(item.file, credentialId, (pct) => {
        setUploadQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)),
        );
      });
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'done', progress: 100 } : i)),
      );
      setFiles((prev) => [result, ...prev]);
      // Remove done items after a short delay
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
      await downloadFile(file.id, file.filename);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Download failed');
    }
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

  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Title2>SecSelfStorage</Title2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Text size={300} style={{ color: 'var(--colorNeutralForeground2)' }}>
            Signed in as <strong>{username}</strong>
          </Text>
          <Button
            appearance="subtle"
            icon={<SignOutRegular />}
            onClick={() => void handleLogout()}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        {/* Upload Section */}
        <section className={styles.uploadSection}>
          <Text weight="semibold" size={400}>
            Upload Files
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
            <Button appearance="subtle" size="small" onClick={() => void loadFiles()}>
              Refresh
            </Button>
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
          ) : files.length === 0 ? (
            <div className={styles.emptyState}>
              <FolderRegular fontSize={56} />
              <Text size={400} weight="semibold">
                No files yet
              </Text>
              <Text size={300}>Upload your first file using the area above.</Text>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Size</th>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Uploaded</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className={styles.td}>
                      <div className={styles.filenameCell}>
                        <DocumentRegular fontSize={18} style={{ flexShrink: 0, color: 'var(--colorBrandForeground1)' }} />
                        <Text truncate title={file.filename}>
                          {file.filename}
                        </Text>
                      </div>
                    </td>
                    <td className={styles.td}>{formatFileSize(file.size)}</td>
                    <td className={styles.td}>
                      <Badge appearance="tint" color="informative">
                        {file.mimeType || 'unknown'}
                      </Badge>
                    </td>
                    <td className={styles.td}>{formatDate(file.uploadedAt)}</td>
                    <td className={styles.tdActions}>
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
    </div>
  );
}
