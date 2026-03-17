import { useCallback, useState } from 'react';
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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
    disabled: uploading,
  });

  return (
    <div>
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
              Arrastra un albarán o haz clic para seleccionar
            </p>
            <p style={{ color: 'var(--grey-500)', fontSize: '13px' }}>
              PDF, JPG o PNG — máximo 20 MB
            </p>
          </>
        )}
      </div>
      {error && (
        <div style={{
          marginTop: '12px',
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
