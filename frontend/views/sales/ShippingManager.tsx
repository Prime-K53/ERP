import React, { useState, useMemo, useRef, useEffect } from 'react';
import { logger } from '@/services/logger';
import { 
  Truck, Package, MapPin, Search, 
  Download, Box, 
  CheckCircle, 
  Info, X, Trash2, ShieldCheck, MessageSquare, Navigation, CheckSquare, 
  Eye, UserPlus, Car, Upload, FileSearch, Globe
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useSales } from '../../context/SalesContext';
import { Shipment, DeliveryNote, Employee, SignatureInputMode } from '../../types';
import { format } from 'date-fns';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import type { PrimeDocData } from '../shared/components/PDF/schemas';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { transactionService } from '../../services/transactionService';
import { normalizeSignatureDataUrl, validateSignatureUploadFile } from '../../utils/signatureUtils';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';
import { getPlaceholder } from '../../constants/placeholders';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'none', minHeight: 80, lineHeight: 1.5
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
  transition: 'all .15s ease'
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const carriers = ['Own Delivery', 'DHL', 'FedEx', 'UPS', 'Local Courier', 'SpeedAF', 'Fargo Courier'];
const DELIVERY_POD_RECONCILE_KEY = 'prime_shipping_pod_reconcile_v1';

