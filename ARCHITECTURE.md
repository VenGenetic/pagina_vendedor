# Project Structure & Architecture

## 📂 Complete File Tree

```
pagina_vendedor/
│
├── 📁 app/                          # Next.js 14 App Router
│   ├── 📄 globals.css              # Global styles + Tailwind + CSS variables
│   ├── 📄 layout.tsx               # Root layout with providers
│   ├── 📄 page.tsx                 # Dashboard (homepage)
│   ├── 📄 providers.tsx            # React Query provider wrapper
│   │
│   ├── 📁 inventory/
│   │   └── 📄 page.tsx            # Inventory list with search & filters
│   │
│   └── 📁 transactions/
│       ├── 📁 sale/
│       │   └── 📄 page.tsx        # New sale form
│       ├── 📁 purchase/
│       │   └── 📄 page.tsx        # New purchase/restock form
│       └── 📁 expense/
│           └── 📄 page.tsx        # New expense form
│
├── 📁 components/
│   └── 📁 ui/                      # Shadcn/ui components
│       ├── 📄 button.tsx
│       ├── 📄 card.tsx
│       ├── 📄 input.tsx
│       ├── 📄 label.tsx
│       └── 📄 select.tsx
│
├── 📁 hooks/
│   └── 📄 use-queries.ts           # React Query hooks
│                                    # - useAccounts()
│                                    # - useProducts()
│                                    # - useDashboardStats()
│                                    # - useCreateSale()
│                                    # - useCreatePurchase()
│                                    # - useCreateExpense()
│
├── 📁 lib/
│   ├── 📁 supabase/
│   │   └── 📄 client.ts            # Supabase client initialization
│   │
│   ├── 📁 services/
│   │   └── 📄 transactions.ts      # Business logic
│   │                                # - processSale()
│   │                                # - processPurchase()
│   │                                # - createExpense()
│   │
│   └── 📄 utils.ts                 # Utility functions
│                                    # - formatCurrency()
│                                    # - formatDate()
│                                    # - generateSaleNumber()
│                                    # - calculateStockPercentage()
│
├── 📁 types/
│   ├── 📄 database.types.ts        # Supabase generated types
│   └── 📄 index.ts                 # Custom types & interfaces
│
├── 📁 supabase/
│   └── 📄 schema.sql               # Complete database schema
│                                    # - Tables (6)
│                                    # - Views (3)
│                                    # - Triggers (3)
│                                    # - Seed data
│
├── 📄 .env.local.example           # Environment variables template
├── 📄 .gitignore
├── 📄 components.json              # Shadcn/ui configuration
├── 📄 next.config.js               # Next.js configuration
├── 📄 package.json                 # Dependencies
├── 📄 postcss.config.js            # PostCSS for Tailwind
├── 📄 README.md                    # Complete documentation
├── 📄 tailwind.config.ts           # Tailwind CSS configuration
└── 📄 tsconfig.json                # TypeScript configuration
```

## 🏗️ Architecture Overview

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface (Mobile)                   │
│                    Next.js 14 App Router + React                │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                     State Management Layer                       │
│              TanStack Query (React Query)                       │
│  • Caching • Optimistic Updates • Background Refetch           │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                        │
│                    lib/services/transactions.ts                  │
│  • processSale() • processPurchase() • createExpense()          │
│  • Validation • Transaction coordination                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                       Data Access Layer                          │
│                     Supabase Client (PostgreSQL)                 │
│  • Real-time subscriptions • Row Level Security                 │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Database Layer (PostgreSQL)                 │
│  • Triggers (auto-update stock/balance)                         │
│  • Views (aggregated data)                                      │
│  • Constraints (data integrity)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App Layout
│
├── Providers (React Query)
│   │
│   ├── Dashboard Page (/)
│   │   ├── Stats Cards (Balance, Inventory, Sales, Expenses)
│   │   ├── Low Stock Alert
│   │   ├── Quick Actions (Sale, Purchase, Expense buttons)
│   │   └── Recent Activity List
│   │
│   ├── Inventory Page (/inventory)
│   │   ├── Search Bar
│   │   ├── Low Stock Banner
│   │   └── Product Cards
│   │       ├── Product Image
│   │       ├── Name, SKU, Brand
│   │       ├── Prices (Cost/Selling)
│   │       └── Stock Bar (visual indicator)
│   │
│   └── Transaction Pages
│       │
│       ├── Sale Page (/transactions/sale)
│       │   ├── Customer Info Form
│       │   ├── Product Selector (with search)
│       │   ├── Selected Items List
│       │   ├── Payment Info Form
│       │   └── Total Card
│       │
│       ├── Purchase Page (/transactions/purchase)
│       │   ├── Supplier Info Form
│       │   ├── Product Selector
│       │   ├── Items with Quantity/Cost inputs
│       │   ├── Payment Info Form
│       │   └── Total Card
│       │
│       └── Expense Page (/transactions/expense)
│           ├── Expense Details Form
│           ├── Payment Info Form
│           └── Total Card
│
└── Bottom Navigation (Mobile)
    ├── Home
    ├── Inventory
    └── Transactions
