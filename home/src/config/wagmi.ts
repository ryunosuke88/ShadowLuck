import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'ShadowLuck Lottery',
  projectId: 'c1bf1dc9f2c84586b8ad90f46c1d822a',
  chains: [sepolia],
  ssr: false,
});
