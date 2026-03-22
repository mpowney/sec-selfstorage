import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { subscribeToLogs, LogEntry } from '../logger';

const useStyles = makeStyles({
  textarea: {
    width: '100%',
    height: '400px',
    fontFamily: 'monospace',
    fontSize: '11px',
    resize: 'vertical',
    boxSizing: 'border-box',
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '8px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  surface: {
    maxWidth: '90vw',
    width: '720px',
  },
});

/**
 * Safely serialize arbitrary log data (including ArrayBuffers) to a human-readable string.
 */
function formatData(data: unknown): string {
  if (data === undefined) return '';
  try {
    return JSON.stringify(
      data,
      (_key, value: unknown) => {
        if (value instanceof ArrayBuffer) {
          const bytes = new Uint8Array(value);
          const hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          return `[ArrayBuffer(${bytes.length}) 0x${hex}]`;
        }
        if (ArrayBuffer.isView(value)) {
          const bytes = new Uint8Array(
            (value as ArrayBufferView).buffer,
            (value as ArrayBufferView).byteOffset,
            (value as ArrayBufferView).byteLength,
          );
          const hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          return `[${(value as object).constructor.name}(${bytes.length}) 0x${hex}]`;
        }
        return value;
      },
      2,
    );
  } catch {
    return String(data);
  }
}

function formatEntry(entry: LogEntry): string {
  const time = entry.timestamp.toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const dataPart = entry.data !== undefined ? '\n  ' + formatData(entry.data).replace(/\n/g, '\n  ') : '';
  return `[${time}] ${level} [${entry.source}] ${entry.message}${dataPart}`;
}

interface DebugScreenProps {
  open: boolean;
  onClose: () => void;
}

export default function DebugScreen({ open, onClose }: DebugScreenProps) {
  const styles = useStyles();
  const [logLines, setLogLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to global log bus for the lifetime of this component.
  useEffect(() => {
    const unsubscribe = subscribeToLogs((entry) => {
      setLogLines((prev) => [...prev, formatEntry(entry)]);
    });
    return unsubscribe;
  }, []);

  // Auto-scroll to the bottom whenever new lines arrive and the panel is open.
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [logLines, open]);

  const text = logLines.join('\n');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select all text in the textarea so the user can copy manually.
      textareaRef.current?.select();
    }
  }

  function handleClear() {
    setLogLines([]);
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Debug Log</DialogTitle>
          <DialogContent>
            <textarea
              ref={textareaRef}
              readOnly
              value={text}
              className={styles.textarea}
              placeholder="No log entries yet. Perform a sign-in or registration to see output."
              spellCheck={false}
            />
          </DialogContent>
          <DialogActions className={styles.actions}>
            <Button onClick={handleClear} appearance="subtle">
              Clear
            </Button>
            <Button onClick={handleCopy}>
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </Button>
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
