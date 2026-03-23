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
  Badge,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tooltip,
} from '@fluentui/react-components';
import { SignOutRegular, DeleteRegular, ShieldKeyholeRegular, LockClosedRegular, KeyRegular, PhoneRegular, DismissRegular, WarningRegular } from '@fluentui/react-icons';
import { listAdminUsers, deleteAdminUser, adminLogout, listAdminUserCredentials, revokeAdminUserCredential } from '../api';
import type { AdminUser, AdminCredential } from '../api';
import { formatDate } from '../utils';

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
  adminBadge: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
    padding: '2px 10px',
    borderRadius: '10px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
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
  tableCard: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '8px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  tableHeader: {
    padding: '16px 20px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  emptyState: {
    padding: '48px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  actionsCell: {
    whiteSpace: 'nowrap',
    minWidth: '200px',
  },
  credentialRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  credentialInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  credentialMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  confirmBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '12px',
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
  },
  confirmActions: {
    display: 'flex',
    gap: '8px',
  },
});

interface AdminDashboardProps {
  adminUsername: string;
  onLogout: () => void;
}

/** Returns a short display label for an authenticator based on its WebAuthn transports. */
function credentialTypeLabel(transports: string[]): string {
  if (transports.includes('internal')) return 'Platform authenticator';
  if (transports.includes('hybrid')) return 'Passkey (hybrid)';
  return 'Security key';
}

/** Returns the icon for an authenticator type. */
function credentialTypeIcon(transports: string[]): React.ReactElement {
  if (transports.includes('internal') || transports.includes('hybrid')) return <PhoneRegular fontSize={16} />;
  return <KeyRegular fontSize={16} />;
}

