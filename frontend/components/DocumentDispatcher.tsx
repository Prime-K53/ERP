import React from 'react';
import MasterDocument from './MasterDocument';
import { mapErpDataToDocument, DocumentType, DocumentRenderOptions } from '../utils/documentMapper';

interface DocumentDispatcherProps {
  type: DocumentType;
  data: any;
  renderOptions?: DocumentRenderOptions;
}

/**
 * DocumentDispatcher Utility Component
 * The "Brain" of the document system.
 * Dynamically resolves the document type and returns a fully constructed 
 * MasterDocument shell with the correct specialized components.
 */
const DocumentDispatcher: React.FC<DocumentDispatcherProps> = ({ type, data, renderOptions }) => {
  // Use the mapping utility to transform raw ERP data into MasterDocument props
  const documentProps = mapErpDataToDocument(type, data, renderOptions);

  return (
    <MasterDocument
      title={documentProps.title}
      header={documentProps.header}
      content={documentProps.content}
      footer={documentProps.footer}
      watermark={documentProps.watermark}
      companyLogo={documentProps.companyLogo}
      companyAddress={documentProps.companyAddress}
      companyName={documentProps.companyName}
      logoPosition={documentProps.logoPosition}
    />
  );
};

export default DocumentDispatcher;
