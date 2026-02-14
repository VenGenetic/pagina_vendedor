# ✅ Setup Checklist

Use this checklist to ensure your ERP system is properly configured.

## 🎯 Pre-Installation

- [ ] **Node.js installed** (v18 or higher)
  - Run: `node --version`
  - If not installed: https://nodejs.org

- [ ] **npm or yarn installed**
  - Run: `npm --version`

- [ ] **Supabase account created**
  - Sign up: https://supabase.com

- [ ] **Code editor installed** (VS Code recommended)

---

## 📦 Supabase Setup

- [ ] **New project created**
  - Project name: ________________
  - Database password saved: ✅

- [ ] **Database schema deployed**
  - Go to: SQL Editor
  - Run: `supabase/schema.sql`
  - Verify: 6 tables created

- [ ] **Tables verified**
  - [ ] accounts (3 rows)
  - [ ] products (5 rows)
  - [ ] transactions (0 rows)
  - [ ] inventory_movements (0 rows)
  - [ ] sales (0 rows)
  - [ ] sale_items (0 rows)

- [ ] **Views verified**
  - [ ] low_stock_products
  - [ ] inventory_valuation
  - [ ] recent_activity

- [ ] **API keys copied**
  - [ ] Project URL: ________________
  - [ ] Anon key: ________________

---

## 🔧 Project Configuration

- [ ] **Dependencies installed**
  - Run: `npm install`
  - Wait for completion (2-3 minutes)

- [ ] **Environment file created**
  - [ ] Copied `.env.local.example` to `.env.local`
  - [ ] Added NEXT_PUBLIC_SUPABASE_URL
  - [ ] Added NEXT_PUBLIC_SUPABASE_ANON_KEY

- [ ] **Environment verified**
  - Open `.env.local`
  - No placeholder values remain
  - Keys start with correct prefixes

---

## 🚀 Development Server

- [ ] **Server started**
  - Run: `npm run dev`
  - No errors in terminal

- [ ] **Browser opened**
  - URL: http://localhost:3000
  - Dashboard loads

- [ ] **Initial state verified**
  - [ ] Total Balance shows $6,500
  - [ ] Inventory value shows
  - [ ] 3 accounts exist
  - [ ] 5 products in inventory

---

## 🧪 Functionality Tests

### Test 1: View Inventory
- [ ] Click "Inventario" in bottom nav
- [ ] See 5 products listed
- [ ] Search works (try "freno")
- [ ] Stock bars display

### Test 2: Create a Sale
- [ ] Go to Dashboard
- [ ] Click "Nueva Venta"
- [ ] Search for product
- [ ] Add product to sale
- [ ] Select account
- [ ] Submit sale
- [ ] Success message appears

### Test 3: Verify Sale Impact
- [ ] Dashboard balance increased
- [ ] "Ventas Hoy" shows amount
- [ ] Recent activity shows sale
- [ ] Inventory stock decreased

### Test 4: Create Purchase
- [ ] Click "Nueva Compra"
- [ ] Add product
- [ ] Set quantity and cost
- [ ] Select account
- [ ] Submit purchase
- [ ] Balance decreased

### Test 5: Create Expense
- [ ] Click "Nuevo Gasto"
- [ ] Enter description
- [ ] Enter amount
- [ ] Select account
- [ ] Submit expense
- [ ] Balance decreased

---

## 📱 Mobile Testing

- [ ] **Responsive design check**
  - Open DevTools (F12)
  - Toggle device toolbar (Ctrl+Shift+M)
  - Test on different screen sizes

- [ ] **Touch target sizes**
  - All buttons easily tappable
  - Inputs large enough
  - No accidental clicks

- [ ] **Bottom navigation**
  - Visible on mobile
  - All tabs work
  - Stays visible while scrolling

- [ ] **Real device testing** (optional)
  - Get local IP: `ipconfig` or `ifconfig`
  - Open on phone: `http://[your-ip]:3000`
  - Test all features

---

## 🎨 Customization (Optional)

- [ ] **Company branding**
  - [ ] Changed app name in `app/layout.tsx`
  - [ ] Updated header in `app/page.tsx`

- [ ] **Currency setting**
  - [ ] Changed currency in `lib/utils.ts`
  - [ ] Verified formatting works

