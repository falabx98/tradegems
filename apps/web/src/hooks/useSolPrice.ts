import { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOL_PRICE_URL = `${API_BASE}/v1/sol-price`;
const POLL_INTERVAL = 30_000;

export function useSolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch(SOL_PRICE_URL);
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
