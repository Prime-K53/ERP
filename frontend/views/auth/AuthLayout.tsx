import React from 'react';
import { Receipt, ShieldCheck, BarChart3, FileText, Users, Globe } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
};

const AuthLayout: React.FC<Props> = ({ children, title, subtitle, showBrand = true }) => {
  return (
    <div className="min-h-screen bg-[#070B17] font-sans flex">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-indigo-600/15 to-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-amber-500/10 to-slate-800/20 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(circle, #818CF8 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      {showBrand && (
        <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] relative bg-gradient-to-br from-[#0B1121] via-[#0F1A2E] to-[#0B1121] flex-col justify-between p-12 xl:p-16 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-indigo-600/25 via-sky-500/10 to-transparent rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4" />

          <div className="relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Receipt size={24} className="text-white" />
              </div>
              <div>
                <div className="text-white font-bold text-xl tracking-tight">Prime ERP</div>
                <div className="text-[11px] text-amber-300/90 uppercase tracking-[0.2em] font-semibold">Enterprise Suite</div>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg">
            <h2 className="text-4xl xl:text-[2.75rem] font-bold text-white tracking-tight leading-[1.15]">
              {title || 'Welcome to Prime ERP'}
            </h2>
            {subtitle && <p className="mt-5 text-[15px] text-slate-300 leading-relaxed max-w-md">{subtitle}</p>}

            <div className="mt-10 grid grid-cols-2 gap-4">
              {[
                { icon: BarChart3, label: 'Financial Intelligence', desc: 'Real-time reporting' },
                { icon: FileText, label: 'Smart Invoicing', desc: 'Automated workflows' },
                { icon: Users, label: 'Role-Based Access', desc: 'Enterprise security' },
                { icon: Globe, label: 'Multi-Currency', desc: 'Global operations' },
              ].map((feature) => (
                <div key={feature.label} className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/[0.08] backdrop-blur-sm">
                  <feature.icon size={18} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-white">{feature.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} />
            <span>Secure enterprise-grade platform</span>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16 relative z-10">
        <div className="w-full max-w-[420px] h-full max-h-[calc(100vh-3rem)] overflow-y-auto custom-scrollbar">
          {showBrand && (
            <div className="lg:hidden flex items-center gap-3 mb-10">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Receipt size={22} className="text-white" />
              </div>
              <div>
                <div className="text-slate-100 font-bold text-lg tracking-tight">Prime ERP</div>
                <div className="text-[10px] text-amber-400 uppercase tracking-[0.18em] font-semibold">Enterprise Suite</div>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
