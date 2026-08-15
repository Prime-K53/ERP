/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./App.tsx","./index.tsx","./components/**/*.{js,ts,jsx,tsx}","./context/**/*.{js,ts,jsx,tsx}","./hooks/**/*.{js,ts,jsx,tsx}","./services/**/*.{js,ts,jsx,tsx}","./stores/**/*.{js,ts,jsx,tsx}","./utils/**/*.{js,ts,jsx,tsx}","./views/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        brand: { sidebar: '#FFF', accent: '#2563EB', bg: '#F8FAFC', blue: '#2563EB', text: '#1E293B', primary: '#2563EB', secondary: '#64748B', success: '#10B981', danger: '#EF4444', warning: '#F59E0B', info: '#3B82F6' },
        zoho: { blue: '#0086FF', gray: '#64748B', light: '#F5F7F9', border: '#E2E8F0', dark: '#1E293B', hover: '#0070D6', active: '#EBF5FF', text: '#334155', muted: '#94A3B8', sidebar: '#111C44' }
      },
      boxShadow: { soft: '0 4px 20px -2px rgba(0,0,0,0.05)', card: '0 10px 30px -5px rgba(0,0,0,0.04)', float: '0 20px 40px -10px rgba(0,0,0,0.08)', premium: '0 25px 50px -12px rgba(0,0,0,0.15)', glass: '0 8px 32px 0 rgba(31,38,135,0.07)' },
      borderRadius: { '4xl': '2.5rem', '5xl': '3rem' },
      animation: { 'toast-in': 'toastIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards', 'fade-in': 'fadeIn 0.3s ease-out forwards', 'check-pop': 'checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', 'slide-up': 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards', 'slide-down': 'slideDown 0.5s cubic-bezier(0.16,1,0.3,1) forwards', 'float': 'float 6s ease-in-out infinite', 'progress-indeterminate': 'progressIndeterminate 2s cubic-bezier(0.4, 0, 0.2, 1) infinite', 'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite' },
      keyframes: {
        progressIndeterminate: { '0%': { transform: 'translateX(-100%)' }, '50%': { transform: 'translateX(0%)' }, '100%': { transform: 'translateX(100%)' } },
        pulseSubtle: { '0%,100%': { transform: 'scale(1)', opacity: '1' }, '50%': { transform: 'scale(1.02)', opacity: '0.9' } },
        toastIn: { '0%': { transform: 'translateY(1rem)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        checkPop: { '0%': { transform: 'scale(0) rotate(-45deg)', opacity: '0' }, '70%': { transform: 'scale(1.3) rotate(10deg)' }, '100%': { transform: 'scale(1) rotate(0)', opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideDown: { '0%': { transform: 'translateY(-20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-20px)' } }
      }
    }
  },
  plugins: [],
}
