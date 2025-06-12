# React + Tailwind

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules. One top of the standard Vite setup, [tailwindcss](https://tailwindcss.com/) is installed and ready to be used in React components.

Additional references:

- [Getting started with Vite](https://vitejs.dev/guide/)
- [Tailwind documentation](https://tailwindcss.com/docs/installation)

# True Portfolio Tracker

A powerful and intuitive web-based application designed to help traders meticulously track their trades, analyze their performance, and manage their portfolio with a "True Portfolio System" approach. This system goes beyond simple trade tracking by integrating starting capital, deposits, withdrawals, and trading P&L to provide a comprehensive view of your actual portfolio growth over time.

## ✨ Features

### 📈 Comprehensive Trade Journal
- **Add, Edit, Delete Trades**: Easily manage your trading records with full CRUD (Create, Read, Update, Delete) functionality.
- **Search & Filter**: Quickly find specific trades using a search bar and filter by position status (Open, Closed, Partial).
- **Customizable Columns**: Choose which data columns are visible in your trade table for a personalized view.
- **Inline Editing**: Directly edit various trade fields within the table for quick adjustments (e.g., Entry Price, Stop Loss, Quantity, Dates).
- **Intelligent Auto-Calculations**:
    - **Position Size**: Automatically calculated based on your trade details.
    - **Unrealized P/L**: Track your current profit/loss for open positions in real-time.
    - **Realized P/L**: See your final profit/loss for closed trades.
    - **Holding Days**: Calculate the duration of your trades.
    - **Open Heat**: Understand the potential portfolio impact if all open positions hit their initial stop-loss/trailing stop-loss.
    - **Reward:Risk (R:R)**: Calculated per trade, with a detailed breakdown for pyramid entries.
    - **Stock Move**: Analyze individual stock price movements relative to your entries.
- **Dynamic CMP Updates**: For open positions, current market prices (CMP) are automatically fetched and updated every 15 seconds to provide accurate unrealized P/L.
- **Flexible Dropdowns**: Easily add and manage custom options for "Exit Trigger", "Proficiency Growth Areas", and "Setup Type" dropdowns, with the ability to delete predefined and custom options.
- **Data Export**: Export your trade data to CSV or XLSX (Excel) format for external analysis or record-keeping.

### 💰 True Portfolio System
- **Yearly Starting Capital**: Set your initial capital for January of each year, forming the base for all portfolio calculations.
- **Monthly Capital Overrides**: Manually adjust starting capital for specific months, overriding automatic calculations for greater flexibility.
- **Capital Changes Tracking**: Record all your deposits and withdrawals to accurately reflect capital inflows and outflows.
- **Dynamic Portfolio Sizing**: Your portfolio size is dynamically calculated based on starting capital, capital changes, and your trading P&L, offering a realistic view of your wealth.
- **Portfolio Performance Chart**: Visualize your portfolio's growth over time, with integrated display of deposits and withdrawals, and a dynamic starting point based on your first trade's month. Tooltips show starting capital and percentage P/L change.

### ⚙️ User Settings & Experience
- **Profile Settings Modal**: A centralized hub to manage:
    - Your name.
    - Yearly starting capital.
    - Monthly capital overrides.
    - Capital changes history.
- **Personalized Welcome Message**: Greeted with a custom welcome message on first startup, prompting for your name.
- **Full-Width Layout Option**: Choose between a fixed-width or full-width layout for the entire application, accessible through the Profile Settings.
- **Persistent Settings**: Your preferences, including your name and layout choice, are saved to local storage for a consistent experience.

## 📄 Pages Overview

### 📝 Trade Journal
This is the core of the application where you manage all your trading activities. It provides a detailed table view of your trades with extensive inline editing capabilities and real-time calculations. Key features include:
- **Trade Management**: Add new trades, edit existing ones, and delete records.
- **Real-time Metrics**: View unrealized P/L, holding days, and open heat for active positions.
- **Customizable Data**: Toggle visibility of various columns to focus on the most relevant data.
- **Smart Fields**: Auto-calculated fields like Position Size, Reward:Risk, and Stock Move provide immediate insights.
- **Dynamic Updates**: Current Market Prices (CMP) for open positions are fetched periodically.
- **Flexible Dropdowns**: Manage custom options for Exit Trigger, Proficiency Growth Areas, and Setup Type.
- **Export**: Export your journal data to CSV or Excel.

### 📊 Trade Analytics (Overview)
This page provides a high-level overview of your trading performance through various metrics and charts. It helps you quickly grasp your overall progress and key performance indicators.
- **Portfolio Performance Chart**: Visualizes your portfolio's equity curve over time, incorporating starting capital, deposits, withdrawals, and trading P&L. Includes tooltips for detailed insights.
- **Overall Stats**: Displays quick summaries of essential metrics like total trades, win rate, average P/L per trade, etc.

### 📈 Tax Analytics
Simplify your tax reporting with automated calculations of realized and unrealized gains. This section provides a clear overview of your tax liabilities.
- **Capital Gains Summary**: Calculates short-term and long-term capital gains based on your trade data.
- **Realized/Unrealized Breakdown**: Differentiates between profits/losses from closed and open positions for accurate tax assessment.
- **Export for Tax Filing**: Generates reports in a format suitable for tax preparation or submission.

### 🗓️ Monthly Performance
This page offers a monthly breakdown of your trading results, allowing you to track consistency and identify trends over specific periods.
- **Monthly P&L**: View your profit and loss figures for each month.
- **Win Rate by Month**: Track your success rate on a monthly basis.
- **Other Monthly Metrics**: See detailed statistics for each month, helping you assess your performance trends.

### 🧠 Deep Analytics
Go beyond the surface with in-depth analysis of your trades based on specific criteria. This section helps you pinpoint what truly drives your performance.
- **Industry & Sector Analysis**: Understand which industries and sectors you perform best in, with charts and breakdowns of trades.
- **Setup Analysis**: Evaluate the profitability and success rate of different trading setups you employ.
- **Position Analysis**: Gain insights into your capital allocation and open positions.
- **Interactive Visualizations**: Utilize dynamic charts and tables to explore your data in detail.

### ⚙️ Profile Settings
This modal provides a centralized place to configure your application preferences and manage core financial data. You can:
- **Update Personal Information**: Set your name for a personalized experience.
- **Manage Yearly Starting Capital**: Define your foundational capital for each trading year.
- **Override Monthly Capital**: Manually adjust starting capital for specific months to account for unusual circumstances or manual adjustments.
- **Track Capital Changes**: Log all your deposits and withdrawals to keep your portfolio calculations accurate and reflect real-world capital movements.
- **Display Preferences**: Toggle the full-width layout option for the main application content, adjusting the overall presentation of the app.

## 🚀 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1.  Clone the repo
    ```bash
    git clone https://github.com/your-username/true-portfolio-tracker.git
    ```
2.  Navigate to the project directory
    ```bash
    cd true-portfolio-tracker
    ```
3.  Install NPM packages
   ```bash
   npm install
   # or
    yarn install
   ```
4.  Start the development server
   ```bash
   npm run dev
   # or
    yarn dev
    ```
    The application should now be running at `http://localhost:5173` (or another port if 5173 is in use).

## 🛠️ Technologies Used

-   **Frontend**: React.js
-   **Styling**: Tailwind CSS
-   **UI Components**: Hero UI
-   **Charting**: Recharts (or similar, confirm in code)
-   **Icons**: Iconify (Lucide icons)
-   **Date Management**: date-fns
-   **CSV Parsing**: PapaParse
-   **Excel Export**: SheetJS (xlsx)
-   **Routing**: React Router DOM
-   **Animation**: Framer Motion
-   **State Management**: React Context API, `useState`, `useCallback`, `useMemo` hooks
-   **Local Storage**: For data persistence (no external database required)

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 📧 Contact

Your Name - your_email@example.com
Project Link: [https://github.com/your-username/true-portfolio-tracker](https://github.com/your-username/true-portfolio-tracker)
