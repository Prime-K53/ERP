/**
 * Document Resolver Utilities
 * Provides logic for identifying and resolving document identifiers (UUID vs Logical Number).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGICAL_NUMBER_REGEX = /^[A-Z0-9]+-[0-9A-Z]+$/; // e.g., INV-0001, PO-123, EXAM-B1

/**
 * Detects if the given identifier is an internal UUID or a logical number.
 * @param {string} id 
 * @returns {'internalId' | 'logicalNumber' | 'unknown'}
 */
function detectIdentifierType(id) {
    if (!id || typeof id !== 'string') return 'unknown';
    if (UUID_REGEX.test(id)) return 'internalId';
    if (LOGICAL_NUMBER_REGEX.test(id)) return 'logicalNumber';
    return 'unknown';
}

/**
 * Structured error for resolution failures.
 */
class ResolutionError extends Error {
    constructor(message, identifier, type, diagnostic, code = 'NOT_FOUND') {
        super(message);
        this.name = 'ResolutionError';
        this.identifier = identifier;
        this.type = type;
        this.diagnostic = diagnostic;
        this.code = code;
    }
}

module.exports = {
    detectIdentifierType,
    ResolutionError,
    UUID_REGEX,
    LOGICAL_NUMBER_REGEX
};
