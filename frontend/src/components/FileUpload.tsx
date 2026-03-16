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
    <div style={{ padding: '24px' }}>
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? '#1F4E79' : '#aaa'}`,
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          background: isDragActive ? '#e8f0fe' : '#fafafa',
          transition: 'all 0.2s',
        }}
      >
        <input {...getInputProps()} />
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
        {uploading ? (
          <p style={{ color: '#1F4E79', fontSize: '16px' }}>Subiendo y procesando... ⏳</p>
        ) : isDragActive ? (
          <p style={{ color: '#1F4E79', fontSize: '16px' }}>Suelta el archivo aquí</p>
        ) : (
          <>
            <p style={{ color: '#555', fontSize: '16px', margin: '0 0 8px' }}>
              <strong>Arrastra un albarán</strong> o haz clic para seleccionar
            </p>
            <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
              PDF, JPG o PNG — máximo 20 MB
            </p>
          </>
        )}
      </div>
      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 16px',
          background: '#fff0f0',
          border: '1px solid #ffcccc',
          borderRadius: '8px',
          color: '#cc0000',
          fontSize: '14px',
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
