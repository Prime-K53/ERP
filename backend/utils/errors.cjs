/**
 * Shared error response utilities for Prime ERP API.
 * Ensures consistent, safe error responses that never leak internal details.
 */

const safeMessage = (code) => {
  const messages = {
    'INTERNAL_ERROR': 'An unexpected error occurred. Please try again later.',
    'NOT_FOUND': 'The requested resource was not found.',
    'VALIDATION_ERROR': 'The provided data is invalid.',
    'UNAUTHORIZED': 'Authentication is required.',
    'FORBIDDEN': 'You do not have permission to perform this action.',
    'CONFLICT': 'The request conflicts with the current state.',
    'RATE_LIMITED': 'Too many requests. Please try again later.',
    'CREATE_FAILED': 'Failed to create the resource.',
    'UPDATE_FAILED': 'Failed to update the resource.',
    'DELETE_FAILED': 'Failed to delete the resource.',
  };
  return messages[code] || messages['INTERNAL_ERROR'];
};

const sendSafeError = (res, statusCode, code = 'INTERNAL_ERROR') => {
  return res.status(statusCode).json({
    error: safeMessage(code),
    code
  });
};

const sendSafeErrorWithMessage = (res, statusCode, message, code = 'INTERNAL_ERROR') => {
  return res.status(statusCode).json({
    error: message,
    code
  });
};

module.exports = {
  sendSafeError,
  sendSafeErrorWithMessage
};
