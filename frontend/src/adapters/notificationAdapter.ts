import examinationNotificationService from '../../services/examinationNotificationService';

export const sendBatchCreatedNotification = async (
  batchData: any,
  userId?: string
) => {
  return examinationNotificationService.createBatchNotification(
    String(batchData?.id || ''),
    'BATCH_CREATED',
    batchData,
    userId
  );
};

export const sendBatchCalculatedNotification = async (
  batchData: any,
  userId?: string
) => {
  return examinationNotificationService.createBatchNotification(
    String(batchData?.id || ''),
    'BATCH_CALCULATED',
    batchData,
    userId
  );
};

export const sendBatchApprovedNotification = async (
  batchData: any,
  userId?: string
) => {
  return examinationNotificationService.createBatchNotification(
    String(batchData?.id || ''),
    'BATCH_APPROVED',
    batchData,
    userId
  );
};
