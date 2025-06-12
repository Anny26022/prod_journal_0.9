import React, { useState, useEffect, useCallback } from 'react';

export interface DashboardWidget {
  id: string;
  name: string;
  isVisible: boolean;
}

const DEFAULT_DASHBOARD_CONFIG: DashboardWidget[] = [
  { id: 'portfolio-performance', name: 'Portfolio Performance', isVisible: true },
  { id: 'performance-metrics', name: 'Performance Metrics', isVisible: true },
  { id: 'trade-statistics', name: 'Trade Statistics', isVisible: true },
  { id: 'top-performers', name: 'Top Performers', isVisible: true },
];

const LOCAL_STORAGE_KEY = 'dashboardConfig';

export const useDashboardConfig = () => {
  const [dashboardConfig, setDashboardConfig] = useState<DashboardWidget[]>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_DASHBOARD_CONFIG;
    }
    try {
      const storedConfig = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedConfig) {
        const parsedConfig: DashboardWidget[] = JSON.parse(storedConfig);
        // Merge with default to ensure new widgets are added and old ones removed if structure changes
        const mergedConfig = DEFAULT_DASHBOARD_CONFIG.map(defaultWidget => {
          const existingWidget = parsedConfig.find(p => p.id === defaultWidget.id);
          return existingWidget ? { ...defaultWidget, isVisible: existingWidget.isVisible } : defaultWidget;
        });
        // Filter out any widgets from stored config that are no longer in default config
        return mergedConfig.filter(widget => DEFAULT_DASHBOARD_CONFIG.some(defaultWidget => defaultWidget.id === widget.id));
      }
      return DEFAULT_DASHBOARD_CONFIG;
    } catch (error) {
      console.error('Error parsing dashboard config from localStorage:', error);
      return DEFAULT_DASHBOARD_CONFIG;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dashboardConfig));
      } catch (error) {
        console.error('Error saving dashboard config to localStorage:', error);
      }
    }
  }, [dashboardConfig]);

  const toggleWidgetVisibility = useCallback((id: string) => {
    setDashboardConfig(prevConfig =>
      prevConfig.map(widget =>
        widget.id === id ? { ...widget, isVisible: !widget.isVisible } : widget
      )
    );
  }, []);

  return {
    dashboardConfig,
    toggleWidgetVisibility,
  };
}; 