export default function AdminDashboard({ adminUsername, onLogout }: AdminDashboardProps) {
  const styles = useStyles();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Authenticators dialog state
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [credDialogUser, setCredDialogUser] = useState<AdminUser | null>(null);
  const [credDialogCredentials, setCredDialogCredentials] = useState<AdminCredential[]>([]);
  const [credDialogLoading, setCredDialogLoading] = useState(false);
  const [credDialogError, setCredDialogError] = useState('');
  // Revoke confirmation state (credentialId being confirmed, or null)
  const [pendingRevokeCredId, setPendingRevokeCredId] = useState<string | null>(null);
  const [revokingCredId, setRevokingCredId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAdminUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleLogout() {
    await adminLogout();
    onLogout();
  }

  async function handleDeleteUser(userId: string) {
    setDeletingId(userId);
    setDeleteError('');
    try {
      await deleteAdminUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleOpenCredentialDialog(user: AdminUser) {
    setCredDialogUser(user);
    setCredDialogCredentials([]);
    setCredDialogError('');
    setRevokeError('');
    setPendingRevokeCredId(null);
    setCredDialogLoading(true);
    setCredDialogOpen(true);
    try {
      const creds = await listAdminUserCredentials(user.id);
      setCredDialogCredentials(creds);
    } catch (err) {
      setCredDialogError(err instanceof Error ? err.message : 'Failed to load authenticators');
    } finally {
      setCredDialogLoading(false);
    }
  }

  function handleCloseCredentialDialog() {
    setCredDialogOpen(false);
    setCredDialogUser(null);
    setCredDialogCredentials([]);
    setCredDialogError('');
    setRevokeError('');
    setPendingRevokeCredId(null);
  }

  async function handleConfirmRevoke() {
    if (!credDialogUser || !pendingRevokeCredId) return;
    setRevokingCredId(pendingRevokeCredId);
    setRevokeError('');
    try {
      await revokeAdminUserCredential(credDialogUser.id, pendingRevokeCredId);
      setCredDialogCredentials((prev) => prev.filter((c) => c.credentialId !== pendingRevokeCredId));
      setPendingRevokeCredId(null);
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke authenticator');
    } finally {
      setRevokingCredId(null);
    }
  }

  const pendingRevokeCred = credDialogCredentials.find((c) => c.credentialId === pendingRevokeCredId);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <ShieldKeyholeRegular fontSize={24} color="var(--colorPaletteRedForeground2)" />
          <Title2>SecSelfStorage</Title2>
          <span className={styles.adminBadge}>Admin</span>
          <Text style={{ color: 'var(--colorNeutralForeground3)' }}>
            Signed in as <strong>{adminUsername}</strong>
          </Text>
        </div>
        <Button
          appearance="subtle"
          icon={<SignOutRegular />}
          onClick={() => void handleLogout()}
        >
          Sign out
        </Button>
      </header>

      <main className={styles.main}>
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {deleteError && (
          <MessageBar intent="error">
            <MessageBarBody>{deleteError}</MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <Title2 as="h2">Users</Title2>
            <Badge appearance="filled" color="informative">{users.length}</Badge>
            {loading && <Spinner size="tiny" />}
          </div>

          {loading && users.length === 0 ? (
            <div className={styles.emptyState}>
              <Spinner size="medium" label="Loading users..." />
            </div>
          ) : users.length === 0 ? (
            <div className={styles.emptyState}>
              <Text>No users found.</Text>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Username</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell>Last Login</TableHeaderCell>
                  <TableHeaderCell>E2E Encrypted</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <TableCellLayout>{user.username}</TableCellLayout>
                    </TableCell>
                    <TableCell>
                      <TableCellLayout>
                        <Text size={200}>{formatDate(user.createdAt)}</Text>
                      </TableCellLayout>
                    </TableCell>
                    <TableCell>
                      <TableCellLayout>
                        <Text size={200}>
                          {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                        </Text>
                      </TableCellLayout>
                    </TableCell>
                    <TableCell>
                      <TableCellLayout>
                        {user.lastLoginAt ? (
                          user.lastLoginE2e ? (
                            <Badge appearance="filled" color="success" icon={<LockClosedRegular />}>
                              Yes
                            </Badge>
                          ) : (
                            <Badge appearance="outline" color="subtle">
                              No
                            </Badge>
                          )
                        ) : (
                          <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>—</Text>
                        )}
                      </TableCellLayout>
                    </TableCell>
                    <TableCell className={styles.actionsCell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Authenticators dialog trigger */}
                        <Button
                          appearance="subtle"
                          icon={<KeyRegular />}
                          size="small"
                          onClick={() => void handleOpenCredentialDialog(user)}
                        >
                          Authenticators
                        </Button>

                        {/* Delete user dialog */}
                        <Dialog>
                          <DialogTrigger disableButtonEnhancement>
                            <Button
                              appearance="subtle"
                              icon={<DeleteRegular />}
                              size="small"
                              disabled={deletingId === user.id}
                              style={{ color: 'var(--colorPaletteRedForeground2)' }}
                            >
                              {deletingId === user.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </DialogTrigger>
                          <DialogSurface>
                            <DialogBody>
                              <DialogTitle>Delete user "{user.username}"?</DialogTitle>
                              <DialogContent>
                                This will permanently delete the user and all their files and credentials.
                                This action cannot be undone.
                              </DialogContent>
                              <DialogActions>
                                <DialogTrigger disableButtonEnhancement>
                                  <Button appearance="secondary">Cancel</Button>
                                </DialogTrigger>
                                <Button
                                  appearance="primary"
                                  style={{ backgroundColor: 'var(--colorPaletteRedBackground3)' }}
                                  onClick={() => void handleDeleteUser(user.id)}
                                >
                                  Delete
                                </Button>
                              </DialogActions>
                            </DialogBody>
                          </DialogSurface>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      {/* Authenticators modal dialog */}
      <Dialog
        open={credDialogOpen}
        onOpenChange={(_, data) => {
          if (!data.open) handleCloseCredentialDialog();
        }}
      >
        <DialogSurface style={{ maxWidth: '480px', width: '100%' }}>
          <DialogBody>
            <DialogTitle
              action={
                <Button
                  appearance="subtle"
                  aria-label="Close"
                  icon={<DismissRegular />}
                  onClick={handleCloseCredentialDialog}
                />
              }
            >
              Authenticators{credDialogUser ? ` — ${credDialogUser.username}` : ''}
            </DialogTitle>

            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {credDialogLoading && <Spinner size="small" label="Loading authenticators..." />}

                {credDialogError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{credDialogError}</MessageBarBody>
                  </MessageBar>
                )}

                {revokeError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{revokeError}</MessageBarBody>
                  </MessageBar>
                )}

                {!credDialogLoading && credDialogCredentials.length === 0 && !credDialogError && (
                  <Text style={{ color: 'var(--colorNeutralForeground3)' }}>No authenticators found.</Text>
                )}

                {credDialogCredentials.map((cred) => {
                  const isOnlyOne = credDialogCredentials.length === 1;
                  const isRevoking = revokingCredId === cred.credentialId;
                  const isPendingRevoke = pendingRevokeCredId === cred.credentialId;

                  return (
                    <div key={cred.credentialId}>
                      <div className={styles.credentialRow}>
                        <div className={styles.credentialInfo}>
                          {credentialTypeIcon(cred.transports)}
                          <div className={styles.credentialMeta}>
                            <Text size={300} weight="semibold">{credentialTypeLabel(cred.transports)}</Text>
                            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
                              Added {formatDate(cred.createdAt)}
                            </Text>
                          </div>
                        </div>

                        {isOnlyOne ? (
                          <Tooltip
                            content="Cannot revoke the last authenticator — delete the user instead"
                            relationship="label"
                          >
                            <Button appearance="subtle" size="small" disabled>
                              Revoke
                            </Button>
                          </Tooltip>
                        ) : (
                          <Button
                            appearance="subtle"
                            size="small"
                            disabled={isRevoking || !!pendingRevokeCredId}
                            style={{ color: 'var(--colorPaletteRedForeground2)' }}
                            onClick={() => setPendingRevokeCredId(cred.credentialId)}
                          >
                            {isRevoking ? 'Revoking...' : 'Revoke'}
                          </Button>
                        )}
                      </div>

                      {/* Inline revoke confirmation */}
                      {isPendingRevoke && pendingRevokeCred && (
                        <div className={styles.confirmBox}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <WarningRegular style={{ color: 'var(--colorPaletteRedForeground2)', flexShrink: 0 }} />
                            <Text size={200}>
                              Revoke the <strong>{credentialTypeLabel(pendingRevokeCred.transports)}</strong> added on{' '}
                              {formatDate(pendingRevokeCred.createdAt)}? The user will no longer be able to sign in with it.
                            </Text>
                          </div>
                          <div className={styles.confirmActions}>
                            <Button
                              appearance="primary"
                              size="small"
                              style={{ backgroundColor: 'var(--colorPaletteRedBackground3)' }}
                              disabled={isRevoking}
                              icon={isRevoking ? <Spinner size="tiny" /> : undefined}
                              onClick={() => void handleConfirmRevoke()}
                            >
                              {isRevoking ? 'Revoking...' : 'Confirm revoke'}
                            </Button>
                            <Button
                              appearance="secondary"
                              size="small"
                              disabled={isRevoking}
                              onClick={() => setPendingRevokeCredId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DialogContent>

            <DialogActions>
              <Button appearance="secondary" onClick={handleCloseCredentialDialog}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
