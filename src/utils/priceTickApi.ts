import { format, subDays, parseISO, isWeekend, isFriday, isSameDay } from 'date-fns';

export interface PriceTick {
  dateTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dayVolume: number;
}

export interface PriceTicksResponse {
  data: {
    statistic: number;
    count: number;
    fields: string[];
    ticks: {
      [symbol: string]: Array<[string, number, number, number, number, number, number]>;
    };
  };
}

/**
 * Gets today's market open time (9:08 AM IST)
 * @returns Date object set to today's market open
 */
export const getTodayMarketOpen = (): Date => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Market opens at 9:08 AM IST (UTC+5:30)
  today.setHours(9, 8, 0, 0);
  return today;
};

/**
 * Gets today's market close time (3:30 PM IST)
 * @returns Date object set to today's market close
 */
export const getTodayMarketClose = (): Date => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Market closes at 3:30 PM IST (UTC+5:30)
  today.setHours(15, 30, 0, 0);
  return today;
};

/**
 * Checks if the market is currently open based on the specified hours (9:08 AM to 3:30 PM IST)
 * @returns boolean indicating if market is open
 */
export const isMarketOpen = (): boolean => {
  const now = new Date();
  const day = now.getDay();
  
  // Market is open Monday (1) to Friday (5)
  if (day === 0 || day === 6) return false; // Sunday (0) or Saturday (6) are always closed
  
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Market hours: 9:08 AM to 3:30 PM IST
  if (hours < 9 || (hours === 9 && minutes < 8)) {
    return false;
  }
  if (hours > 15 || (hours === 15 && minutes > 30)) {
    return false;
  }
  
  return true;
};

// Store for Friday's close price
let fridayClosePrice: number | null = null;
let lastFridayDate: Date | null = null;

/**
 * Gets the current date in IST timezone
 */
const getCurrentISTDate = (): Date => {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
};

/**
 * Formats date to YYYY-MM-DD string in local timezone
 */
const formatDateOnly = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Checks if two dates are the same day
 */
const isSameDayIST = (date1: Date, date2: Date): boolean => {
  return formatDateOnly(date1) === formatDateOnly(date2);
};

/**
 * Gets the most recent Friday's date
 */
const getLastFriday = (): Date => {
  const date = getCurrentISTDate();
  const day = date.getDay();
  const diff = (day + 2) % 7; // Days since last Friday
  const friday = new Date(date);
  friday.setDate(date.getDate() - diff);
  return friday;
};

/**
 * Fetches price ticks for a given symbol and date range
 * @param symbol The stock symbol (e.g., 'TAJGVK')
 * @param fromDate Start date (default: today's market open)
 * @param toDate End date (default: current time)
 * @param interval Candle interval (default: '1m')
 * @returns Promise with price ticks data
 */
export const fetchPriceTicks = async (
  symbol: string,
  fromDate?: Date,
  toDate?: Date,
  interval: string = '1m'
): Promise<PriceTicksResponse> => {
  try {
    const now = getCurrentISTDate();
    const day = now.getDay();
    let from: Date, to: Date;
    if ((day === 0 || day === 6) && !fromDate && !toDate) { // If weekend and no explicit dates
      // Get last Friday
      const lastFriday = new Date(now);
      // Go back to Friday
      lastFriday.setDate(now.getDate() - ((day === 0) ? 2 : 1));
      lastFriday.setHours(9, 8, 0, 0); // Market open time
      const fridayClose = new Date(lastFriday);
      fridayClose.setHours(15, 30, 0, 0); // Market close time
      from = lastFriday;
      to = fridayClose;
    } else {
      from = fromDate || getTodayMarketOpen();
      to = toDate || new Date();
    }
    
    // Format dates to match the required API format (YYYY-MM-DDTHH:mm:ss+05:30)
    const formatForApi = (date: Date) => {
      const pad = (num: number) => num.toString().padStart(2, '0');
      // Format as: YYYY-MM-DDTHH:mm:ss+05:30
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}%3A${pad(date.getMinutes())}%3A${pad(date.getSeconds())}%2B05%3A30`;
    };
    const fromStr = formatForApi(from);
    const toStr = formatForApi(to);
    const encodedSymbol = `EQ%3A${symbol.toUpperCase()}`;
    const url = `https://api-prod-v21.strike.money/v2/api/equity/priceticks?candleInterval=${interval}&from=${fromStr}&to=${toStr}&securities=${encodedSymbol}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add any required authentication headers here if needed
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Store Friday's close price if today is Friday and market is closed
    // This logic is still relevant for potential caching but won't prevent calls
    if (isFriday(now) && now > getTodayMarketClose()) {
      const ticks = data.data.ticks[symbol];
      if (ticks && ticks.length > 0) {
        const lastTick = ticks[ticks.length - 1];
        if (lastTick && lastTick[4]) { // index 4 is close price
          fridayClosePrice = lastTick[4];
          lastFridayDate = new Date(now);
          // You might want to store this in localStorage for persistence across page reloads
          if (typeof window !== 'undefined') {
            localStorage.setItem('fridayClosePrice', fridayClosePrice.toString());
            localStorage.setItem('lastFridayDate', lastFridayDate.toISOString());
          }
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching price ticks:', error);
    throw error;
  }
};
