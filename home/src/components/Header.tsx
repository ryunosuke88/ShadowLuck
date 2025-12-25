import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">SL</div>
        <div>
          <div className="brand-title">ShadowLuck Lottery</div>
          <div className="brand-subtitle">Encrypted draws with WETH rewards</div>
        </div>
      </div>
      <ConnectButton />
    </header>
  );
}
