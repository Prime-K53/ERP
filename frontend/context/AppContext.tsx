import React, { createContext, useContext, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface AppContextValue {
  companyConfig: any;
  notify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  isOnline: boolean;
  user: any;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { companyConfig, notify, isOnline, user } = useAuth();

  return (
    <AppContext.Provider value={{ companyConfig, notify, isOnline, user }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export default AppContext;
