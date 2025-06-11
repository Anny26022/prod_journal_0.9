# React + Tailwind

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules. One top of the standard Vite setup, [tailwindcss](https://tailwindcss.com/) is installed and ready to be used in React components.

Additional references:

- [Getting started with Vite](https://vitejs.dev/guide/)
- [Tailwind documentation](https://tailwindcss.com/docs/installation)

# HeroUI Trading Journal & Analytics

A modern, feature-rich trading journal and analytics platform built with React, Vite, Tailwind, and HeroUI. Designed for active traders and investors who want deep insights, beautiful analytics, and a seamless journaling experience.

---

## 🚀 Why This Project Stands Out

- **Beautiful, Responsive UI:** Built with HeroUI and Tailwind for a clean, modern, and mobile-friendly experience.
- **Deep Analytics:** Advanced charts (using Recharts) for industry, sector, and setup analysis, with interactive tooltips and smooth animations.
- **Personalized Trade Journal:** Inline editing, persistent notes, and powerful filtering make journaling effortless.
- **Data Ownership:** All your data is stored locally and can be exported in CSV or Excel format at any time.
- **Extensible & Open:** Easily customizable and ready for new features or integrations.

---

## 📦 Features

### 1. **Trade Journal**
- **Add, Edit, and Delete Trades:** Full CRUD support with inline editing for every field.
- **Persistent Notes:** Add detailed, multi-line personal reviews for each trade. Notes are saved and persist across sessions.
- **Smart Stock Name Suggestions:** Autocomplete and fuzzy matching using the latest industry/sector CSV.
- **Column Customization:** Show/hide columns to tailor your journal view.
- **Advanced Filtering & Sorting:** Filter by date, setup, status, and more.
- **Export:** Download your entire journal as CSV or Excel with one click.
- **No Vendor Lock-in:** All data is stored in your browser (localStorage).

### 2. **Deep Analytics Page**
- **Industry & Sector Analysis:** 
  - Dual chart cards (donut + horizontal bar) for both industry and sector, showing trade counts and stock breakdowns.
  - Tooltips reveal all stocks traded in each category.
  - "Most/Least Traded" summary cards with hoverable stock lists.
- **Setup Analysis:**
  - See which setups work best for you, with win rates and portfolio impact.
  - Frequency charts and sortable tables.
- **Position Analysis:**
  - Visualize your current allocations and open positions.
- **Framer Motion Animations:** Smooth, staggered transitions for all analytics cards and charts.

### 3. **Performance Analytics**
- **Monthly Performance:** Track your P&L, win rate, and other key metrics over time.
- **Equity Curve:** Visualize your portfolio growth.
- **Top Performers:** See your best trades and setups at a glance.

### 4. **Tax Analytics**
- **Tax Summary:** Calculate realized/unrealized gains, short/long-term capital gains, and more.
- **Export for Filing:** Download tax-relevant data for your accountant.

### 5. **Profile & Settings**
- **Profile Customization:** Update your profile, theme, and preferences.
- **Theme Switcher:** Light/dark mode toggle.

### 6. **Data & Integrations**
- **Industry/Sector Mapping:** Uses `public/name_sector_industry.csv` for up-to-date stock metadata.
- **Mock Data:** Easily switch to demo data for testing or onboarding.

---

## 🏆 Why It's the Best

- **User-Centric Design:** Every feature is built for speed, clarity, and ease of use.
- **Best-in-Class UI:** HeroUI components ensure accessibility, consistency, and beauty.
- **Blazing Fast:** Powered by Vite and optimized React patterns.
- **Open Data Model:** No proprietary formats—export and analyze your data anywhere.
- **Extensible:** Modular codebase makes it easy to add new analytics, brokers, or integrations.

---

## 🛠️ Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Run the app:**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

3. **Access the app:**  
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Project Structure

- `src/components/` — All UI components (journal, analytics, modals, etc.)
- `src/pages/` — Main pages (DeepAnalytics, Monthly Performance, Allocations)
- `src/hooks/` — Custom React hooks (trades, price ticks, capital changes)
- `src/utils/` — Utility functions (calculations, CSV parsing, context)
- `src/types/` — TypeScript types (Trade, CapitalChange, etc.)
- `public/` — Static assets (CSV mapping file, favicon, etc.)

---

## 📊 Data & CSV Mapping

- The file `public/name_sector_industry.csv` provides industry and sector mapping for all stocks.
- **How it's used:**  
  - For stock name suggestions in the journal.
  - For grouping and analyzing trades by industry/sector in analytics.
- **How to update:**  
  - Replace the CSV in the `public` folder with a new version as needed.

---

## 📝 Contributing

Pull requests are welcome! Please open an issue to discuss major changes.

---

## 📄 License

MIT

---

## 🙏 Acknowledgements

- [HeroUI](https://heroui.dev/)
- [Recharts](https://recharts.org/)
- [PapaParse](https://www.papaparse.com/)
- [XLSX](https://github.com/SheetJS/sheetjs)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
