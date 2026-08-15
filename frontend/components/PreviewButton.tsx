import React from 'react';
import { Eye } from 'lucide-react';

interface PreviewButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  documentId?: string;
  documentType?: string;
  payload?: any;
  onPreviewReady?: (model: any) => void;
  title?: string;
}

export default function PreviewButton({ 
  onClick, 
  disabled = false, 
  className = '', 
  size = 'sm',
  documentId,
  documentType,
  payload,
  onPreviewReady,
  title = 'Preview'
}: PreviewButtonProps) {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  const handleClick = () => {
    if (onPreviewReady && payload) {
      onPreviewReady(payload);
    }
    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors ${sizeClasses[size]} ${className}`}
      title={title}
    >
      <Eye size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
    </button>
  );
}
