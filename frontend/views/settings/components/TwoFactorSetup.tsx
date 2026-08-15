import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import QRCode from 'qrcode';
import { 
  ShieldCheck, Smartphone, CheckCircle2, 
  AlertCircle, Copy, RefreshCw, Lock,
  ChevronRight, X
} from 'lucide-react';

interface TwoFactorSetupProps {
  onComplete: (secret: string) => void;
  onCancel: () => void;
}

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const generateSecret = async () => {
      // Mocking secret generation
      const newSecret = Array.from({ length: 16 }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.charAt(Math.floor(Math.random() * 32))
      ).join('');
      setSecret(newSecret);

      const otpauthUrl = `otpauth://totp/PrimeERP:Admin?secret=${newSecret}&issuer=PrimeERP`;
      try {
        const url = await QRCode.toDataURL(otpauthUrl);
        setQrCodeUrl(url);
      } catch (err) {
        logger.error('Failed to generate QR code', err);
      }
    };

    generateSecret();
  }, []);

  const handleVerify = async () => {
    setIsVerifying(true);
    setError('');
    
    // Simulating verification (in a real app, send to backend)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In demo mode, accept 123456
    if (verificationCode === '123456') { 
      onComplete(secret);
    } else {
      setError('Invalid verification code. Please try again.');
    }
    setIsVerifying(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(secret);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden max-w-lg w-full animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <ShieldCheck size={20} />
              </div>
              <div>
                  <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Two-Factor Authentication</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-0.5">Step {step} of 3</p>
              </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-2 transition-colors" title="Cancel" aria-label="Cancel 2FA setup"><X size={20}/></button>
        </div>

        <div className="p-10">
          {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-4">
                      <Smartphone className="text-blue-600 shrink-0" size={24} />
                      <p className="text-sm font-bold text-blue-900 leading-relaxed">
                          Secure your account by requiring a code from your authentication app (Google Authenticator, Authy, etc).
                      </p>
                  </div>
                  <div className="space-y-2">
                      <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest">Why enable 2FA?</h4>
                      <ul className="space-y-3">
                          {['Prevent unauthorized access', 'Protect sensitive financial data', 'Multi-layered account security'].map((item, i) => (
                              <li key={i} className="flex items-center gap-3 text-xs font-bold text-slate-600">
                                  <CheckCircle2 size={14} className="text-emerald-500" /> {item}
                              </li>
                          ))}
                      </ul>
                  </div>
                  <button 
                      onClick={() => setStep(2)}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                      Get Started <ChevronRight size={16} />
                  </button>
              </div>
          )}

          {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex flex-col items-center">
                      <div className="p-4 bg-white border-4 border-slate-900 rounded-3xl shadow-2xl mb-6">
                          {qrCodeUrl ? (
                              <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
                          ) : (
                              <div className="w-48 h-48 flex items-center justify-center bg-slate-50 animate-pulse rounded-2xl">
                                  <RefreshCw className="text-slate-300 animate-spin" size={32} />
                              </div>
                          )}
                      </div>
                      <p className="text-center text-xs font-bold text-slate-500 leading-relaxed">
                          Scan this QR code with your authenticator app.
                      </p>
                  </div>

                  <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Manual Setup Key</label>
                      <div className="flex gap-2">
                          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-900 tracking-widest text-sm flex items-center overflow-hidden">
                              {secret}
                          </div>
                          <button 
                              onClick={copyToClipboard}
                              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition-all active:scale-95"
                              title="Copy Secret"
                          >
                              <Copy size={18} />
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <button 
                          onClick={() => setStep(1)}
                          className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all active:scale-[0.98]"
                      >
                          Back
                      </button>
                      <button 
                          onClick={() => setStep(3)}
                          className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all active:scale-[0.98]"
                      >
                          I've Scanned It
                      </button>
                  </div>
              </div>
          )}

          {step === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center px-4">
                      <div className="w-16 h-16 bg-blue-100 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6">
                          <Lock size={32} />
                      </div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight mb-2 uppercase">Verify Connection</h4>
                      <p className="text-xs font-bold text-slate-500 leading-relaxed px-4">
                          Enter the 6-digit verification code from your authenticator app to complete setup.
                      </p>
                  </div>

                  <div className="space-y-6">
                      <div className="relative">
                          <input 
                              type="text"
                              maxLength={6}
                              value={verificationCode}
                              onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="e.g. 123456"
                              className="w-full text-center text-4xl font-black tracking-[0.5em] py-6 bg-slate-50 border-2 border-slate-200 rounded-3xl outline-none focus:border-blue-500 transition-all tabular-nums text-slate-900 placeholder:text-slate-200"
                              autoFocus
                          />
                      </div>

                      {error && (
                          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 font-bold text-xs animate-in shake-in duration-300">
                              <AlertCircle size={16} /> {error}
                          </div>
                      )}

                      <div className="flex gap-4 pt-4">
                          <button 
                              onClick={() => setStep(2)}
                              className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all active:scale-[0.98]"
                          >
                              Back
                          </button>
                          <button 
                              onClick={handleVerify}
                              disabled={verificationCode.length !== 6 || isVerifying}
                              className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98]"
                          >
                              {isVerifying ? <RefreshCw size={16} className="animate-spin" /> : 'Complete Setup'}
                          </button>
                      </div>

                      <p className="text-center text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                          Tip: Use "123456" to verify
                      </p>
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
