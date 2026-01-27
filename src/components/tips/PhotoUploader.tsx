'use client';

import { useState, useRef, useCallback } from 'react';

interface UploadedPhoto {
  url: string;
  path: string;
  filename: string;
  size: number;
  type: string;
  preview?: string;
}

interface PhotoUploaderProps {
  photos: UploadedPhoto[];
  onPhotosChange: (photos: UploadedPhoto[]) => void;
  maxPhotos?: number;
  maxSizeMB?: number;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export default function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  maxSizeMB = 10,
}: PhotoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Allowed: JPEG, PNG, WebP, HEIC';
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File too large. Maximum size is ${maxSizeMB}MB`;
    }
    return null;
  };

  const uploadFile = async (file: File): Promise<UploadedPhoto | null> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/tips/upload-photo', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();

      // Create preview URL
      const preview = URL.createObjectURL(file);

      return {
        url: data.url,
        path: data.path,
        filename: data.filename || file.name,
        size: data.size || file.size,
        type: data.type || file.type,
        preview,
      };
    } catch (err) {
      console.error('Upload error:', err);
      throw err;
    }
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);

    const fileArray = Array.from(files);
    const remainingSlots = maxPhotos - photos.length;

    if (fileArray.length > remainingSlots) {
      setError(`You can only add ${remainingSlots} more photo${remainingSlots === 1 ? '' : 's'}`);
      return;
    }

    // Validate all files first
    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setUploading(true);

    try {
      const uploadedPhotos: UploadedPhoto[] = [];

      for (const file of fileArray) {
        const uploaded = await uploadFile(file);
        if (uploaded) {
          uploadedPhotos.push(uploaded);
        }
      }

      onPhotosChange([...photos, ...uploadedPhotos]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  }, [photos, maxPhotos, onPhotosChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  const removePhoto = useCallback((index: number) => {
    const newPhotos = [...photos];
    const removed = newPhotos.splice(index, 1)[0];

    // Revoke preview URL to prevent memory leak
    if (removed.preview) {
      URL.revokeObjectURL(removed.preview);
    }

    onPhotosChange(newPhotos);
  }, [photos, onPhotosChange]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const canAddMore = photos.length < maxPhotos;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {canAddMore && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFileDialog}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-colors
            ${isDragging
              ? 'border-black bg-neutral-50'
              : 'border-neutral-300 hover:border-neutral-400'
            }
            ${uploading ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>

            {uploading ? (
              <p className="text-sm text-neutral-600">Uploading...</p>
            ) : (
              <>
                <p className="text-sm text-neutral-600">
                  <span className="font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-neutral-500">
                  JPEG, PNG, WebP, or HEIC up to {maxSizeMB}MB
                </p>
                <p className="text-xs text-neutral-500">
                  {photos.length} of {maxPhotos} photos added
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Photo previews */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <div key={photo.url} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden bg-neutral-100">
                <img
                  src={photo.preview || photo.url}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="
                  absolute -top-2 -right-2 w-6 h-6
                  bg-black text-white rounded-full
                  flex items-center justify-center
                  opacity-0 group-hover:opacity-100
                  transition-opacity
                  hover:bg-neutral-800
                "
                aria-label="Remove photo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* File info */}
              <p className="text-xs text-neutral-500 mt-1 truncate">
                {photo.filename}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
