import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PriceTick, fetchPriceTicks, getTodayMarketOpen, isMarketOpen } from '../utils/priceTickApi';
import { isWeekend } from 'date-fns';

interface ProcessedTick extends Omit<PriceTick, 'dateTime'> {
  dateTime: string;
  timestamp: number;
}

export const usePriceTicks = (symbol: string) => {
  const [priceTicks, setPriceTicks] = useState<ProcessedTick[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  const processTicks = useCallback((data: any): ProcessedTick[] => {
    if (!data?.data?.ticks?.[symbol]) return [];
    
    return data.data.ticks[symbol].map((tick: any) => ({
      dateTime: tick[0],
      timestamp: new Date(tick[0]).getTime(),
      open: tick[1],
      high: tick[2],
      low: tick[3],
      close: tick[4],
      volume: tick[5],
      dayVolume: tick[6]
    }));
  }, [symbol]);

  // Fetch data for the current market session
  const fetchTicks = useCallback(async (fromDate?: Date, toDate?: Date) => {
    if (!symbol || !isMounted.current) {
      console.log('[usePriceTicks] No symbol provided or component unmounted');
      return [];
    }
    
    console.log(`[usePriceTicks] Attempting to fetch ticks for symbol: ${symbol}`); // Log before fetchPriceTicks
    setLoading(true);
    setError(null);
    
    try {
      console.log(`[usePriceTicks] Calling fetchPriceTicks for ${symbol}`); // Log just before calling fetch
      const data = await fetchPriceTicks(symbol, fromDate, toDate);
      console.log('[usePriceTicks] Received data:', data);
      const processed = processTicks(data);
      console.log('[usePriceTicks] Processed ticks:', processed);
      
      if (isMounted.current) {
        setPriceTicks(processed);
        setLastUpdated(new Date());
      }
      
      return processed;
    } catch (err) {
      if (isMounted.current) {
        console.error('[usePriceTicks] Error fetching price ticks:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch price ticks'));
      }
      return [];
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [symbol, processTicks]);

  // Stop polling
  const stopPolling = useCallback(() => {
    console.log('[usePriceTicks] Stopping polling.');
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Start polling with conditional interval
  const startPolling = useCallback(() => {
    // Clear any existing interval first
    stopPolling();

    const now = new Date();
    const pollingInterval = isMarketOpen() ? 60000 : 600000; // 1 minute if open, 10 minutes if closed
    const marketStatus = isMarketOpen() ? 'Open' : 'Closed';

    console.log(`[usePriceTicks] Starting polling for ${symbol} with interval: ${pollingInterval / 1000}s (Market: ${marketStatus})`);

    // Initial fetch
    fetchTicks(getTodayMarketOpen(), now);
    
    // Set up polling
    pollingIntervalRef.current = setInterval(() => {
      const currentNow = new Date();
      const currentMarketStatus = isMarketOpen() ? 'Open' : 'Closed';
      const currentPollingInterval = isMarketOpen() ? 60000 : 600000; // Re-check interval just in case

      // If market status or required interval changed, clear and restart polling
      if ((marketStatus !== currentMarketStatus) || (pollingInterval !== currentPollingInterval)) {
          console.log(`[usePriceTicks] Market status or interval changed. Restarting polling. Old: ${marketStatus}, ${pollingInterval/1000}s. New: ${currentMarketStatus}, ${currentPollingInterval/1000}s`);
          stopPolling();
          startPolling(); // Restart with new interval
          return; // Exit current interval tick
      }

      console.log(`[usePriceTicks] Polling for ${symbol}... (Market: ${currentMarketStatus})`);
      fetchTicks(getTodayMarketOpen(), currentNow);
    }, pollingInterval); // Use the determined interval
    
    return () => {
      stopPolling();
    };
  }, [symbol, fetchTicks, stopPolling]); // Added stopPolling to dependencies

  // Initialize and clean up
  useEffect(() => {
    isMounted.current = true;
    // Only start polling if a symbol is provided
    if (symbol) {
      startPolling();
    }
    
    return () => {
      isMounted.current = false;
      stopPolling();
    };
  }, [symbol, startPolling]); // symbol dependency ensures polling restarts if symbol changes

  // Function to refresh data
  const refresh = useCallback((fromDate?: Date, toDate?: Date) => {
    return fetchTicks(fromDate, toDate);
  }, [fetchTicks]);

  // Get the latest price
  const latestPrice = useMemo(() => {
    if (priceTicks.length === 0) return null;
    // Ensure the last tick is for the current symbol if the symbol changes rapidly
    const lastTick = priceTicks[priceTicks.length - 1];
     // Basic check if the tick data structure looks plausible
    if (Array.isArray((lastTick as any).ticks?.[symbol]) && (lastTick as any).ticks[symbol].length > 0) {
       const symbolTicks = (lastTick as any).ticks[symbol];
       const latest = symbolTicks[symbolTicks.length - 1];
       // Assuming index 4 is the close price based on PriceTicksResponse interface
       if (latest && typeof latest[4] === 'number'){
          // Create a simplified object matching ProcessedTick structure
          return { 
            dateTime: latest[0] || '', // Date string
            timestamp: new Date(latest[0] || '').getTime(), // Timestamp
            open: latest[1] || 0,
            high: latest[2] || 0,
            low: latest[3] || 0,
            close: latest[4] || 0, // Correct: Access close price from array index 4
            volume: latest[5] || 0,
            dayVolume: latest[6] || 0,
            // Include other properties from the main tick object if needed, but be cautious with types
             ...(typeof lastTick === 'object' && lastTick !== null ? lastTick : {})
          };
       }
    } else if (lastTick && typeof lastTick.close === 'number') {
       // Fallback for the processed tick structure if API response format changes or mock data is used
       return lastTick;
    }
    return null;
  }, [priceTicks, symbol]); // Add symbol dependency

  // Get price at a specific time
  const getPriceAtTime = useCallback((timestamp: Date): ProcessedTick | null => {
    if (priceTicks.length === 0) return null;
    
    const targetTime = timestamp.getTime();
    
    // Find the closest timestamp
    return priceTicks.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.timestamp - targetTime);
      const currDiff = Math.abs(curr.timestamp - targetTime);
      return prevDiff < currDiff ? prev : curr;
    });
  }, [priceTicks]);

  // Get price change percentage
  const priceChange = useMemo(() => {
    if (priceTicks.length < 2) return 0;
    const first = priceTicks[0].close;
    const last = priceTicks[priceTicks.length - 1].close;
    return ((last - first) / first) * 100;
  }, [priceTicks]);

  // Get today's market open time (9:08 AM IST)
  const getTodayMarketOpen = useCallback((): Date => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Market opens at 9:08 AM IST (UTC+5:30)
    today.setHours(9, 8, 0, 0);
    return today;
  }, []);

  return {
    priceTicks,
    latestPrice,
    loading,
    error,
    lastUpdated,
    refresh,
    getPriceAtTime,
    priceChange
  };
};
