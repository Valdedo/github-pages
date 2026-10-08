import { useCallback, useRef, useState } from 'react';
import { Camera, Images, UploadCloud } from 'lucide-react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { uploadDocument, uploadMultiImages } from '../api/client';
import type { Document } from '../types';

interface Props {
  onUploaded: (doc: Document) => void;
  /** Cuando se suben varios albaranes de golpe (varios PDF): se llama con todos los que se subieron. */
  onUploadedMany?: (docs: Document[], fallidos: string[]) => void;
}

const errorSubida = (e: unknown, porDefecto: string) => {
  const status = (e as { response?: { status?: number } })?.response?.status;
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  const det = typeof detail === 'string' ? detail : null;
  if (status === 413) return 'El archivo es demasiado grande para el servidor. Máximo 20 MB.';
  if (status === 409) return det || 'Ya hay una extracción en curso para este documento.';
  if ((e as { code?: string })?.code === 'ERR_NETWORK') return 'Sin conexión con el servidor. Esto necesita cobertura.';
  return det || porDefecto;
};

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg']);

/** Compress an image file using canvas. Skips if already small or is a PDF. */
async function compressImage(file: File, maxSizeMB = 3): Promise<File> {
  if (!IMAGE_TYPES.has(file.type) || file.size <= maxSizeMB * 1024 * 1024) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Scale down so largest dimension ≤ 2400px (sufficient for OCR)
      const MAX_DIM = 2400;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        },
        'image/jpeg',
        0.88, // quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function FileUpload({ onUploaded, onUploadedMany }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadStatus('Preparando archivo...');
    try {
      const compressed = await compressImage(file);
      if (compressed !== file) setUploadStatus('Imagen comprimida — subiendo...');
      else setUploadStatus('Subiendo y procesando...');
      const { data } = await uploadDocument(compressed);
      onUploaded(data);
    } catch (e: unknown) {
      setError(errorSubida(e, 'Error al subir el archivo. Comprueba tu conexión e inténtalo de nuevo.'));
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }, [onUploaded]);

  const processMultipleImages = useCallback(async (files: File[]) => {
    setUploading(true);
    setError(null);
    setUploadStatus(`Comprimiendo ${files.length} imágenes...`);
    try {
      const compressed = await Promise.all(files.map(f => compressImage(f)));
      setUploadStatus(`Subiendo ${compressed.length} páginas...`);
      const { data } = await uploadMultiImages(compressed);
      onUploaded(data);
    } catch (e: unknown) {
      setError(errorSubida(e, 'Error al subir las imágenes. Comprueba tu conexión e inténtalo de nuevo.'));
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }, [onUploaded]);

  /**
   * Varios archivos con algún PDF: cada PDF es un albarán distinto (se suben uno detrás de otro)
   * y, si además hay fotos, todas las fotos juntas forman otro albarán.
   */
  const processVarios = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => !IMAGE_TYPES.has(f.type));
    const fotos = files.filter(f => IMAGE_TYPES.has(f.type));
    const total = pdfs.length + (fotos.length ? 1 : 0);
    setUploading(true);
    setError(null);
    const subidos: Document[] = [];
    const fallidos: string[] = [];
    let n = 0;
    for (const f of pdfs) {
      n++;
      setUploadStatus(`Subiendo albarán ${n} de ${total}…`);
      try { subidos.push((await uploadDocument(f)).data); }
      catch (e) { fallidos.push(`${f.name}: ${errorSubida(e, 'no se pudo subir')}`); }
    }
    if (fotos.length) {
      n++;
      setUploadStatus(`Subiendo albarán ${n} de ${total} (${fotos.length} foto${fotos.length > 1 ? 's' : ''})…`);
      try {
        const comp = await Promise.all(fotos.map(f => compressImage(f)));
        subidos.push((comp.length > 1 ? await uploadMultiImages(comp) : await uploadDocument(comp[0])).data);
      } catch (e) { fallidos.push(`Fotos: ${errorSubida(e, 'no se pudieron subir')}`); }
    }
    setUploading(false);
    setUploadStatus(null);
    if (fallidos.length) {
      setError(`Se ${subidos.length === 1 ? 'subió 1 albarán' : `subieron ${subidos.length} albaranes`} de ${total}. No se pudo subir: ${fallidos.join(' · ')}`);
    }
    if (subidos.length === 0) return;
    if (onUploadedMany) onUploadedMany(subidos, fallidos);
    else if (!fallidos.length) onUploaded(subidos[subidos.length - 1]);
  }, [onUploaded, onUploadedMany]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const allImages = acceptedFiles.every(f => IMAGE_TYPES.has(f.type));
    if (acceptedFiles.length === 1) processFile(acceptedFiles[0]);
    else if (allImages) processMultipleImages(acceptedFiles);
    else processVarios(acceptedFiles);
  }, [processFile, processMultipleImages, processVarios]);

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const codes = rejections.flatMap(r => r.errors.map(e => e.code));
    if (codes.includes('file-too-large')) {
      setError('El archivo es demasiado grande. El tamaño máximo es 20 MB.');
    } else if (codes.includes('file-invalid-type')) {
      setError('Tipo de archivo no admitido. Solo se aceptan PDF, JPG o PNG.');
    } else if (codes.includes('too-many-files')) {
      setError('Demasiados archivos. Puedes elegir como mucho 10 a la vez.');
    } else {
      setError('No se pudo procesar el archivo seleccionado.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
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
          <Camera size={19} /> Hacer foto
        </button>
        <button
          className="btn-camera"
          disabled={uploading}
          onClick={() => galleryInputRef.current?.click()}
          type="button"
          style={{ flex: 1 }}
          title="Selecciona varias fotos para albaranes de más de una página"
        >
          <Images size={19} /> Elegir fotos
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
        <div style={{ marginBottom: '12px', color: 'var(--cf-bosque)', display: 'flex', justifyContent: 'center' }}>
          {uploading ? <span className="spinner spinner-lg" /> : <UploadCloud size={40} strokeWidth={1.6} />}
        </div>
        {uploading ? (
          <p style={{ color: 'var(--cf-bosque)', fontWeight: 600, fontSize: '15px' }}>
            {uploadStatus || 'Subiendo y procesando...'}
          </p>
        ) : isDragActive ? (
          <p style={{ color: 'var(--cf-bosque)', fontWeight: 600, fontSize: '15px' }}>
            Suelta el archivo aquí
          </p>
        ) : (
          <>
            <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-1)', marginBottom: '6px' }}>
              Arrastra aquí el albarán o pulsa para elegirlo
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>
              PDF o fotos (JPG, PNG). Si el albarán tiene varias hojas, elige todas las fotos a la vez. Varios PDF a la vez se suben como albaranes distintos.
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="doc-aviso error" style={{ marginBottom: 0 }}>{error}</div>
      )}
    </div>
  );
}