const ShippingManager: React.FC = () => {
    const { companyConfig, notify } = useAuth();
    const { deliveryNotes, employees = [], fetchFinanceData } = useFinance();
    const { shipments, customers, fetchSalesData } = useSales();
    const { handlePreview } = useDocumentPreview();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'Pipeline' | 'Active' | 'History'>('Pipeline');

    const signatureUploadInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Delivery Modal
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [deliveryTarget, setDeliveryTarget] = useState<Shipment | null>(null);
    const [deliveryNoteTarget, setDeliveryNoteTarget] = useState<DeliveryNote | null>(null);
    
    // Delivery Form State
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [deliveryNotesText, setDeliveryNotesText] = useState('');
    const [manualTimestamp, setManualTimestamp] = useState(new Date().toISOString().slice(0, 16));
    const [manualGps, setManualGps] = useState({ lat: '', lng: '' });
    const [signatureInputMode, setSignatureInputMode] = useState<SignatureInputMode>('Draw');
    const [drawnSignatureDataUrl, setDrawnSignatureDataUrl] = useState<string | null>(null);
    const [uploadedSignatureDataUrl, setUploadedSignatureDataUrl] = useState<string | null>(null);
    const [isSavingDelivery, setIsSavingDelivery] = useState(false);

    // Dispatch Modal State
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
    const [dispatchTarget, setDispatchTarget] = useState<DeliveryNote | null>(null);
    const [isAddingNewDriver, setIsAddingNewDriver] = useState(false);
    const [dispatchForm, setDispatchForm] = useState({
        carrier: 'Own Delivery',
        driverId: '',
        newDriverName: '',
        vehicleNo: '',
        estArrival: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
        cost: 0
    });

    const payrollDrivers = useMemo(() => employees.filter((e: Employee) => e.status === 'Active'), [employees]);

    const pendingDeliveries = useMemo(() => 
        deliveryNotes.filter(dn => dn.status === 'Pending'), 
    [deliveryNotes]);

    const filteredDeliveries = pendingDeliveries.filter(dn => 
        (dn.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dn.id || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredShipments = useMemo(() => {
        let list = shipments || [];
        if (activeTab === 'History') list = list.filter(s => s.status === 'Delivered' || s.status === 'Cancelled');
        else if (activeTab === 'Active') list = list.filter(s => s.status !== 'Delivered' && s.status !== 'Cancelled');
        else if (activeTab === 'Pipeline') list = []; // Pipeline shows pending delivery notes, not shipments
        
        return list.filter(s => 
            (s.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [shipments, activeTab, searchTerm]);

    const activeSignatureDataUrl = signatureInputMode === 'Draw' ? drawnSignatureDataUrl : uploadedSignatureDataUrl;
    const canFinalizeDelivery = Boolean(recipientName.trim()) && Boolean(activeSignatureDataUrl) && !isSavingDelivery;

    const syncShippingState = async () => {
        await Promise.all([
            typeof fetchSalesData === 'function' ? fetchSalesData() : Promise.resolve(),
            typeof fetchFinanceData === 'function' ? fetchFinanceData() : Promise.resolve(),
        ]);
    };

    const initializeSignatureCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const cssWidth = rect.width || 600;
        const cssHeight = rect.height || 192;
        const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);

        canvas.width = Math.floor(cssWidth * pixelRatio);
        canvas.height = Math.floor(cssHeight * pixelRatio);

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';
    };

    useEffect(() => {
        if (!showDeliveryModal) return;
        initializeSignatureCanvas();
    }, [showDeliveryModal]);

    useEffect(() => {
        const reconcileProofs = async () => {
            try {
                const alreadyReconciled = localStorage.getItem(DELIVERY_POD_RECONCILE_KEY);
                if (alreadyReconciled) return;

                const result = await transactionService.reconcileLegacyShipmentProofToDeliveryNotes();
                localStorage.setItem(DELIVERY_POD_RECONCILE_KEY, new Date().toISOString());

                if (result?.updatedCount > 0) {
                    await syncShippingState();
                    notify(`Reconciled ${result.updatedCount} legacy delivery proof record(s).`, "info");
                }
            } catch (error) {
                logger.error('Legacy proof reconciliation failed:', error);
            }
        };

        void reconcileProofs();
    }, []);

    const handleOpenDispatch = (dn: DeliveryNote) => {
        setDispatchTarget(dn);
        setDispatchForm(prev => ({ 
            ...prev, 
            driverId: payrollDrivers[0]?.id || '', 
            newDriverName: '', 
            vehicleNo: dn.vehicleNo || ''
        }));
        setIsAddingNewDriver(false);
        setIsDispatchModalOpen(true);
    };

    const handleConfirmDispatch = async () => {
        if (!dispatchTarget) return;

        const id = `SHP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const driverName = isAddingNewDriver 
            ? dispatchForm.newDriverName 
            : payrollDrivers.find(e => e.id === dispatchForm.driverId)?.name || 'Unknown';

        // The portal keys shipments to the ERP customer id, so resolve it here
        // (delivery notes may only carry a name) rather than relying on the mirror.
        const resolvedCustomerId =
            dispatchTarget.customerId ||
            customers.find(c => (c.name || '').trim().toLowerCase() === (dispatchTarget.customerName || '').trim().toLowerCase())?.id ||
            customers.find(c => (c.name || '').trim().toLowerCase() === (dispatchTarget.invoiceId ? String(dispatchTarget.invoiceId) : '').trim().toLowerCase())?.id;

        const newShipment: Shipment = {
            id,
            orderId: dispatchTarget.id,
            customerId: resolvedCustomerId,
            customerName: dispatchTarget.customerName,
            items: dispatchTarget.items || [],
            date: new Date().toISOString(),
            carrier: dispatchForm.carrier,
            driverId: isAddingNewDriver ? undefined : dispatchForm.driverId,
            driverName: driverName,
            vehicleNo: dispatchForm.vehicleNo,
            trackingNumber: 'TRK-' + Math.random().toString(36).substring(7).toUpperCase(),
            weight: 1.0,
            weightUnit: 'kg',
            dimensions: { l: 0, w: 0, h: 0 },
            status: 'In Transit',
            shippingCost: dispatchForm.cost,
            estimatedDelivery: new Date(dispatchForm.estArrival).toISOString(),
        };

        try {
            await transactionService.updateShipmentStatus(newShipment, {
                id: dispatchTarget.id,
                status: 'In Transit',
                carrier: dispatchForm.carrier,
                driverName,
                vehicleNo: dispatchForm.vehicleNo,
                trackingNumber: newShipment.trackingNumber,
                estimatedDelivery: newShipment.estimatedDelivery,
            });
            await syncShippingState();
            notify(`Manifest synchronized. Driver ${driverName} dispatched.`, "success");
            setIsDispatchModalOpen(false);
            setActiveTab('Active');
        } catch (error: any) {
            logger.error('Dispatch manifest sync failed:', error);
            notify(`Dispatch failed: ${error?.message || 'Unknown error'}`, "error");
        }
    };

    const handleMarkDelivered = (shp: Shipment) => {
        setDeliveryTarget(shp);
        const dn = deliveryNotes.find(d => d.id === shp.orderId);
        setDeliveryNoteTarget(dn || null);
        
        // Reset form
        setRecipientName(shp.customerName);
        setRecipientPhone('');
        setDeliveryNotesText('');
        setManualTimestamp(new Date().toISOString().slice(0, 16));
        setManualGps({ lat: '', lng: '' });
        setSignatureInputMode('Draw');
        setDrawnSignatureDataUrl(null);
        setUploadedSignatureDataUrl(null);
        if (signatureUploadInputRef.current) {
            signatureUploadInputRef.current.value = '';
        }
        
        // Auto-trace GPS
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                setManualGps({
                    lat: position.coords.latitude.toString(),
                    lng: position.coords.longitude.toString()
                });
            }, (error) => {
                logger.error("GPS trace failed:", error);
                notify("GPS trace failed. Please enter manually if required.", "info");
            });
        }
        
        setShowDeliveryModal(true);
    };

    const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (signatureInputMode !== 'Draw') return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(e);
        if (!canvas || !ctx || !point) return;

        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        if (canvas.setPointerCapture) {
            canvas.setPointerCapture(e.pointerId);
        }
        setIsDrawing(true);
        setDrawnSignatureDataUrl(null);
    };

    const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            if (e && canvas.hasPointerCapture?.(e.pointerId)) {
                canvas.releasePointerCapture(e.pointerId);
            }
            setDrawnSignatureDataUrl(normalizeSignatureDataUrl(canvas.toDataURL('image/png')));
        }
    };

    const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || signatureInputMode !== 'Draw') return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(e);
        if (!canvas || !ctx || !point) return;

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#0f172a';
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    };

    const clearSignature = () => {
        if (signatureInputMode === 'Upload') {
            setUploadedSignatureDataUrl(null);
            if (signatureUploadInputRef.current) {
                signatureUploadInputRef.current.value = '';
            }
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
            const width = canvas.width / pixelRatio;
            const height = canvas.height / pixelRatio;
            ctx.clearRect(0, 0, width, height);
            setDrawnSignatureDataUrl(null);
        }
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const validationError = validateSignatureUploadFile(file);
        if (validationError) {
            notify(validationError, "error");
            e.target.value = '';
            return;
        }

        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const normalized = normalizeSignatureDataUrl(ev.target?.result as string);
            if (!normalized) {
                notify('Uploaded signature format is invalid.', "error");
                return;
            }
            setUploadedSignatureDataUrl(normalized);
        };
        reader.readAsDataURL(file);
    };

    const handleCaptureDelivery = async () => {
        if (!deliveryTarget || !deliveryNoteTarget) return;
        if (!recipientName.trim()) {
            notify("Recipient name is required.", "error");
            return;
        }
        if (!activeSignatureDataUrl) {
            notify("Signature required to seal delivery certificate.", "error");
            return;
        }

        // Final GPS capture attempt
        let finalLocation = { 
            lat: parseFloat(manualGps.lat) || 0, 
            lng: parseFloat(manualGps.lng) || 0 
        };

        if ("geolocation" in navigator) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                finalLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (err) {
                console.warn("Final GPS capture failed, using previous trace:", err);
            }
        }

        const parsedTimestamp = new Date(manualTimestamp);
        const timestamp = Number.isNaN(parsedTimestamp.getTime())
            ? new Date().toISOString()
            : parsedTimestamp.toISOString();
        const notesText = deliveryNotesText.trim();
        const normalizedPhone = recipientPhone.trim();
        const normalizedRecipient = recipientName.trim();

        const updatedShipment: Shipment = {
            ...deliveryTarget,
            status: 'Delivered',
            actualArrival: timestamp,
            currentLocation: finalLocation,
            proofOfDelivery: {
                receivedBy: normalizedRecipient,
                recipientPhone: normalizedPhone || undefined,
                signatureDataUrl: activeSignatureDataUrl,
                signature: activeSignatureDataUrl,
                signatureInputMode,
                timestamp: timestamp,
                locationStamp: finalLocation,
                notes: notesText || undefined,
                remarks: notesText || undefined
            }
        };

        try {
            setIsSavingDelivery(true);
            await transactionService.updateShipmentStatus(updatedShipment, {
                id: deliveryNoteTarget.id,
                status: 'Delivered',
                actualArrival: timestamp,
                currentLocation: finalLocation,
                carrier: deliveryTarget.carrier,
                driverName: deliveryTarget.driverName,
                vehicleNo: deliveryTarget.vehicleNo,
                trackingNumber: deliveryTarget.trackingNumber,
                proofOfDelivery: updatedShipment.proofOfDelivery,
            });
            await syncShippingState();
            notify("Delivery Sealed: Signature & GPS Coordinates Verified.", "success");
            setShowDeliveryModal(false);
            setDeliveryTarget(null);
            setActiveTab('History');
        } catch (err: any) {
            logger.error("Delivery update failed:", err);
            notify(`Failed to finalize delivery: ${err?.message || 'Unknown error'}`, "error");
        } finally {
            setIsSavingDelivery(false);
        }
    };

    const handleScanReceived = () => {
        notify("Scan Received Image is temporarily disabled until extraction support is implemented.", "info");
    };

    const handleNotifyClient = async (shp: Shipment) => {
        const cust = customers.find(c => c.name === shp.customerName);
        const phone = (cust?.contact || (cust as { phone?: string })?.phone || '').replace(/\s+/g, '');
        const eta = shp.estimatedDelivery ? format(new Date(shp.estimatedDelivery), 'MMM d, HH:mm') : 'N/A';
        const companyName = companyConfig?.companyName || 'our company';
        const msg = `Hello ${shp.customerName}, your order #${shp.orderId} is currently ${shp.status.toLowerCase()}. \n\nTracking: ${shp.trackingNumber}\nEst. Arrival: ${eta}\n\nThank you for choosing ${companyName}.`;

        if (phone) {
            try {
                window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
                notify("Opening default SMS application...", "info");
                return;
            } catch (error) {
                logger.error('Failed to open sms deep link:', error);
            }
        }

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(msg);
                notify(
                    phone
                        ? `SMS deep link unavailable. Message copied for ${phone}.`
                        : 'No recipient phone available. Message copied to clipboard.',
                    "info"
                );
                return;
            } catch (error) {
                logger.error('Clipboard write failed:', error);
            }
        }

        notify('Unable to open SMS app or copy message automatically on this desktop.', "error");
    };

    const findDeliveryNote = (shp: Shipment) => deliveryNotes.find(d => d.id === shp.orderId);

    const handlePreviewDeliveryNote = (shp: Shipment) => {
        const dn = findDeliveryNote(shp);
        if (dn) {
            handlePreview('DELIVERY_NOTE', dn);
        } else {
            notify("Associated Delivery Note not found", "error");
        }
    };

    const handleDownloadDeliveryNote = (shp: Shipment) => {
        const dn = findDeliveryNote(shp);
        if (dn) {
            void handleDownloadPDF(dn);
        } else {
            notify("Associated Delivery Note not found", "error");
        }
    };

    const handleDownloadPDF = async (dn: DeliveryNote) => {
        try {
            notify("Preparing Delivery Note PDF...", "info");
            const enrichedDeliveryNote = enrichDocumentCustomerData(dn, customers);
            const pdfData = mapToInvoiceData(enrichedDeliveryNote, companyConfig, 'DELIVERY_NOTE');
            await initializePrimePdfFonts();
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            const blob = await pdf(<PrimeDocument type="DELIVERY_NOTE" data={securedPdfData as PrimeDocData} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const dnNumber = dn.dnNumber || dn.deliveryNoteNumber || dn.id || '';
            link.download = dnNumber ? `Delivery Note - ${dnNumber}.pdf` : `Delivery Note.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Delivery Note PDF downloaded successfully", "success");
        } catch (error) {
            logger.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    return (
        <div style={{ 
          height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column',
          background: paper, overflow: 'hidden'
        }}>
            
            <header style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${hairline}`,
              background: paper,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0, gap: 16, flexWrap: 'wrap'
            }} className="md:!px-10 md:!py-6">
                <div>
                    <h1 style={{
                      fontFamily: "'DM Serif Display', 'Georgia', serif",
                      fontSize: 20, color: teal[800], margin: 0,
                      display: 'flex', alignItems: 'center', gap: 12, letterSpacing: 0.2
                    }} className="md:!text-[22px]">
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                        }}>
                            <Truck size={20} color="#fff" />
                        </div>
                        Logistics Command
                    </h1>
                    <p style={{ fontSize: 12, color: inkSoft, marginTop: 4, fontWeight: 500 }}>
                        Proof of delivery processing and manifest management.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: 280 }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: 36 }}
                            placeholder={activeTab === 'Pipeline' ? 'Search pending delivery notes...' : 'Search shipments...'}
                        />
                    </div>
                    <div style={{ display: 'flex', background: teal[50], padding: 4, borderRadius: 12, border: `1px solid ${teal[100]}`, gap: 2 }}>
                        {[
                            { id: 'Pipeline', label: 'Inbound', icon: Package, count: filteredDeliveries.length },
                            { id: 'Active', label: 'Active', icon: Truck, count: (shipments || []).filter(s => s.status !== 'Delivered' && s.status !== 'Cancelled').length },
                            { id: 'History', label: 'History', icon: CheckCircle, count: (shipments || []).filter(s => s.status === 'Delivered').length }
                        ].map(tab => (
                            <button 
                                key={tab.id} 
                                onClick={() => setActiveTab(tab.id as 'Pipeline' | 'Active' | 'History')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: 10,
                                    fontSize: 10, fontWeight: 700, letterSpacing: 0.08,
                                    textTransform: 'uppercase', cursor: 'pointer',
                                    border: 'none', transition: 'all .15s ease',
                                    background: activeTab === tab.id ? teal[500] : 'transparent',
                                    color: activeTab === tab.id ? '#fff' : inkSoft,
                                    boxShadow: activeTab === tab.id ? `0 2px 8px -2px rgba(15,84,76,.4)` : 'none'
                                }}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                                <span style={{
                                    padding: '2px 6px', borderRadius: 6,
                                    fontSize: 9, fontWeight: 700,
                                    background: activeTab === tab.id ? 'rgba(255,255,255,.2)' : teal[100],
                                    color: activeTab === tab.id ? '#fff' : teal[700]
                                }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>
                    
                    <button 
                        onClick={handleScanReceived}
                        style={{ ...btnGhostStyle, opacity: 0.7, cursor: 'not-allowed' }}
                    >
                        <FileSearch size={16}/> Scan Received Image (Disabled)
                    </button>
                </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }} className="md:!p-10">
                {activeTab === 'Pipeline' && (
                    <div style={{ background: paper, borderRadius: 14, border: `1px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08 }}>Customer</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08 }} className="hidden md:table-cell">Shipping Address</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08 }} className="hidden sm:table-cell">Delivery ID</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08 }}>Items</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDeliveries.map(dn => (
                                    <tr key={dn.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background .15s ease' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '14px 16px' }}>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.2 }}>{dn.customerName}</div>
                                                <span style={{
                                                  fontSize: 9, fontWeight: 700, color: teal[600], textTransform: 'uppercase',
                                                  letterSpacing: 0.08, background: teal[50],
                                                  padding: '2px 8px', borderRadius: 12, border: `1px solid ${teal[100]}`, marginTop: 4, display: 'inline-block'
                                                }}>
                                                    Ready for dispatch
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: 13, color: ink, verticalAlign: 'middle', maxWidth: 260 }} className="hidden md:table-cell">
                                            {dn.shippingAddress}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: 13, color: inkSoft, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", verticalAlign: 'middle' }} className="hidden sm:table-cell">
                                            {dn.id}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: 13, color: ink, fontWeight: 600, verticalAlign: 'middle' }}>
                                            {dn.items.length}
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'inline-flex', gap: 6 }}>
                                                <button
                                                    onClick={() => handlePreview('DELIVERY_NOTE', dn)}
                                                    style={{
                                                      padding: 7, background: paper, border: `1px solid ${hairline}`,
                                                      color: inkSoft, borderRadius: 8, cursor: 'pointer',
                                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                      transition: 'all .15s ease'
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                                                    title="Preview PDF"
                                                >
                                                    <Eye size={15}/>
                                                </button>
                                                <button
                                                    onClick={() => handleDownloadPDF(dn)}
                                                    style={{
                                                      padding: 7, background: paper, border: `1px solid ${hairline}`,
                                                      color: inkSoft, borderRadius: 8, cursor: 'pointer',
                                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                      transition: 'all .15s ease'
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                                                    title="Download PDF"
                                                >
                                                    <Download size={15}/>
                                                </button>
                                                <button
                                                    onClick={() => handleOpenDispatch(dn)}
                                                    style={{
                                                      ...btnPrimaryStyle, padding: '8px 16px',
                                                      justifyContent: 'center', gap: 5, fontSize: 10, letterSpacing: 0.08
                                                    }}
                                                >
                                                    <Navigation size={13}/> Dispatch
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredDeliveries.length === 0 && (
                                  <tr>
                                    <td colSpan={5} style={{ padding: '80px 20px', textAlign: 'center', color: inkSoft, fontStyle: 'italic', fontSize: 14 }}>
                                        Manifest pipeline clear. All pending notes are dispatched.
                                    </td>
                                  </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {(activeTab === 'Active' || activeTab === 'History') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {filteredShipments.map(shp => (
                            <div key={shp.id} style={{
                              background: paper, borderRadius: 14,
                              border: `1px solid ${hairline}`,
                              boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                              overflow: 'hidden', display: 'flex', flexDirection: 'row',
                              flexWrap: 'wrap',
                              transition: 'all .2s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = teal[200]}
                            onMouseLeave={e => e.currentTarget.style.borderColor = hairline}
                            >
                                <div style={{
                                  padding: 16, borderBottom: `1px solid ${hairline}`,
                                  background: teal[50],
                                  display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', justifyContent: 'center',
                                  textAlign: 'center', flexShrink: 0, width: 224
                                }} className="md:!border-r md:!border-b-0 md:!p-6">
                                    <div style={{
                                      width: 56, height: 56, borderRadius: 14,
                                      background: `linear-gradient(155deg, ${teal[400]}, ${teal[600]})`,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      marginBottom: 12,
                                      boxShadow: `0 4px 12px -3px rgba(15,84,76,.4)`
                                    }}>
                                        <Truck size={28} color="#fff" />
                                    </div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 8 }}>
                                        {shp.carrier}
                                    </div>
                                    <span style={{
                                      padding: '4px 12px', borderRadius: 20,
                                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                      letterSpacing: 0.08,
                                      border: `1px solid ${shp.status === 'Delivered' ? teal[500] : teal[200]}`,
                                      background: shp.status === 'Delivered' ? teal[500] : teal[50],
                                      color: shp.status === 'Delivered' ? '#fff' : teal[600]
                                    }}>
                                        {shp.status}
                                    </span>
                                </div>

                                <div style={{ flex: 1, padding: 24 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                                        <div>
                                            <h4 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.2 }}>{shp.customerName}</h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Box size={10}/> {shp.orderId}
                                                </span>
                                                <span style={{ color: hairline }}>•</span>
                                                <span style={{
                                                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                                                  color: teal[600], background: teal[50],
                                                  padding: '2px 8px', borderRadius: 6, border: `1px solid ${teal[100]}`
                                                }}>
                                                    {shp.trackingNumber}
                                                </span>
                                            </div>
                                        </div>
                                        {shp.status !== 'Delivered' ? (
                                            <button 
                                                onClick={() => handleMarkDelivered(shp)}
                                                style={{
                                                  ...btnPrimaryStyle, padding: '10px 18px',
                                                  justifyContent: 'center', gap: 6, fontSize: 10, letterSpacing: 0.08
                                                }}
                                            >
                                                <CheckSquare size={14}/> Seal Proof of Delivery
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button 
                                                    onClick={() => handlePreviewDeliveryNote(shp)}
                                                    style={{ ...btnGhostStyle, padding: '8px 14px', fontSize: 10, gap: 6 }}
                                                    title="Preview Delivery Note"
                                                >
                                                    <Eye size={14}/> Preview
                                                </button>
                                                <button 
                                                    onClick={() => handleDownloadDeliveryNote(shp)}
                                                    style={{ ...btnGhostStyle, padding: '8px 14px', fontSize: 10, gap: 6 }}
                                                    title="Download PDF"
                                                >
                                                    <Download size={14}/> Download
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
                                        <div>
                                            <p style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 4px' }}>Expected Arrival</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0 }}>{shp.estimatedDelivery ? format(new Date(shp.estimatedDelivery), 'MMM d, HH:mm') : 'N/A'}</p>
                                        </div>
                                        {shp.actualArrival && (
                                            <div>
                                                <p style={{ fontSize: 9, fontWeight: 700, color: teal[600], textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 4px' }}>Received Date</p>
                                                <p style={{ fontSize: 14, fontWeight: 700, color: teal[700], margin: 0 }}>{format(new Date(shp.actualArrival), 'MMM d, HH:mm')}</p>
                                            </div>
                                        )}
                                        {shp.currentLocation && (
                                            <div>
                                                <p style={{ fontSize: 9, fontWeight: 700, color: teal[400], textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 4px' }}>Remote GPS Stamp</p>
                                                <p style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: inkSoft, margin: 0 }}>
                                                    {shp.currentLocation.lat.toFixed(4)}, {shp.currentLocation.lng.toFixed(4)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, flexShrink: 0, width: 176, background: teal[50] }}>
                                    <button 
                                        onClick={() => void handleNotifyClient(shp)} 
                                        style={{
                                          ...btnPrimaryStyle, width: '100%', padding: '8px 12px',
                                          justifyContent: 'center', gap: 6, fontSize: 9, letterSpacing: 0.05
                                        }}
                                    >
                                        <MessageSquare size={12}/> Update
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dispatch Modal */}
            {isDispatchModalOpen && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 100,
                  background: 'rgba(15, 23, 42, 0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 40, fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
                }}>
                    <div style={{
                      width: 480, maxWidth: '100%', maxHeight: '90vh',
                      background: paper, borderRadius: 14,
                      boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
                      display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
                    }}>
                        {/* Accent stripe */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                        }} />
                        
                        {/* Header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '22px 28px 18px',
                          borderBottom: `1px solid ${hairline}`,
                          background: paper
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: 10,
                              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                            }}>
                              <Navigation size={19} color="#fff" />
                            </div>
                            <h3 style={{
                              fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                              fontSize: 20, margin: 0, color: teal[800], letterSpacing: 0.2
                            }}>
                              Initiate Dispatch
                            </h3>
                          </div>
                          <button onClick={() => setIsDispatchModalOpen(false)} style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all .15s ease'
                          }}
                            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        
                        {/* Body */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                <div>
                                    <label style={labelStyle}>Fleet Carrier</label>
                                    <select 
                                        style={{ ...inputStyle, cursor: 'pointer' }}
                                        value={dispatchForm.carrier}
                                        onChange={e => setDispatchForm({...dispatchForm, carrier: e.target.value})}
                                    >
                                        {carriers.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <label style={{ ...labelStyle, marginBottom: 0 }}>Driver Name</label>
                                        <button 
                                            onClick={() => setIsAddingNewDriver(!isAddingNewDriver)}
                                            style={{ fontSize: 10, fontWeight: 700, color: teal[600], cursor: 'pointer', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: 0.05 }}
                                        >
                                            {isAddingNewDriver ? <X size={12}/> : <UserPlus size={12}/>}
                                            {isAddingNewDriver ? 'Select Existing' : 'Add New Driver'}
                                        </button>
                                    </div>
                                    {isAddingNewDriver ? (
                                        <input 
                                            type="text"
                                            autoFocus
                                            style={{ ...inputStyle }}
                                            placeholder="Enter full name..."
                                            value={dispatchForm.newDriverName}
                                            onChange={e => setDispatchForm({...dispatchForm, newDriverName: e.target.value})}
                                        />
                                    ) : (
                                        <select 
                                            style={{ ...inputStyle, cursor: 'pointer' }}
                                            value={dispatchForm.driverId}
                                            onChange={e => setDispatchForm({...dispatchForm, driverId: e.target.value})}
                                        >
                                            <option value="">-- Select Active Employee --</option>
                                            {payrollDrivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.role})</option>)}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <label style={labelStyle}>
                                        <Car size={14} style={{ color: teal[500], marginRight: 4 }} /> Vehicle No.
                                    </label>
                                    <input 
                                        type="text" 
                                        style={{ ...inputStyle, textTransform: 'uppercase' }}
                                        placeholder="e.g. ZA 1234"
                                        value={dispatchForm.vehicleNo}
                                        onChange={e => setDispatchForm({...dispatchForm, vehicleNo: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        {/* Footer */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                          gap: 10, padding: '16px 28px',
                          borderTop: `1px solid ${hairline}`, background: paper
                        }}>
                            <button type="button" onClick={() => setIsDispatchModalOpen(false)}
                              style={btnGhostStyle}
                              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                              Cancel
                            </button>
                            <button 
                                onClick={handleConfirmDispatch} 
                                disabled={(isAddingNewDriver && !dispatchForm.newDriverName) || (!isAddingNewDriver && !dispatchForm.driverId && dispatchForm.carrier === 'Own Delivery')}
                                style={{
                                  ...btnPrimaryStyle,
                                  opacity: ((isAddingNewDriver && !dispatchForm.newDriverName) || (!isAddingNewDriver && !dispatchForm.driverId && dispatchForm.carrier === 'Own Delivery')) ? 0.5 : 1,
                                  cursor: ((isAddingNewDriver && !dispatchForm.newDriverName) || (!isAddingNewDriver && !dispatchForm.driverId && dispatchForm.carrier === 'Own Delivery')) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <Navigation size={16}/> Commit Dispatch Manifest
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery Confirmation Modal (Seal Proof) */}
            {showDeliveryModal && deliveryNoteTarget && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 110,
                  background: 'rgba(15, 23, 42, 0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 40, fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
                }}>
                    <div style={{
                      width: 960, maxWidth: '100%', maxHeight: '92vh',
                      background: paper, borderRadius: 14,
                      boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
                      display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
                    }}>
                        {/* Accent stripe */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
                        }} />
                        
                        {/* Header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '22px 28px 18px',
                          borderBottom: `1px solid ${hairline}`,
                          background: paper
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: 10,
                              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
                            }}>
                              <CheckSquare size={19} color="#fff" />
                            </div>
                            <div>
                              <h3 style={{
                                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                                fontSize: 20, margin: 0, color: teal[800], letterSpacing: 0.2
                              }}>
                                Seal Delivery Certificate
                              </h3>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: inkSoft, letterSpacing: 0.02 }}>
                                Order Ref: {deliveryNoteTarget.id}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => setShowDeliveryModal(false)} style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all .15s ease'
                          }}
                            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        
                        {/* Body */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                                    <div>
                                        <label style={labelStyle}>Recipient Legal Name</label>
                                        <input 
                                            type="text" 
                                            style={{ ...inputStyle }}
                                            value={recipientName}
                                            onChange={e => setRecipientName(e.target.value)}
                                            placeholder="Who is signing?"
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Recipient Phone (Optional)</label>
                                        <input
                                            type="tel"
                                            style={{ ...inputStyle }}
                                            value={recipientPhone}
                                            onChange={e => setRecipientPhone(e.target.value)}
                                            placeholder={`${getPlaceholder.phone().split(' ')[0]}...`}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Exact Date & Time Received</label>
                                        <input 
                                            type="datetime-local" 
                                            style={{ ...inputStyle }}
                                            value={manualTimestamp}
                                            onChange={e => setManualTimestamp(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ ...labelStyle, marginBottom: 10 }}>
                                        <Globe size={14} style={{ color: teal[500], marginRight: 4 }} /> Tracking Coordinates (Handheld Sync)
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Lat</div>
                                            <input 
                                                type="number" 
                                                style={{ ...inputStyle, paddingLeft: 36, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                                                value={manualGps.lat}
                                                onChange={e => setManualGps({...manualGps, lat: e.target.value})}
                                                placeholder="-13.9..."
                                            />
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Lng</div>
                                            <input 
                                                type="number" 
                                                style={{ ...inputStyle, paddingLeft: 36, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                                                value={manualGps.lng}
                                                onChange={e => setManualGps({...manualGps, lng: e.target.value})}
                                                placeholder="33.7..."
                                            />
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 10, color: inkSoft, marginTop: 8, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, fontStyle: 'italic' }}>
                                        <Info size={12} /> Auto GPS when available, manual coordinates accepted
                                    </p>
                                </div>

                                <div>
                                    <label style={labelStyle}>Comments / Remarks</label>
                                    <textarea 
                                        style={{ ...inputStyle, resize: 'none', minHeight: 80, lineHeight: 1.5 }}
                                        value={deliveryNotesText}
                                        onChange={e => setDeliveryNotesText(e.target.value)}
                                        placeholder="Dispatch or recipient comments..."
                                    />
                                </div>

                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <label style={{ ...labelStyle, marginBottom: 0 }}>Customer Signature</label>
                                        <div style={{ display: 'flex', background: teal[50], padding: 4, borderRadius: 10, border: `1px solid ${teal[100]}`, gap: 2 }}>
                                            {(['Draw', 'Upload'] as SignatureInputMode[]).map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setSignatureInputMode(mode)}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 8,
                                                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                        letterSpacing: 0.05, cursor: 'pointer', border: 'none',
                                                        transition: 'all .15s ease',
                                                        background: signatureInputMode === mode ? paper : 'transparent',
                                                        color: signatureInputMode === mode ? teal[700] : inkSoft,
                                                        boxShadow: signatureInputMode === mode ? '0 1px 3px rgba(0,0,0,.06)' : 'none'
                                                    }}
                                                >
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {signatureInputMode === 'Draw' ? (
                                        <div style={{ position: 'relative' }}>
                                            <canvas
                                                ref={canvasRef}
                                                onPointerDown={startDrawing}
                                                onPointerMove={draw}
                                                onPointerUp={stopDrawing}
                                                onPointerLeave={stopDrawing}
                                                onPointerCancel={stopDrawing}
                                                style={{ 
                                                  width: '100%', height: 192,
                                                  border: `1.4px solid ${hairline}`,
                                                  borderRadius: 10,
                                                  background: paper,
                                                  cursor: 'crosshair',
                                                  touchAction: 'none'
                                                }}
                                            />
                                            <button
                                                onClick={clearSignature}
                                                style={{
                                                  position: 'absolute', top: 12, right: 12,
                                                  padding: 8, background: paper, border: `1px solid ${hairline}`,
                                                  color: inkSoft, cursor: 'pointer', borderRadius: 8,
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  transition: 'all .15s ease'
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#b5493f'; e.currentTarget.style.borderColor = '#fecaca'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                                                title="Clear Signature"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 600, color: '#c4bdb2', textTransform: 'uppercase', letterSpacing: 0.05, pointerEvents: 'none' }}>
                                                <ShieldCheck size={10} /> Desktop pointer signature pad ready
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <input
                                                ref={signatureUploadInputRef}
                                                data-testid="signature-upload-input"
                                                type="file"
                                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                                style={{ display: 'none' }}
                                                onChange={handleSignatureUpload}
                                            />
                                            <button
                                                onClick={() => signatureUploadInputRef.current?.click()}
                                                style={{
                                                  ...btnGhostStyle, width: '100%', padding: '12px 20px',
                                                  justifyContent: 'center', gap: 8, fontSize: 10, letterSpacing: 0.08
                                                }}
                                            >
                                                <Upload size={14} /> Upload Signature
                                            </button>
                                            <div style={{ border: `1.4px dashed ${hairline}`, borderRadius: 10, padding: 16, minHeight: 112, background: paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {uploadedSignatureDataUrl ? (
                                                    <img src={uploadedSignatureDataUrl} alt="Uploaded recipient signature" style={{ maxHeight: 96, objectFit: 'contain' }} />
                                                ) : (
                                                    <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>No uploaded signature</p>
                                                )}
                                            </div>
                                            {uploadedSignatureDataUrl && (
                                                <button
                                                    onClick={clearSignature}
                                                    style={{ fontSize: 10, fontWeight: 700, color: '#b5493f', textTransform: 'uppercase', letterSpacing: 0.05, background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}
                                                >
                                                    Clear Uploaded Signature
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 20, borderTop: `1px solid ${hairline}` }}>
                                    <div style={{ background: teal[50], padding: 16, borderRadius: 10, border: `1px solid ${teal[100]}` }}>
                                        <p style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 4px' }}>Driver In-Charge</p>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: ink, margin: 0 }}>{deliveryTarget.driverName || 'N/A'}</p>
                                    </div>
                                    <div style={{ background: teal[50], padding: 16, borderRadius: 10, border: `1px solid ${teal[100]}` }}>
                                        <p style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 4px' }}>Vehicle Reg No.</p>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: ink, margin: 0 }}>{deliveryTarget.vehicleNo || 'N/A'}</p>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleCaptureDelivery} 
                                    disabled={!canFinalizeDelivery}
                                    style={{
                                      ...btnPrimaryStyle, width: '100%', padding: '16px 24px',
                                      justifyContent: 'center', gap: 10, fontSize: 13,
                                      opacity: !canFinalizeDelivery ? 0.5 : 1,
                                      cursor: !canFinalizeDelivery ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <CheckSquare size={24}/> {isSavingDelivery ? 'Finalizing...' : 'Finalize & Generate Certificate'}
                                </button>
                            </div>
                        </div>
                        
                        {/* Footer */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '16px 28px',
                          borderTop: `1px solid ${hairline}`, background: paper
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08 }}>
                                <ShieldCheck size={14} style={{ color: teal[500] }}/> Protocol Verified
                            </span>
                            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Office Terminal Sync</span>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ShippingManager;
