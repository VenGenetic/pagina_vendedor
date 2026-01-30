# ERP/Inventory Management System for Motorcycle Parts Business

A modern, mobile-first ERP system built specifically for motorcycle spare parts businesses handling ~$20k in inventory. Features real-time inventory tracking, sales management, and financial oversight.

## 🚀 Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **UI Components:** Shadcn/ui (Radix UI primitives)
- **Icons:** Lucide React
- **Backend/Database:** Supabase (PostgreSQL)
- **State Management:** TanStack Query (React Query)
- **Charts:** Recharts

## ✨ Core Features

### 📊 Dashboard
- Real-time balance across all accounts
- Total inventory valuation (cost & selling price)
- Today's sales and expenses
- Low stock alerts
- Recent activity feed

### 💰 Transaction Management
- **Sales:** Multi-product selection, customer info, automatic stock deduction
- **Purchases/Restock:** Supplier tracking, cost management, automatic stock increase
- **Expenses:** General expense tracking with categorization

### 📦 Inventory Management
- Product master list with SKU, pricing, and stock levels
- Visual stock indicators (low/medium/high)
- Search by name or SKU
- Automatic stock updates via database triggers

### 🔐 Data Integrity
- **Transactional Operations:** All sales/purchases execute atomically
- **Audit Trail:** Every stock change logged in `inventory_movements`
- **Database Triggers:** Automatic stock and balance updates
- **Referential Integrity:** Foreign key constraints prevent orphaned records

## 📁 Project Structure

```
pagina_vendedor/
├── app/
│   ├── globals.css                 # Tailwind styles + CSS variables
│   ├── layout.tsx                  # Root layout with metadata
│   ├── page.tsx                    # Dashboard (home page)
│   ├── providers.tsx               # React Query provider
│   ├── inventory/
│   │   └── page.tsx               # Inventory list with search
│   └── transactions/
│       ├── sale/
│       │   └── page.tsx           # New sale form
│       ├── purchase/
│       │   └── page.tsx           # New purchase form
│       └── expense/
│           └── page.tsx           # New expense form
├── components/
│   └── ui/                        # Shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── select.tsx
├── hooks/
│   └── use-queries.ts             # React Query hooks for data fetching
├── lib/
│   ├── supabase/
│   │   └── client.ts              # Supabase client initialization
│   ├── services/
│   │   └── transactions.ts        # Business logic for sales/purchases/expenses
│   └── utils.ts                   # Utility functions (formatting, etc.)
├── types/
│   ├── database.types.ts          # Auto-generated Supabase types
│   └── index.ts                   # Custom types and interfaces
├── supabase/
│   └── schema.sql                 # Complete database schema
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## 🗄️ Database Schema

### Key Tables
- **`products`:** Master inventory list (SKU, name, prices, stock)
- **`accounts`:** Cash/bank accounts with balances
- **`transactions`:** All financial movements (INCOME/EXPENSE)
- **`inventory_movements`:** Complete audit trail of stock changes
- **`sales`:** Sales header records
- **`sale_items`:** Line items for each sale

### Views
- **`low_stock_products`:** Products at or below minimum stock
- **`inventory_valuation`:** Real-time inventory value calculations
- **`recent_activity`:** Last 50 transactions for dashboard

### Triggers
- **Auto-update stock:** When inventory_movements inserted
- **Auto-update balance:** When transactions inserted
- **Auto-update timestamps:** On row updates

## 🛠️ Setup Instructions

### 1. Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account (free tier works)

### 2. Database Setup

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run the entire `supabase/schema.sql` file
3. Verify tables were created in the Table Editor

### 3. Environment Configuration

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

   Find these in Supabase Dashboard → Settings → API

### 4. Install Dependencies

```bash
npm install
# or
yarn install
```

### 5. Run Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Initial Data (Optional)

The schema includes seed data for:
- 3 default accounts (Cash, Bank, Digital Wallet)
- 5 sample products

To customize, edit the seed data section in `supabase/schema.sql` before running it.

## 📱 Mobile-First Design

This system is optimized for mobile phones (the primary use case):

- **Large Touch Targets:** Buttons sized for easy tapping
- **Sticky Headers:** Navigation always accessible
- **Bottom Navigation:** Quick access to key sections
- **Auto-complete Search:** Fast product lookup
- **Visual Indicators:** Color-coded stock levels
- **Minimal Scrolling:** Important info above the fold

## 🔒 Security Considerations

### Row Level Security (RLS)

The schema includes commented RLS setup. To enable:

1. Uncomment the RLS section in `schema.sql`
2. Set up authentication in Supabase
3. Define policies based on your needs

### Best Practices

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code
- Use environment variables for sensitive data
- Enable RLS before deploying to production
- Regularly backup your database

## 🚀 Deployment

### Vercel (Recommended for Next.js)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

Works on any platform supporting Next.js:
- Netlify
- Railway
- Render
- AWS Amplify

## 📊 Business Logic Flow

### Sale Transaction
```
1. User selects products and quantities
2. System validates stock availability
3. Creates sale record
4. For each item:
   - Creates sale_item
   - Creates inventory_movement (OUT)
   - Trigger updates product.current_stock
5. Creates transaction (INCOME)
6. Trigger updates account.balance
```

### Purchase Transaction
```
1. User selects products and costs
2. Creates transaction (EXPENSE)
3. Trigger updates account.balance
4. For each item:
   - Creates inventory_movement (IN)
   - Trigger updates product.current_stock
```

## 🎨 Customization

### Adding New Product Categories

Edit the `products` table and add your categories. Consider creating a separate `categories` table for larger catalogs.

### Custom Reports

Use Supabase's SQL Editor to create additional views:

```sql
-- Example: Monthly sales report
CREATE VIEW monthly_sales AS
SELECT 
  DATE_TRUNC('month', sale_date) AS month,
  COUNT(*) AS total_sales,
  SUM(total) AS revenue
FROM sales
GROUP BY DATE_TRUNC('month', sale_date)
ORDER BY month DESC;
```

### Styling

Modify `app/globals.css` to change the color scheme. The system uses CSS variables for theming.

## 🐛 Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` exists with correct values
- Restart dev server after adding env vars

### Stock not updating
- Check database triggers are enabled
- Verify inventory_movements are being created

### Slow queries
- Ensure indexes are created (included in schema)
- Consider pagination for large datasets

## 📝 License

MIT License - feel free to use this for commercial projects.

## 🤝 Contributing

This is a template project. Fork and customize for your needs!

## 📞 Support

For Supabase issues: https://supabase.com/docs
For Next.js issues: https://nextjs.org/docs

---

**Built with ❤️ for motorcycle parts businesses**
