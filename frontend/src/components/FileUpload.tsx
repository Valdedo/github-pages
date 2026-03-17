import { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadDocument } from '../api/client';
import type { Document } from '../types';

interface Props {
  onUploaded: (doc: Document) => void;
}

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export function FileUpload({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { data } = await uploadDocument(file);
      onUploaded(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Error al subir el archivo';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }, [onUploaded]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    processFile(acceptedFiles[0]);
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
    disabled: uploading,
  });

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Camera button — only visible on mobile via CSS */}
      <div className="camera-capture-btn">
        <button
          className="btn-camera"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
          type="button"
        >
          📷 Fotografiar albarán
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleCameraCapture}
        />
      </div>

      {/* Drop zone — works for all devices */}
      <div
        {...getRootProps()}
        className={`upload-zone${isDragActive ? ' active' : ''}${uploading ? ' uploading' : ''}`}
      >
        <input {...getInputProps()} />
        <div style={{ fontSize: '40px', marginBottom: '14px', lineHeight: 1 }}>
          {uploading ? '⏳' : isDragActive ? '📂' : '📄'}
        </div>
        {uploading ? (
          <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '15px' }}>
            Subiendo y procesando...
          </p>
        ) : isDragActive ? (
          <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '15px' }}>
            Suelta el archivo aquí
          </p>
        ) : (
          <>
            <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--grey-700)', marginBottom: '6px' }}>
              Arrastra un albarán o toca para seleccionar
            </p>
            <p style={{ color: 'var(--grey-500)', fontSize: '13px' }}>
              PDF, JPG o PNG — máximo 20 MB
            </p>
          </>
        )}
      </div>

      {error && (
        <div style={{
          padding: '10px 16px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: 'var(--danger)',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
