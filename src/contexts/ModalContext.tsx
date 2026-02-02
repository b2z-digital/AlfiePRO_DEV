import React, { createContext, useContext, useReducer, ReactNode } from 'react';

interface ModalState {
  activeModals: string[];
}

type ModalAction = 
  | { type: 'OPEN_MODAL'; id: string }
  | { type: 'CLOSE_MODAL'; id: string };

const ModalContext = createContext<{
  state: ModalState;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
} | null>(null);

const modalReducer = (state: ModalState, action: ModalAction): ModalState => {
  switch (action.type) {
    case 'OPEN_MODAL':
      return {
        ...state,
        activeModals: [...state.activeModals, action.id]
      };
    case 'CLOSE_MODAL':
      return {
        ...state,
        activeModals: state.activeModals.filter(id => id !== action.id)
      };
    default:
      return state;
  }
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(modalReducer, { activeModals: [] });

  const openModal = (id: string) => {
    dispatch({ type: 'OPEN_MODAL', id });
  };

  const closeModal = (id: string) => {
    dispatch({ type: 'CLOSE_MODAL', id });
  };

  return (
    <ModalContext.Provider value={{ state, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};