```

## 🔄 Transaction Flow Examples

### Sale Transaction Flow

```
1. USER ACTION
   └─> Selects products & quantities in UI

2. VALIDATION
   └─> Frontend checks stock availability

3. MUTATION (useCreateSale)
   └─> Calls processSale() service function

4. DATABASE OPERATIONS (Atomic Transaction)
   ├─> INSERT INTO sales (...)
   ├─> For each item:
   │   ├─> INSERT INTO sale_items (...)
   │   └─> INSERT INTO inventory_movements (type: OUT, quantity: -N)
   │       └─> TRIGGER: update_product_stock()
   │           └─> UPDATE products SET current_stock = current_stock - N
   │
   └─> INSERT INTO transactions (type: INCOME)
       └─> TRIGGER: update_account_balance()
           └─> UPDATE accounts SET balance = balance + amount

5. UI UPDATE
   ├─> Query invalidation (React Query)
   ├─> Automatic refetch of dashboard stats
   ├─> Inventory list updates
   └─> Account balance updates

6. USER FEEDBACK
   └─> Success message + redirect to dashboard
```

### Purchase Transaction Flow

```
1. USER ACTION
   └─> Enters products, quantities, and costs

2. MUTATION (useCreatePurchase)
   └─> Calls processPurchase() service function

3. DATABASE OPERATIONS
   ├─> INSERT INTO transactions (type: EXPENSE)
   │   └─> TRIGGER: update_account_balance()
   │       └─> UPDATE accounts SET balance = balance - amount
   │
   └─> For each item:
       └─> INSERT INTO inventory_movements (type: IN, quantity: +N)
           └─> TRIGGER: update_product_stock()
               └─> UPDATE products SET current_stock = current_stock + N

4. UI UPDATE & FEEDBACK
   └─> Similar to sale flow
```

## 🎨 Styling Architecture

### Tailwind CSS + CSS Variables

The system uses a hybrid approach:

1. **Tailwind Utility Classes** for layout and spacing
2. **CSS Variables** for colors (easy theming)
3. **Shadcn/ui Components** for consistent design

```css
/* Example from globals.css */
:root {
  --primary: 221.2 83.2% 53.3%;
  --destructive: 0 84.2% 60.2%;
  /* ... */
}

/* Usage in components */
<Button className="bg-primary text-primary-foreground" />
```

### Responsive Design

- **Mobile-first:** Base styles for mobile (320px+)
- **Breakpoints:** `sm: 640px`, `md: 768px`, `lg: 1024px`
- **Touch targets:** Minimum 44px for buttons
- **Font sizes:** `text-sm`, `text-base`, `text-lg` for hierarchy

## 📊 Database Design Principles

### 1. Single Source of Truth
- `products.current_stock` is the ONLY stock value
- Updated ONLY via triggers from `inventory_movements`

### 2. Audit Trail
- Every stock change logged in `inventory_movements`
- Every financial change logged in `transactions`

### 3. Referential Integrity
- Foreign keys with `ON DELETE RESTRICT` for critical data
- Cascading deletes only for dependent data (sale_items)

### 4. Performance Optimization
- Indexes on frequently queried columns
- Materialized views for complex aggregations (future enhancement)
- Partial indexes for active records

## 🔐 Security Layers

### 1. Environment Variables
- Sensitive keys never in code
- `.env.local` excluded from git

### 2. Supabase Security
- Row Level Security (RLS) ready
- Anon key for client-side (limited permissions)
- Service role key server-side only

### 3. Input Validation
- TypeScript type checking
- HTML5 form validation
- Business logic validation

## 📈 Scalability Considerations

### Current Capacity
- **Products:** 1,000+ items efficiently
- **Transactions:** 10,000+ per month
- **Users:** 1-10 concurrent users

### Growth Path
1. Add pagination for large product lists
2. Implement caching for frequent queries
3. Add full-text search (PostgreSQL FTS)
4. Separate read replicas for reporting
5. Consider edge functions for complex logic

## 🎯 Key Design Decisions

### Why Next.js App Router?
- Server Components for better performance
- Built-in API routes
- Easy deployment on Vercel
- Excellent TypeScript support

### Why Supabase?
- PostgreSQL (robust, relational)
- Built-in auth & real-time
- Generous free tier
- Easy to scale

### Why React Query?
- Automatic caching
- Background refetching
- Optimistic updates
- Better than Redux for this use case

### Why Shadcn/ui?
- Copy-paste components (no bloat)
- Full customization control
- Accessible by default
- Tailwind CSS integration

---

**This architecture balances simplicity with scalability, making it perfect for small businesses with growth potential.**
