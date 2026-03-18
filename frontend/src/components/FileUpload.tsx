import { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadDocument, uploadMultiImages } from '../api/client';
import type { Document } from '../types';

interface Props {
  onUploaded: (doc: Document) => void;
}

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg']);

export function FileUpload({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadStatus('Subiendo y procesando...');
    try {
      const { data } = await uploadDocument(file);
      onUploaded(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Error al subir el archivo';
      setError(msg);
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }, [onUploaded]);

  const processMultipleImages = useCallback(async (files: File[]) => {
    setUploading(true);
    setError(null);
    setUploadStatus(`Subiendo ${files.length} páginas...`);
    try {
      const { data } = await uploadMultiImages(files);
      onUploaded(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Error al subir las imágenes';
      setError(msg);
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }, [onUploaded]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const allImages = acceptedFiles.every(f => IMAGE_TYPES.has(f.type));
    if (acceptedFiles.length > 1 && allImages) {
      processMultipleImages(acceptedFiles);
    } else {
      processFile(acceptedFiles[0]);
    }
  }, [processFile, processMultipleImages]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 10,
    maxSize: 20 * 1024 * 1024,
    disabled: uploading,
  });

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (files.length === 1) {
      processFile(files[0]);
    } else {
      processMultipleImages(files);
    }
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Mobile buttons */}
      <div className="camera-capture-btn" style={{ display: 'flex', gap: '8px' }}>
        <button
          className="btn-camera"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
          type="button"
          style={{ flex: 1 }}
        >
          📷 Fotografiar
        </button>
        <button
          className="btn-camera"
          disabled={uploading}
          onClick={() => galleryInputRef.current?.click()}
          type="button"
          style={{ flex: 1 }}
          title="Selecciona varias fotos para albaranes de más de una página"
        >
          🖼️ Galería (multi-página)
        </button>

        {/* Single capture — camera */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleCameraCapture}
        />
        {/* Multi-select from gallery */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleGallerySelect}
        />
      </div>

      {/* Drop zone */}
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
            {uploadStatus || 'Subiendo y procesando...'}
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
              PDF, JPG o PNG — máx. 20 MB por archivo — puedes seleccionar varias imágenes a la vez
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
