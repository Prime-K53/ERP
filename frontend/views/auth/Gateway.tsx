import React from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Building2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { getPortalSession } from '../../services/portalApiClient';

const Gateway: React.FC = () => {
  const navigate = useNavigate();

  // Customers who already signed in this browser go straight to their portal.
  if (getPortalSession()?.access_token) {
    return <Navigate to="/portal/dashboard" replace />;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[var(--dashboard-bg)] font-sans">
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-teal-500/10 to-emerald-400/5 rounded-full blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-500/10 to-teal-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="w-full max-w-[960px] relative z-10">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(160deg, #3fa294, #0f544c)' }}>
              <Lock size={22} />
            </div>
            <div>
              <div className="font-bold text-xl tracking-tight" style={{ color: '#23282A' }}>
                Prime<span style={{ color: '#b97e2b' }}>ERP</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#5c6567' }}>Welcome</div>
            </div>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-[2rem] font-bold tracking-tight leading-snug" style={{ color: '#23282A' }}>
              How would you like to sign in?
            </h1>
            <p className="mt-2 text-sm" style={{ color: '#5c6567' }}>
              Customers manage invoices, orders and statements in the portal. Staff run the business from the dashboard.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Customer Portal */}
            <button
              onClick={() => navigate('/portal/login')}
              className="group text-left bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(155deg, #1f8577, #0f544c)', boxShadow: '0 8px 20px rgba(15,84,76,.25)' }}>
                  <Building2 size={24} />
                </div>
                <ArrowRight size={18} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-lg font-bold tracking-tight" style={{ color: '#23282A' }}>Customer Portal</h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5c6567' }}>
                View your invoices, orders, quotations, statements and wallet. If you received an invite, use the <strong>Activate Account</strong> tab to set your password.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(90deg, #146b60, #3fa294)' }}>
                Continue to Portal
              </span>
            </button>

            {/* Staff */}
            <button
              onClick={() => navigate('/login')}
              className="group text-left bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(155deg, #4f46e5, #3730a3)', boxShadow: '0 8px 20px rgba(55,48,163,.25)' }}>
                  <ShieldCheck size={24} />
                </div>
                <ArrowRight size={18} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-lg font-bold tracking-tight" style={{ color: '#23282A' }}>Staff Sign In</h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5c6567' }}>
                Authorized team members only. Manage sales, inventory, procurement, accounts and every part of the business.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(90deg, #4338ca, #6366f1)' }}>
                Staff Sign In
              </span>
            </button>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-200 text-center space-y-1.5">
            <p className="text-xs" style={{ color: '#5c6567' }}>
              <Link to="/setup" className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: '#4338ca' }}>
                <Sparkles size={12} />
                New to Prime ERP? Start your workspace here
              </Link>
            </p>
            <p className="text-[11px] text-slate-400">
              PrimeERP — Powered by AI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Gateway;
