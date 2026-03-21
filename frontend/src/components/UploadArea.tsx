import React, { useCallback, useRef, useState } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { CloudArrowUpRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  dropzone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
    backgroundColor: tokens.colorNeutralBackground1,
    userSelect: 'none',
  },
  dropzoneActive: {
    border: `2px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  icon: {
    fontSize: '40px',
    color: tokens.colorBrandForeground1,
  },
  hiddenInput: {
    display: 'none',
  },
});

interface UploadAreaProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function UploadArea({ onFilesSelected, disabled }: UploadAreaProps) {
  const styles = useStyles();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFilesSelected(Array.from(files));
    },
    [onFilesSelected],
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }

  function handleClick() {
    if (!disabled) inputRef.current?.click();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload files area. Click or drag files here."
    >
      <CloudArrowUpRegular className={styles.icon} fontSize={40} />
      <Text weight="semibold">
        {dragOver ? 'Drop files here' : 'Drag files here or click to browse'}
      </Text>
      <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
        Any file type accepted
      </Text>
      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
