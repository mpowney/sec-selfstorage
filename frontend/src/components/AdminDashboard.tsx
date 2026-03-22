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
} from '@fluentui/react-components';
import { SignOutRegular, DeleteRegular, ShieldKeyholeRegular, LockClosedRegular } from '@fluentui/react-icons';
import { listAdminUsers, deleteAdminUser, adminLogout } from '../api';
import type { AdminUser } from '../api';
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
});

interface AdminDashboardProps {
  adminUsername: string;
  onLogout: () => void;
}

export default function AdminDashboard({ adminUsername, onLogout }: AdminDashboardProps) {
  const styles = useStyles();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

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
                  <TableHeaderCell>Display Name</TableHeaderCell>
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
                      <TableCellLayout>{user.displayName}</TableCellLayout>
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
                    <TableCell>
                      <Dialog>
                        <DialogTrigger disableButtonEnhancement>
                          <Button
                            appearance="subtle"
                            icon={<DeleteRegular />}
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
