import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { Header } from './Header';
import { LOTTERY_ABI, LOTTERY_ADDRESS, REWARD_TOKEN_ABI, REWARD_TOKEN_ADDRESS } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import '../styles/Lottery.css';

type LastResultTuple = readonly [string, string, string, bigint, boolean];

type DecryptedState = {
  score?: string;
  lastReward?: string;
  drawOne?: string;
  drawTwo?: string;
  tokenBalance?: string;
};

export function LotteryApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading } = useZamaInstance();

  const hasContracts =
    LOTTERY_ADDRESS !== ethers.ZeroAddress && REWARD_TOKEN_ADDRESS !== ethers.ZeroAddress;

  const [firstNumber, setFirstNumber] = useState(1);
  const [secondNumber, setSecondNumber] = useState(2);
  const [status, setStatus] = useState<string | null>(
    hasContracts ? null : 'Contract addresses are not configured'
  );
  const [isBuying, setIsBuying] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [decrypted, setDecrypted] = useState<DecryptedState>({});

  const { data: ticketPrice } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: 'ticketPrice',
    query: { enabled: hasContracts },
  });

  const { data: ticketData, refetch: refetchTicket } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: 'getTicket',
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasContracts },
  });

  const { data: scoreData, refetch: refetchScore } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: 'getEncryptedScore',
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasContracts },
  });

  const { data: lastResultData, refetch: refetchResult } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: 'getLastResult',
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasContracts },
  });

  const { data: tokenBalance } = useReadContract({
    address: REWARD_TOKEN_ADDRESS,
    abi: REWARD_TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasContracts },
  });

  const activeTicket = useMemo(() => {
    if (!ticketData) return null;
    const typed = ticketData as readonly [string, string, boolean];
    return { first: typed[0], second: typed[1], isActive: typed[2] };
  }, [ticketData]);

  const ticketPriceLabel = ticketPrice ? `${ethers.formatEther(ticketPrice as bigint)} ETH` : '0.001 ETH';
  const cipherScore = scoreData ? String(scoreData) : '';
  const cipherLastReward = lastResultData ? (lastResultData as LastResultTuple)[2] : '';
  const cipherTokenBalance = tokenBalance ? String(tokenBalance) : '';

  const statusColor =
    status && (status.toLowerCase().includes('error') || status.toLowerCase().includes('not configured'))
      ? 'status-error'
      : 'status-success';

  const handleBuy = async () => {
    if (!hasContracts) {
      setStatus('Contract addresses are not configured');
      return;
    }

    if (!address || !instance) {
      setStatus('Connect wallet and wait for Zama init before buying');
      return;
    }

    if (![firstNumber, secondNumber].every((value) => value >= 1 && value <= 9)) {
      setStatus('Ticket numbers must be between 1 and 9');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatus('Wallet signer unavailable');
      return;
    }

    setIsBuying(true);
    setStatus('Encrypting your picks...');

    try {
      const encryptedInput = await instance
        .createEncryptedInput(LOTTERY_ADDRESS, address)
        .add8(firstNumber)
        .add8(secondNumber)
        .encrypt();

      const contract = new Contract(LOTTERY_ADDRESS, LOTTERY_ABI, signer);
      const tx = await contract.buyTicket(
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.inputProof,
        { value: ticketPrice ?? ethers.parseEther('0.001') }
      );

      setStatus('Waiting for settlement...');
      await tx.wait();
      setStatus('Ticket locked in. Good luck!');
      await Promise.all([refetchTicket(), refetchScore(), refetchResult()]);
    } catch (error) {
      console.error(error);
      setStatus('Error: unable to submit ticket');
    } finally {
      setIsBuying(false);
    }
  };

  const handleDraw = async () => {
    if (!hasContracts) {
      setStatus('Contract addresses are not configured');
      return;
    }

    if (!address) {
      setStatus('Connect wallet to start the draw');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatus('Wallet signer unavailable');
      return;
    }

    setIsDrawing(true);
    setStatus('Rolling encrypted numbers...');

    try {
      const contract = new Contract(LOTTERY_ADDRESS, LOTTERY_ABI, signer);
      const tx = await contract.playRound();
      await tx.wait();
      setStatus('Draw complete. Decrypt to see your result.');
      await Promise.all([refetchResult(), refetchScore(), refetchTicket()]);
    } catch (error) {
      console.error(error);
      setStatus('Error: draw failed. Check your active ticket.');
    } finally {
      setIsDrawing(false);
    }
  };

  const decryptState = async () => {
    if (!hasContracts) {
      setStatus('Contract addresses are not configured');
      return;
    }

    if (!instance || !address) {
      setStatus('Connect wallet to decrypt values');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatus('Wallet signer unavailable');
      return;
    }

    const pairs: Array<{ handle: string; contractAddress: string }> = [];
    if (scoreData && scoreData !== ethers.ZeroHash) {
      pairs.push({ handle: scoreData as string, contractAddress: LOTTERY_ADDRESS });
    }
    if (lastResultData) {
      const [drawOne, drawTwo, reward] = lastResultData as LastResultTuple;
      if (drawOne && drawOne !== ethers.ZeroHash) {
        pairs.push({ handle: drawOne, contractAddress: LOTTERY_ADDRESS });
      }
      if (drawTwo && drawTwo !== ethers.ZeroHash) {
        pairs.push({ handle: drawTwo, contractAddress: LOTTERY_ADDRESS });
      }
      if (reward && reward !== ethers.ZeroHash) {
        pairs.push({ handle: reward, contractAddress: LOTTERY_ADDRESS });
      }
    }
    if (tokenBalance && tokenBalance !== ethers.ZeroHash) {
      pairs.push({ handle: tokenBalance as string, contractAddress: REWARD_TOKEN_ADDRESS });
    }

    if (pairs.length === 0) {
      setStatus('Nothing to decrypt yet.');
      return;
    }

    setDecrypting(true);
    setStatus('Requesting decryption from relayer...');

    try {
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [LOTTERY_ADDRESS, REWARD_TOKEN_ADDRESS];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await (await signer).signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        pairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const lastResultTyped = lastResultData as LastResultTuple | undefined;
      setDecrypted({
        score: scoreData ? result[scoreData as string] : undefined,
        lastReward: lastResultTyped ? result[lastResultTyped[2] as string] : undefined,
        drawOne: lastResultTyped ? result[lastResultTyped[0] as string] : undefined,
        drawTwo: lastResultTyped ? result[lastResultTyped[1] as string] : undefined,
        tokenBalance: tokenBalance ? result[tokenBalance as string] : undefined,
      });
      setStatus('Decryption complete.');
    } catch (error) {
      console.error(error);
      setStatus('Decryption failed. Please try again.');
    } finally {
      setDecrypting(false);
    }
  };

  const formatAmount = (value?: string) => {
    if (!value) return '—';
    return `${ethers.formatEther(BigInt(value))} WETH`;
  };

  const formatDraw = (value?: string) => {
    if (!value) return '—';
    return Number(value).toString();
  };

  const displayCipher = (value?: string | null) => {
    if (!value) return 'No ciphertext yet';
    return `${value.slice(0, 18)}...${value.slice(-6)}`;
  };

  return (
    <div className="app-shell">
      <Header />

      <section className="page-hero">
        <div className="two-column">
          <div>
            <h1 className="hero-title">Pick two numbers, win encrypted WETH.</h1>
            <p className="hero-copy">
              Tickets cost {ticketPriceLabel}. Every draw generates two FHE-powered random numbers and mints WETH
              rewards when you match.
            </p>
            <div className="hero-badges">
              <span className="badge">Encrypted inputs</span>
              <span className="badge">Randomized draws</span>
              <span className="badge">
                Reward token:{' '}
                {hasContracts
                  ? `${REWARD_TOKEN_ADDRESS.slice(0, 6)}...${REWARD_TOKEN_ADDRESS.slice(-4)}`
                  : 'not deployed'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="lottery-grid">
        <div className="panel">
          <h3>1. Choose your encrypted ticket</h3>
          <p>Pick two numbers between 1 and 9. They are encrypted in your browser before reaching the contract.</p>

          <div className="input-row">
            <div style={{ flex: 1 }}>
              <div className="cipher-label">First number</div>
              <div className="number-picker">
                {Array.from({ length: 9 }).map((_, idx) => {
                  const value = idx + 1;
                  return (
                    <button
                      key={value}
                      className={`number-button ${firstNumber === value ? 'selected' : ''}`}
                      onClick={() => setFirstNumber(value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="cipher-label">Second number</div>
              <div className="number-picker">
                {Array.from({ length: 9 }).map((_, idx) => {
                  const value = idx + 1;
                  return (
                    <button
                      key={value}
                      className={`number-button ${secondNumber === value ? 'selected' : ''}`}
                      onClick={() => setSecondNumber(value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="actions">
            <button
              className="primary-button"
              onClick={handleBuy}
              disabled={!isConnected || isBuying || zamaLoading || !hasContracts}
            >
              {isBuying ? 'Submitting ticket...' : `Buy ticket (${ticketPriceLabel})`}
            </button>
            <div className="pill">Encrypted price locked at 0.001 ETH</div>
          </div>

          <div className="cipher-box">
            <span className="cipher-label">Active ticket</span>
            {activeTicket?.isActive ? (
              <>
                <div>First pick: {displayCipher(activeTicket.first)}</div>
                <div>Second pick: {displayCipher(activeTicket.second)}</div>
              </>
            ) : (
              <div className="empty-state">No active ticket. Submit numbers to join the next draw.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <h3>2. Start the draw</h3>
          <p>We generate two random encrypted numbers. Rewards: 0.001 WETH for one match, 0.01 WETH for two.</p>

          <div className="actions">
            <button
              className="primary-button"
              onClick={handleDraw}
              disabled={!isConnected || !activeTicket?.isActive || isDrawing || !hasContracts}
            >
              {isDrawing ? 'Drawing...' : 'Start draw'}
            </button>
            <button
              className="ghost-button"
              onClick={decryptState}
              disabled={decrypting || zamaLoading || !hasContracts}
            >
              {decrypting ? 'Decrypting...' : 'Decrypt my numbers'}
            </button>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <div className="metric-title">Encrypted draw #1</div>
              <div className="metric-value">{lastResultData ? displayCipher((lastResultData as LastResultTuple)[0]) : '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-title">Encrypted draw #2</div>
              <div className="metric-value">{lastResultData ? displayCipher((lastResultData as LastResultTuple)[1]) : '—'}</div>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <div className="metric-title">Encrypted last reward</div>
              <div className="metric-value">{cipherLastReward ? displayCipher(cipherLastReward) : '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-title">Round count</div>
              <div className="metric-value">{lastResultData ? (lastResultData as LastResultTuple)[3].toString() : '0'}</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>3. Track encrypted balances</h3>
          <p>Your winnings are stored in the ShadowLuck contract and minted as confidential WETH.</p>

          <div className="metric-grid">
            <div className="metric">
              <div className="metric-title">Encrypted score</div>
              <div className="metric-value">{cipherScore ? displayCipher(cipherScore) : 'No score yet'}</div>
            </div>
            <div className="metric">
              <div className="metric-title">Encrypted WETH balance</div>
              <div className="metric-value">{cipherTokenBalance ? displayCipher(cipherTokenBalance) : '—'}</div>
            </div>
          </div>

          <div className="decrypted-grid">
            <div className="decrypted-card">
              <div className="cipher-label">Decrypted score</div>
              <div className="metric-value">{formatAmount(decrypted.score)}</div>
            </div>
            <div className="decrypted-card">
              <div className="cipher-label">Decrypted last reward</div>
              <div className="metric-value">{formatAmount(decrypted.lastReward)}</div>
            </div>
            <div className="decrypted-card">
              <div className="cipher-label">Decrypted draw #1</div>
              <div className="metric-value">{formatDraw(decrypted.drawOne)}</div>
            </div>
            <div className="decrypted-card">
              <div className="cipher-label">Decrypted draw #2</div>
              <div className="metric-value">{formatDraw(decrypted.drawTwo)}</div>
            </div>
            <div className="decrypted-card">
              <div className="cipher-label">Decrypted WETH balance</div>
              <div className="metric-value">{formatAmount(decrypted.tokenBalance)}</div>
            </div>
          </div>

          <div className={`status-note ${statusColor}`}>{status || 'Ready to play. All operations stay on-chain.'}</div>
        </div>
      </div>
    </div>
  );
}
