const { detectIdentifierType } = require('../services/resolverUtils.cjs');

const testIds = [
    { id: '550e8400-e29b-41d4-a716-446655440000', expected: 'internalId' },
    { id: 'INV-0001', expected: 'logicalNumber' },
    { id: 'PO-12345', expected: 'logicalNumber' },
    { id: 'invalid-id', expected: 'unknown' },
    { id: '', expected: 'unknown' },
    { id: null, expected: 'unknown' }
];

console.log('--- Verifying Identifier Detection ---');
testIds.forEach(test => {
    const result = detectIdentifierType(test.id);
    const passed = result === test.expected;
    console.log(`ID: ${test.id} => Result: ${result} [${passed ? 'PASS' : 'FAIL'}]`);
});

console.log('\n--- Verifying Regex Patterns ---');
const { UUID_REGEX, LOGICAL_NUMBER_REGEX } = require('../services/resolverUtils.cjs');
console.log('UUID_REGEX test:', UUID_REGEX.test('550e8400-e29b-41d4-a716-446655440000'));
console.log('LOGICAL_NUMBER_REGEX test (INV-0001):', LOGICAL_NUMBER_REGEX.test('INV-0001'));
console.log('LOGICAL_NUMBER_REGEX test (PO-123):', LOGICAL_NUMBER_REGEX.test('PO-123'));
