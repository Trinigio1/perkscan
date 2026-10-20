import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface OnboardingState {
  selected: string[];
  setSelected: (ids: string[]) => void;
}

const Ctx = createContext<OnboardingState>({ selected: [], setSelected: () => {} });
export const useOnboarding = () => useContext(Ctx);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  const value = useMemo(() => ({ selected, setSelected }), [selected]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
