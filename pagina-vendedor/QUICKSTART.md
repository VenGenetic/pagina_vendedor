# 🚀 Quick Start Guide - ERP Motorcycle Parts

Get your ERP system running in **10 minutes**!

## ✅ Checklist

- [ ] Node.js 18+ installed
- [ ] Supabase account created
- [ ] Code downloaded/cloned

## 📋 Step-by-Step Setup

### Step 1: Create Supabase Project (3 minutes)

1. Go to https://supabase.com and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Name:** `motorcycle-erp` (or your choice)
   - **Database Password:** Save this securely!
   - **Region:** Choose closest to you
4. Click **"Create new project"** and wait ~2 minutes

### Step 2: Set Up Database (2 minutes)

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy the entire content of `supabase/schema.sql` from this project
4. Paste into the SQL editor
5. Click **"Run"** (or press `Ctrl+Enter`)
6. You should see: ✅ Success. No rows returned

**Verify:** Go to **Table Editor** → You should see 6 tables (accounts, products, etc.)

### Step 3: Get API Keys (1 minute)

1. In Supabase, go to **Settings** → **API**
2. Copy these two values:
   - **Project URL** (starts with `https://`)
   - **anon public** key (starts with `eyJ...`)

### Step 4: Configure Environment (1 minute)

1. In your project folder, copy the example file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` and paste your keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-key-here
   ```

### Step 5: Install & Run (3 minutes)

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open http://localhost:3000 in your browser.

## 🎉 You're Done!

You should see:
- ✅ Dashboard with stats (all zeros initially)
- ✅ 3 default accounts (Cash, Bank, Digital Wallet)
- ✅ 5 sample products in inventory

## 🧪 Test the System

### Test 1: View Inventory
1. Click **"Inventario"** in bottom navigation
2. You should see 5 motorcycle parts
3. Each has a visual stock indicator

### Test 2: Make a Sale
1. Go back to **Dashboard** (home icon)
2. Click **"Nueva Venta"** (big green button)
3. Search for "Pastillas de Freno"
4. Click to add the product
5. Select an account (e.g., "Caja Principal")
6. Click **"Registrar Venta"**
7. ✅ You should see a success message

### Test 3: Verify Changes
1. Go to **Dashboard**
2. Check:
   - ✅ "Total Balance" increased
   - ✅ "Ventas Hoy" shows your sale
   - ✅ "Actividad Reciente" lists the transaction
3. Go to **Inventario**
4. Check:
   - ✅ "Pastillas de Freno" stock decreased

## 🐛 Troubleshooting

### Error: "Missing Supabase environment variables"
**Fix:**
- Make sure `.env.local` exists (not `.env.local.example`)
- Restart the dev server: `Ctrl+C` then `npm run dev`

### Error: "relation 'products' does not exist"
**Fix:**
- The SQL schema didn't run properly
- Go to Supabase SQL Editor and run `schema.sql` again

### Products showing but can't create sale
**Fix:**
- Check browser console (F12) for errors
- Verify your Supabase URL and key are correct
- Check if accounts exist: Go to Supabase → Table Editor → accounts

### Stock not updating after sale
**Fix:**
- Check if database triggers are enabled
- Run this query in Supabase SQL Editor:
  ```sql
  SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 10;
  ```
- You should see OUT movements for your sales

## 📱 Mobile Testing

### Test on Real Device
1. Find your computer's local IP:
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig
   ```
2. Look for your local IP (e.g., `192.168.1.5`)
3. On your phone, open browser and go to:
   ```
   http://192.168.1.5:3000
   ```

### Test Responsive Design
1. In browser, press `F12`
2. Click device toolbar icon (or `Ctrl+Shift+M`)
3. Select "iPhone 12 Pro" or similar
4. Test all pages for mobile layout

## 🎨 Customization Quick Wins

### Change Colors
Edit `app/globals.css` around line 10:
```css
:root {
  --primary: 221.2 83.2% 53.3%;  /* Change this for main color */
}
```

### Add Your Logo
Edit `app/page.tsx` line 40:
```tsx
<h1 className="text-xl font-bold">Your Company Name</h1>
```

### Change Currency
Edit `lib/utils.ts` line 8:
```typescript
currency: 'MXN',  // or 'EUR', 'COP', etc.
```

## 📊 Next Steps

1. **Add Real Products:**
   - Go to Supabase → Table Editor → products
   - Click "Insert row" and add your actual inventory

2. **Customize Accounts:**
   - Edit the accounts table with your real bank accounts

3. **Set Up Authentication:**
   - Uncomment RLS section in `schema.sql`
   - Follow Supabase auth documentation

4. **Deploy to Production:**
   - See [README.md](README.md) deployment section

## 💡 Pro Tips

- **Keyboard Shortcuts:** Learn Next.js Fast Refresh (saves automatically)
- **React Query DevTools:** Shows query status in bottom-right corner
- **Supabase Table Editor:** Great for quick data inspection
- **Chrome DevTools:** Network tab shows all Supabase requests

## 📞 Need Help?

- **Supabase Docs:** https://supabase.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Tailwind CSS:** https://tailwindcss.com/docs

## 🎯 Quick Reference

### Useful Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Run production build
npm run lint         # Check for code issues
```

### Important Files
- `app/page.tsx` - Dashboard
- `lib/services/transactions.ts` - Business logic
- `supabase/schema.sql` - Database structure
- `.env.local` - Your configuration

### Default URLs
- Dashboard: http://localhost:3000
- Inventory: http://localhost:3000/inventory
- New Sale: http://localhost:3000/transactions/sale

---

**Happy coding! 🚀 You now have a production-ready ERP system!**
