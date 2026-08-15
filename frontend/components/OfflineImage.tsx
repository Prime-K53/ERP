
import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger';
import { Package, Image as ImageIcon } from 'lucide-react';
import { localFileStorage } from '../services/localFileStorage';
import { isStoredFileIdentifier } from '../utils/documentPreview';

interface OfflineImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}

export const OfflineImage: React.FC<OfflineImageProps> = ({ src, alt, className, style, fallback }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHasError(false); // Reset error state when src changes
    
    const load = async () => {
      if (!src) {
        if (isMounted) setImgUrl(null);
        return;
      }
      
      try {
        // If it looks like a File ID (our convention FILE-...), try to resolve from IDB
        if (isStoredFileIdentifier(src)) {
          const url = await localFileStorage.getUrl(src);
          if (isMounted) {
             if (url) {
                 setImgUrl(url);
             } else {
                 // File ID found but blob missing/null
                 setHasError(true);
             }
          }
        } else {
          // Otherwise assume it's a legacy URL or base64
          if (isMounted) setImgUrl(src);
        }
      } catch (err) {
        logger.error("Error loading image:", err);
        if (isMounted) setHasError(true);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [src]);

  if (!imgUrl || hasError) {
    return (
      <>{fallback || (
        <div className={`bg-slate-100 flex items-center justify-center text-slate-300 ${className}`} style={style}>
          <ImageIcon size={16} />
        </div>
      )}</>
    );
  }

  return <img src={imgUrl} alt={alt} className={className} style={style} onError={() => setHasError(true)} />;
};
