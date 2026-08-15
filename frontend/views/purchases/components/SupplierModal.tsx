import React, { useState, useEffect } from 'react';
import { X, Save, Phone, MapPin, FileText, Building, Landmark, Truck, Plus } from 'lucide-react';
import { Supplier } from '../../../types';
import { getPlaceholder } from '../../../constants/placeholders';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../../../components/Dialog';

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' };
const paper = '#FEFDFB'; const ink = '#23282A'; const inkSoft = '#5c6567'; const hairline = '#e4ddd1';

const sans = "'Inter','Roboto','DM Sans',sans-serif";
const mono = "'JetBrains Mono',monospace";

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplier: Supplier) => Promise<void>;
  mode?: 'create' | 'edit';
  initialSupplier?: Partial<Supplier>;
}

const DEFAULT_SUPPLIER_FORM: Partial<Supplier> = {
  name: '', phone: '', address: '', city: '', billingAddress: '', shippingAddress: '',
  balance: 0, category: '', notes: '', paymentTerms: 'Net 30', bankAccountDetails: ''
};

export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, onSave, mode = 'create', initialSupplier }) => {
  const isEditing = mode === 'edit' && Boolean(initialSupplier?.id);
  const [activeTab, setActiveTab] = useState<'address' | 'payment' | 'additional'>('address');
  const [formData, setFormData] = useState<Partial<Supplier>>(DEFAULT_SUPPLIER_FORM);
  const [useBillingForShipping, setUseBillingForShipping] = useState(true);

  useEffect(() => {
    if (isEditing && initialSupplier) {
      setFormData({ ...DEFAULT_SUPPLIER_FORM, ...initialSupplier });
      setUseBillingForShipping(initialSupplier.billingAddress === initialSupplier.shippingAddress);
    } else {
      const { id: _ignoredId, ...createDraft } = initialSupplier || {};
      setFormData({ ...DEFAULT_SUPPLIER_FORM, ...createDraft });
      setUseBillingForShipping(true);
    }
  }, [initialSupplier, isEditing, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    if (!isEditing) { delete dataToSave.id; }
    if (useBillingForShipping) { dataToSave.shippingAddress = dataToSave.billingAddress; }
    await onSave(dataToSave as Supplier);
    onClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) : value }));
  };

  const inputStyle: React.CSSProperties = { width:'100%',border:`1.4px solid ${hairline}`,borderRadius:9,padding:'8px 12px',background:paper,fontFamily:sans,fontSize:13.5,lineHeight:1.5,color:ink,outline:'none',transition:'border-color .15s ease, box-shadow .15s ease' };
  const btnPrimary: React.CSSProperties = { background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',borderRadius:9,padding:'7px 14px',border:'none',fontFamily:sans,fontSize:13.5,fontWeight:600,lineHeight:1.5,cursor:'pointer',boxShadow:'0 6px 16px -6px rgba(15,84,76,.55)',display:'inline-flex',alignItems:'center',gap:7,transition:'all .15s ease' };
  const btnGhost: React.CSSProperties = { background:paper,border:`1.4px solid ${hairline}`,color:inkSoft,borderRadius:9,padding:'7px 14px',fontFamily:sans,fontSize:13.5,fontWeight:600,lineHeight:1.5,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7,transition:'all .15s ease' };
  const labelStyle: React.CSSProperties = { display:'block',fontSize:12.5,fontWeight:600,color:teal[800],marginBottom:5,lineHeight:1.4,fontFamily:sans };

  const SidebarItem = ({ id, label, icon: Icon }: { id: string, label: string, icon: any }) => {
    const isActive = activeTab === id;
    return (
      <button type="button" onClick={()=>setActiveTab(id as 'address'|'payment'|'additional')}
        style={{ width:'100%',display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:9,border:'none',cursor:'pointer',fontFamily:sans,fontSize:13,fontWeight:600,lineHeight:1.5,textAlign:'left',transition:'all .15s ease',
          background: isActive ? `linear-gradient(155deg,${teal[500]},${teal[700]})` : 'transparent',
          color: isActive ? '#fff' : inkSoft,
          boxShadow: isActive ? '0 4px 12px -4px rgba(15,84,76,.5)' : 'none' }}
        onMouseEnter={e=>{if(!isActive){e.currentTarget.style.background=`${teal[50]}`;e.currentTarget.style.color=ink}}}
        onMouseLeave={e=>{if(!isActive){e.currentTarget.style.background='transparent';e.currentTarget.style.color=inkSoft}}}>
        <Icon size={17} style={{flexShrink:0}}/>{label}
      </button>
    );
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogHeader className="flex items-center justify-between" style={{background:`linear-gradient(135deg,${teal[50]} 0%,#FEFDFB 100%)`,borderBottom:`1px solid ${hairline}`,padding:'14px 20px'}}>
        <div className="flex items-center gap-4">
          <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 10px -3px rgba(15,84,76,.6)',flexShrink:0,color:'#fff'}}>
            <Building size={22}/>
          </div>
          <div>
            <DialogTitle style={{fontFamily:sans,fontSize:22,color:teal[800],fontWeight:600,lineHeight:1.4,letterSpacing:'-.02em'}}>{isEditing?'Edit Supplier':'New Supplier'}</DialogTitle>
            <p style={{margin:'2px 0 0',fontSize:12.5,color:inkSoft,lineHeight:1.5,fontFamily:sans}}>Manage supplier profile and payment settings</p>
          </div>
        </div>
        <button onClick={onClose} style={{padding:8,borderRadius:9,border:`1px solid ${hairline}`,background:paper,color:inkSoft,cursor:'pointer',display:'inline-flex',transition:'all .12s ease',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.color=teal[700];e.currentTarget.style.borderColor=teal[200]}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}><X size={20}/></button>
      </DialogHeader>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{width:200,flexShrink:0,background:`linear-gradient(180deg,${teal[800]},${teal[900]})`,padding:'14px 8px',display:'flex',flexDirection:'column',gap:4}}>
          <div style={{color:'rgba(255,255,255,.4)',fontSize:10,letterSpacing:'.12em',textTransform:'uppercase',fontWeight:700,lineHeight:1.5,padding:'4px 10px 8px',fontFamily:sans}}>Supplier Setup</div>
          <SidebarItem id="address" label="Address" icon={MapPin}/>
          <SidebarItem id="payment" label="Payment & Banking" icon={Landmark}/>
          <SidebarItem id="additional" label="Notes & Info" icon={FileText}/>
        </div>

        <div style={{flex:1,overflowY:'auto',background:paper,padding:'20px 24px 8px'}}>
          {activeTab==='address'&&(
            <div style={{marginBottom:16}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                <div>
                  <label style={{...labelStyle,color:ink}}>Supplier Display Name <span style={{color:'#b5493f',fontWeight:700}}>*</span></label>
                  <input required type="text" name="name" value={formData.name||''} onChange={handleChange} placeholder="e.g. ABC Suppliers" style={inputStyle} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
                </div>
                <div>
                  <label style={labelStyle}>Phone Number <span style={{color:'#b5493f',fontWeight:700}}>*</span></label>
                  <div style={{position:'relative'}}>
                    <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:teal[600],fontWeight:700,fontFamily:mono,fontSize:13}}>+265</span>
                    <input type="tel" name="phone" value={formData.phone||''} onChange={handleChange} placeholder={getPlaceholder.phone()} style={{...inputStyle,paddingLeft:44,fontFamily:mono,fontVariantNumeric:'tabular-nums'}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
                  </div>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.08em',lineHeight:1.5,marginBottom:8,display:'flex',alignItems:'center',gap:7}}><MapPin size={14} style={{color:teal[500]}}/> Billing Address</div>
                <textarea name="billingAddress" value={formData.billingAddress||''} onChange={handleChange} rows={4} placeholder={getPlaceholder.address()} style={{...inputStyle,resize:'none',minHeight:80}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                  <div style={{fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.08em',lineHeight:1.5,display:'flex',alignItems:'center',gap:7}}><Truck size={14} style={{color:teal[500]}}/> Shipping Address</div>
                  <label style={{display:'inline-flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,color:inkSoft,lineHeight:1.5,cursor:'pointer'}}>
                    <input type="checkbox" checked={useBillingForShipping} onChange={(e)=>setUseBillingForShipping(e.target.checked)} style={{width:15,height:15,accentColor:teal[600],cursor:'pointer'}}/>
                    Same as Billing
                  </label>
                </div>
                <textarea name="shippingAddress" value={useBillingForShipping?(formData.billingAddress||''):(formData.shippingAddress||'')} onChange={handleChange} disabled={useBillingForShipping} rows={4} placeholder={`${getPlaceholder.addressLine2()}, ${getPlaceholder.city()}`} style={{...inputStyle,resize:'none',minHeight:80,...(useBillingForShipping?{background:teal[50],color:inkSoft,cursor:'not-allowed'}:{})}} onFocus={e=>{if(!useBillingForShipping){e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div>
                  <label style={labelStyle}>City / Region</label>
                  <input type="text" name="city" value={formData.city||''} onChange={handleChange} placeholder={getPlaceholder.city()} style={inputStyle} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
                </div>
                <div>
                  <label style={labelStyle}>Postal / Box No.</label>
                  <input type="text" placeholder="P.O. Box 1420" style={inputStyle} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
                </div>
              </div>
            </div>
          )}

          {activeTab==='payment'&&(
            <div style={{marginBottom:16}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                <div>
                  <label style={labelStyle}>Payment Terms</label>
                  <select name="paymentTerms" value={formData.paymentTerms||'Net 30'} onChange={handleChange} style={{...inputStyle,appearance:'none',backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 12px center',paddingRight:30,cursor:'pointer'}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}>
                    <option value="Due on Receipt">Due on Receipt</option>
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 60">Net 60</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Opening Balance</label>
                  <div style={{position:'relative'}}>
                    <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:inkSoft,fontWeight:700,fontFamily:mono,fontSize:13}}>$</span>
                    <input type="number" name="balance" value={formData.balance||0} onChange={handleChange} placeholder="0.00" style={{...inputStyle,paddingLeft:28,fontFamily:mono,fontVariantNumeric:'tabular-nums',textAlign:'right'}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
                  </div>
                </div>
              </div>
              <div style={{fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.08em',lineHeight:1.5,marginBottom:8,display:'flex',alignItems:'center',gap:7}}><Landmark size={14} style={{color:teal[500]}}/> Bank Account Details</div>
              <textarea name="bankAccountDetails" value={formData.bankAccountDetails||''} onChange={handleChange} rows={3} placeholder="e.g. National Bank, 1234567890" style={{...inputStyle,resize:'none',minHeight:80}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
            </div>
          )}

          {activeTab==='additional'&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.08em',lineHeight:1.5,marginBottom:8,display:'flex',alignItems:'center',gap:7}}><FileText size={14} style={{color:teal[500]}}/> Internal Notes</div>
              <textarea name="notes" value={formData.notes||''} onChange={handleChange} rows={8} placeholder="e.g. Lead time is usually 3 days" style={{...inputStyle,resize:'none',minHeight:120}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
            </div>
          )}
        </div>
      </div>

      <DialogFooter style={{borderTop:`1px solid ${hairline}`,padding:'12px 20px 16px',background:paper,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <span style={{fontSize:11,fontWeight:600,color:inkSoft,lineHeight:1.5,fontFamily:mono}}>Supplier Record {isEditing?'[EDIT]':'[NEW]'}</span>
        <div style={{display:'flex',gap:8}}>
          <button type="button" onClick={onClose} style={btnGhost} onMouseEnter={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.color=teal[800];e.currentTarget.style.borderColor=teal[200]}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}>Cancel</button>
          <button type="submit" form="client-form" style={btnPrimary} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
            <Save size={16}/> {isEditing?'Save Changes':'Create Supplier'}
          </button>
        </div>
      </DialogFooter>
    </Dialog>
  );
};
