import { useState, useEffect, useRef } from 'react';

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
const POLL_INTERVAL = 30_000;

export function useSolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch(COINGECKO_URL);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.solana?.usd) {
          setPrice(data.solana.usd);
          setLoading(false);
        }
      } catch {
        // Silently fail — keep last known price
      }
    }

    fetchPrice();
    intervalRef.current = setInterval(fetchPrice, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, []);

  return { price, loading };
}
