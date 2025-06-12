import { useState, useEffect, useCallback } from 'react';
import { ALL_MILESTONES, Milestone } from '../utils/milestones';
import { useTrades } from './use-trades';
import { useTruePortfolio } from '../utils/TruePortfolioContext';
import { useAccountingMethod } from '../context/AccountingMethodContext';

interface AchievedMilestone extends Milestone {
  achievedAt: string; // ISO date string
}

const LOCAL_STORAGE_KEY = 'achievedMilestones';

export const useMilestones = () => {
  const { trades } = useTrades();
  const { getAllMonthlyTruePortfolios, portfolioSize, yearlyStartingCapitals } = useTruePortfolio();
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  // Get monthly portfolios with accounting method-aware calculations
  const monthlyPortfolios = getAllMonthlyTruePortfolios(trades, useCashBasis);

  const [achievedMilestones, setAchievedMilestones] = useState<AchievedMilestone[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading achieved milestones from localStorage:', error);
      return [];
    }
  });

  const checkAndAwardMilestones = useCallback(() => {
    const newlyAchieved: AchievedMilestone[] = [];

    ALL_MILESTONES.forEach(milestone => {
      // Check if already achieved
      const alreadyAchieved = achievedMilestones.some(a => a.id === milestone.id);

      if (!alreadyAchieved) {
        // Check if criteria is met with accounting method-aware data
        if (milestone.criteria(trades, monthlyPortfolios, portfolioSize, yearlyStartingCapitals, useCashBasis)) {
          newlyAchieved.push({
            ...milestone,
            achievedAt: new Date().toISOString(),
          });
        }
      }
    });

    if (newlyAchieved.length > 0) {
      setAchievedMilestones(prev => {
        const updated = [...prev, ...newlyAchieved];
        // Ensure uniqueness and sort by achievedAt
        const uniqueAndSorted = Array.from(new Set(updated.map(m => m.id)))
          .map(id => updated.find(m => m.id === id)!)
          .sort((a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime());
        return uniqueAndSorted;
      });
    }
  }, [trades, monthlyPortfolios, portfolioSize, yearlyStartingCapitals, useCashBasis]); // Removed achievedMilestones to prevent infinite loops

  useEffect(() => {
    // Debounce milestone checking to prevent excessive re-evaluation
    const timeoutId = setTimeout(() => {
      checkAndAwardMilestones();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [checkAndAwardMilestones]); // Re-run when dependencies change

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(achievedMilestones));
      } catch (error) {
        console.error('Error saving achieved milestones to localStorage:', error);
      }
    }
  }, [achievedMilestones]);

  return {
    achievedMilestones,
    ALL_MILESTONES,
  };
}; 