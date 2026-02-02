import React, { createContext, useContext } from 'react';

interface SubdomainContextType {
  clubId: string | null;
  isSubdomainMode: boolean;
}

const SubdomainContext = createContext<SubdomainContextType>({
  clubId: null,
  isSubdomainMode: false
});

export const SubdomainProvider: React.FC<{
  children: React.ReactNode;
  clubId: string | null;
  isSubdomainMode: boolean;
}> = ({ children, clubId, isSubdomainMode }) => {
  return (
    <SubdomainContext.Provider value={{ clubId, isSubdomainMode }}>
      {children}
    </SubdomainContext.Provider>
  );
};

export const useSubdomain = () => {
  return useContext(SubdomainContext);
};
