const { db, initDb } = require('../db.cjs');
const docService = require('../services/documentService.cjs');

async function runTests() {
    console.log('--- STARTING CONTEXT-AWARE RESOLVER TESTS ---');
    await initDb();
    
    // Seed test data with real-looking UUIDs and Logical Numbers
    const testDocs = [
        { id: '12345678-1234-1234-1234-123456789012', logical: 'INV-1001', status: 'draft', type: 'invoice' },
        { id: '22345678-2234-2234-2234-223456789012', logical: 'INV-1002', status: 'finalized', type: 'invoice' },
        { id: '32345678-3234-3234-3234-323456789012', logical: 'INV-1003', status: 'voided', type: 'invoice' }
    ];

    for (const doc of testDocs) {
        await new Promise((resolve) => {
            db.run("DELETE FROM documents WHERE id = ?", [doc.id], () => {
                db.run(
                    "INSERT INTO documents (id, logical_number, status, type, payload) VALUES (?, ?, ?, ?, ?)",
                    [doc.id, doc.logical, doc.status, doc.type, JSON.stringify({ test: true })],
                    () => resolve()
                );
            });
        });
    }

    const testCases = [
        // Internal ID Rules
        { name: 'Internal ID -> DRAFT (general)', id: testDocs[0].id, purpose: 'general', expected: 'success' },
        { name: 'Internal ID -> FINAL (general)', id: testDocs[1].id, purpose: 'general', expected: 'success' },
        { name: 'Internal ID -> VOID (general)', id: testDocs[2].id, purpose: 'general', expected: 'error', errorCode: 'ACCESS_DENIED' },
        
        // Logical Number Rules
        { name: 'Logical -> FINAL (general)', id: testDocs[1].logical, purpose: 'general', expected: 'success' },
        { name: 'Logical -> DRAFT (general)', id: testDocs[0].logical, purpose: 'general', expected: 'error', errorCode: 'CONTEXT_REQUIRED' },
        { name: 'Logical -> DRAFT (preview)', id: testDocs[0].logical, purpose: 'preview', expected: 'success' },
        { name: 'Logical -> VOID (preview)', id: testDocs[2].logical, purpose: 'preview', expected: 'error', errorCode: 'ACCESS_DENIED' }
    ];

    for (const test of testCases) {
        try {
            const result = await docService.resolveDocument(test.id, { purpose: test.purpose });
            if (test.expected === 'success' && result) {
                console.log(`[PASS] ${test.name}`);
            } else {
                console.log(`[FAIL] ${test.name}: Expected ${test.expected}, got ${result ? 'success' : 'null'}`);
            }
        } catch (e) {
            if (test.expected === 'error' && e.code === test.errorCode) {
                console.log(`[PASS] ${test.name} (Caught expected error: ${e.code})`);
            } else {
                console.log(`[FAIL] ${test.name}: Unexpected error ${e.code || e.message}`);
            }
        }
    }

    // Watermark Test
    console.log('\n--- VERIFYING WATERMARK POLICY ---');
    try {
        // Mock internal methods needed for getPreview
        docService.getBlueprintForType = async () => ({ 
            fixedSections: [], 
            flowSections: [],
            elements: [] 
        });
        docService.validatePayloadBindings = () => ({ isValid: true });

        // Mock layoutEngine.calculate and generate if they are called
        docService.layoutEngine.calculate = (p, b) => b;
        docService.layoutEngine.generate = (b) => ({ pages: [], security: {} });

        const draftPreview = await docService.getPreview(testDocs[0].id, { purpose: 'preview' });
        if (draftPreview.security?.watermark?.text === 'DRAFT') {
            console.log('[PASS] Watermark applied to DRAFT preview');
        } else {
            console.log(`[FAIL] Watermark missing from DRAFT preview. Found: ${JSON.stringify(draftPreview.security?.watermark)}`);
        }

        const finalPreview = await docService.getPreview(testDocs[1].id, { purpose: 'preview' });
        if (!finalPreview.security?.watermark) {
            console.log('[PASS] No watermark applied to FINAL preview');
        } else {
            console.log('[FAIL] Unexpected watermark on FINAL preview');
        }
    } catch (e) {
        console.log(`[ERROR] Watermark test failed: ${e.message}`);
        console.error(e.stack);
    }

    process.exit(0);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});