- [ ] **Color scheme** (optional)
  - [ ] Modified CSS variables in `app/globals.css`
  - [ ] Checked all pages for consistency

- [ ] **Added real products**
  - [ ] Deleted sample products in Supabase
  - [ ] Added actual inventory items

- [ ] **Configured accounts**
  - [ ] Updated account names
  - [ ] Set correct initial balances

---

## 🔒 Security Configuration

- [ ] **Environment security**
  - [ ] `.env.local` in `.gitignore`
  - [ ] No credentials in code
  - [ ] No console.logs with sensitive data

- [ ] **Row Level Security** (for production)
  - [ ] Uncommented RLS in schema.sql
  - [ ] Set up Supabase Auth
  - [ ] Tested policies

---

## 📊 Database Verification

Run these queries in Supabase SQL Editor to verify:

### Check Triggers
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE 'trigger%';
```
Should return 3 triggers ✅

### Check Sample Data
```sql
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM accounts;
```
Should return 5 and 3 ✅

### Check Views
```sql
SELECT * FROM low_stock_products;
SELECT * FROM inventory_valuation;
SELECT * FROM recent_activity;
```
All should return data ✅

---

## 🐛 Troubleshooting Checks

If something doesn't work:

### Environment Issues
- [ ] Dev server restarted after `.env.local` changes
- [ ] No typos in environment variable names
- [ ] Supabase URL includes `https://`
- [ ] Anon key is complete (very long)

### Database Issues
- [ ] All triggers created successfully
- [ ] Foreign key constraints in place
- [ ] Seed data inserted

### UI Issues
- [ ] Browser console shows no errors
- [ ] Network tab shows successful API calls
- [ ] React Query DevTools shows queries

### Build Issues
- [ ] Node modules installed completely
- [ ] No version conflicts
- [ ] TypeScript compiles without errors

---

## ✅ Final Verification

Before considering setup complete:

- [ ] **All pages accessible**
  - [ ] Dashboard loads
  - [ ] Inventory page works
  - [ ] All transaction forms work

- [ ] **Data flow works**
  - [ ] Sale updates stock
  - [ ] Sale updates balance
  - [ ] Purchase updates stock
  - [ ] Expense updates balance

- [ ] **Performance acceptable**
  - [ ] Pages load < 1 second
  - [ ] Search responds instantly
  - [ ] No lag on interactions

- [ ] **No errors in console**
  - [ ] Browser console clear
  - [ ] Terminal shows no errors
  - [ ] Network requests succeed

---

## 🚀 Ready for Production?

Before deploying:

- [ ] **Testing complete**
  - [ ] All features tested
  - [ ] Edge cases considered
  - [ ] Error handling verified

- [ ] **Data prepared**
  - [ ] Real products added
  - [ ] Sample data removed
  - [ ] Accounts configured

- [ ] **Security enabled**
  - [ ] RLS policies active
  - [ ] Auth implemented
  - [ ] Environment variables in host

- [ ] **Performance optimized**
  - [ ] Images optimized
  - [ ] Build succeeds: `npm run build`
  - [ ] No warnings in build

- [ ] **Deployment platform chosen**
  - [ ] Vercel account created
  - [ ] Repository connected
  - [ ] Environment variables added
  - [ ] Domain configured (optional)

---

## 📞 Support Resources

If you get stuck:

- **Supabase Issues:** https://supabase.com/docs
- **Next.js Issues:** https://nextjs.org/docs
- **React Query:** https://tanstack.com/query/latest
- **Tailwind CSS:** https://tailwindcss.com/docs

Check our documentation:
- README.md - Complete setup guide
- QUICKSTART.md - 10-minute setup
- ARCHITECTURE.md - Technical details
- UI_GUIDE.md - Design reference

---

## 🎉 Success Criteria

You're ready when:

✅ Dashboard shows real-time data  
✅ Sales process works end-to-end  
✅ Stock updates automatically  
✅ Balances reflect transactions  
✅ Search finds products instantly  
✅ Mobile layout works perfectly  
✅ No errors anywhere  

**Congratulations! Your ERP system is ready for business! 🚀**

---

**Date Completed:** _______________  
**System Version:** 1.0  
**Last Updated:** January 2026
