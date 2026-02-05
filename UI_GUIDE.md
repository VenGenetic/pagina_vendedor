# 🎨 UI/UX Visual Guide

This document describes the visual design and user experience of the ERP system.

> [!IMPORTANT]
> **Language Mandate:** ALL UI labels, buttons, placeholders, and error messages MUST be in **Spanish (es-MX)**. No English text should appear in the user interface.

## 📱 Mobile-First Design Philosophy

**Primary Device:** Smartphone (320px - 428px width)  
**Design System:** Clean, modern, high-contrast  
**Touch Targets:** Minimum 44x44px for all interactive elements  
**Loading States:** Spinners with descriptive text

---

## 🎨 Tailwind Configuration (Mobile-Optimized)

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Enforce minimum touch targets
      minHeight: {
        'touch': '44px',   // iOS minimum
        'touch-lg': '48px' // Recommended
      },
      minWidth: {
        'touch': '44px',
        'touch-lg': '48px'
      },
      // Spacing for thumb-zone
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'thumb-zone': '40vh'
      },
      // Font sizes (minimum 16px for inputs to prevent iOS zoom)
      fontSize: {
        'input': ['16px', { lineHeight: '1.5' }]
      }
    }
  },
  plugins: []
}
```

### Global CSS Utilities

```css
/* styles/globals.css */

/* ===== SPANISH LABELS ===== */
/* Ensure all prompts use Spanish */
:root {
  --label-loading: "Cargando...";
  --label-error: "Error";
  --label-success: "Éxito";
  --label-confirm: "Confirmar";
  --label-cancel: "Cancelar";
  --label-save: "Guardar";
  --label-delete: "Eliminar";
  --label-search: "Buscar...";
  --label-required: "Campo obligatorio";
}

/* ===== MOBILE-OPTIMIZED TOUCH TARGETS ===== */
.btn,
button,
[role="button"],
.touch-target {
  @apply min-h-touch min-w-touch;
  @apply px-4 py-3;
  @apply text-input; /* 16px minimum */
}

.btn-primary {
  @apply min-h-touch-lg;
  @apply bg-blue-600 text-white font-semibold;
  @apply rounded-lg shadow-sm;
  @apply active:scale-[0.98] transition-transform;
}

/* Prevent iOS zoom on input focus */
input,
select,
textarea {
  @apply text-input; /* 16px */
}

/* Input with decimal keypad (for prices/costs) */
.input-decimal {
  @apply text-input;
  inputmode: decimal;
}

/* Input with numeric keypad (for quantities) */
.input-numeric {
  @apply text-input;
  inputmode: numeric;
}
```

---

## 🏷️ Spanish Label Standards

All UI text MUST use these Spanish translations:

### Common Actions

| English | Spanish | Context |
|---------|---------|---------|
| Save | Guardar | Primary save action |
| Cancel | Cancelar | Cancel/dismiss action |
| Delete | Eliminar | Delete action |
| Confirm | Confirmar | Confirmation dialogs |
| Edit | Editar | Edit action |
| Add | Agregar | Add new item |
| Search | Buscar | Search inputs |
| Filter | Filtrar | Filter controls |
| Back | Volver | Navigation back |

### Form Labels

| English | Spanish | Field Type |
|---------|---------|------------|
| Name | Nombre | Text input |
| Phone | Teléfono | Tel input |
| Email | Correo electrónico | Email input |
| Price | Precio | Currency input |
| Cost | Costo | Currency input |
| Quantity | Cantidad | Number input |
| Description | Descripción | Textarea |
| Notes | Notas | Textarea |
| Date | Fecha | Date picker |
| Account | Cuenta | Select |
| Product | Producto | Select/search |
| Customer | Cliente | Select/search |
| Supplier | Proveedor | Select/search |

### Validation Messages

| English | Spanish |
|---------|---------|
| Required field | Campo obligatorio |
| Invalid format | Formato inválido |
| Must be a number | Debe ser un número |
| Minimum X characters | Mínimo X caracteres |
| Maximum X characters | Máximo X caracteres |
| Must be positive | Debe ser mayor a cero |

### Status Messages

| English | Spanish |
|---------|---------|
| Loading... | Cargando... |
| Saving... | Guardando... |
| Saved successfully | Guardado exitosamente |
| Error saving | Error al guardar |
| No results found | No se encontraron resultados |
| Connection error | Error de conexión |

---


### 👍 Thumb-Zone Accessibility

All primary actions MUST be placed within the **thumb-friendly zone** (bottom 40% of screen):

```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────────────────────────┐   │ ← STRETCH ZONE (Headers, search)
│  │  Header / Navigation        │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │ ← NATURAL ZONE (Content, lists)
│  │  Scrollable Content Area    │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │ ← THUMB ZONE (Primary actions)
│  │  💰 TOTAL: $155.00          │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │     REGISTRAR VENTA         │   │ ← Primary CTA (min 48px height)
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
│  🏠  │  📦  │  💰  │  ⚙️  │        │ ← Bottom Navigation (sticky)
└─────────────────────────────────────┘
```

### 📲 Bottom-Aligned Action Sheets

For sales and critical actions, use **bottom sheets** instead of modals:

```
┌─────────────────────────────────────┐
│  (Dimmed background)               │
│                                     │
├─────────────────────────────────────┤
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │ ← Drag handle
│                                     │
│  Confirmar Venta                    │
│                                     │
│  Cliente: Juan Pérez               │
│  Total: $155.00                    │
│                                     │
│  ┌──────────┐  ┌──────────────┐    │
│  │ Cancelar │  │  Confirmar   │    │ ← Full-width buttons
│  └──────────┘  └──────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### ⌨️ Input Mode Standards (MANDATORY)

All numeric inputs MUST use appropriate `inputmode` attributes:

```html
<!-- ✅ CORRECT: Shows numeric keypad with decimal -->
<input 
  type="text" 
  inputmode="decimal" 
  placeholder="0.00"
  pattern="[0-9]*\.?[0-9]*"
/>

<!-- ✅ CORRECT: Quantity (no decimal needed) -->
<input 
  type="text" 
  inputmode="numeric" 
  placeholder="1"
  pattern="[0-9]*"
/>

<!-- ❌ WRONG: Shows full keyboard on mobile -->
<input type="text" placeholder="Enter price" />
```

| Input Type | inputmode | pattern | Example |
|------------|-----------|---------|---------|
| Price/Cost | `decimal` | `[0-9]*\.?[0-9]*` | Precio, Costo |
| Quantity | `numeric` | `[0-9]*` | Cantidad |
| Phone | `tel` | `[0-9+\-]*` | Teléfono |
| SKU | `text` | — | Código |

### 📐 Minimum Touch Target Sizes

| Element | Minimum Size | Recommended |
|---------|--------------|-------------|
| Buttons | 44x44px | 48x48px |
| Icon buttons | 44x44px | 48x48px |
| List items | Full width × 48px | Full width × 56px |
| Quantity controls (+/-) | 44x44px | 48x48px |
| Close/X buttons | 44x44px | 48x48px |

```css
/* Enforce minimum touch targets */
button, 
[role="button"],
.touch-target {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px;
}

.btn-primary {
  min-height: 48px;
  font-size: 16px; /* Prevents iOS zoom on focus */
}
```

### 🚫 One-Handed Operation Rules

1. **Never place primary actions at the top** of the screen
2. **Swipe gestures** for common actions (swipe to delete, swipe to archive)
3. **Bottom sheets > Modals** for confirmations
4. **Reachable dropdowns**: Dropdown content opens upward if near bottom
5. **Font size minimum**: 16px for inputs (prevents iOS zoom)

---


## 🏠 Dashboard (Home Page)

### Layout Structure
```
┌─────────────────────────────────────┐
│  🏠 ERP Motos     Sistema...    📦  │ ← Sticky Header
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┐  ┌─────────────┐  │
│  │ 💰 Balance  │  │ 📦 Inventario│  │ ← Stats Cards (2x2 grid)
│  │  $15,234.50 │  │  $20,480.00  │  │
│  └─────────────┘  └─────────────┘  │
│                                     │
│  ┌─────────────┐  ┌─────────────┐  │
│  │ ↗️ Ventas   │  │ ↘️ Gastos    │  │
│  │  +$1,245    │  │  -$380       │  │
│  └─────────────┘  └─────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  ⚠️  3 productos con stock bajo    │ ← Alert Banner (yellow)
│                              [Ver]  │
├─────────────────────────────────────┤
│                                     │
│  ┌────────────────────────────┐    │
│  │  🟢 NUEVA VENTA            │    │ ← Quick Actions
│  └────────────────────────────┘    │   (3 large buttons)
│                                     │
│  ┌────────────────────────────┐    │
│  │  🔵 NUEVA COMPRA           │    │
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │  💵 NUEVO GASTO            │    │
│  └────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  📊 Actividad Reciente             │
├─────────────────────────────────────┤
│  ↗️ Venta VTA-260126-1234          │
│     Caja Principal • hace 5 min    │
│                          +$145.00  │ ← Activity List
│  ─────────────────────────────────  │
│  ↘️ Compra de inventario           │
│     Cuenta Bancaria • hace 2h      │
│                          -$580.00  │
│  ─────────────────────────────────  │
│                                     │
│                                     │
└─────────────────────────────────────┘
│  🏠 Inicio │ 📦 Inventario │ 💰 $   │ ← Bottom Nav (sticky)
└─────────────────────────────────────┘
```

### Color Scheme
- **Primary Blue:** `#3b82f6` (buttons, links)
- **Success Green:** `#22c55e` (sales, income)
- **Danger Red:** `#ef4444` (expenses, low stock)
- **Warning Yellow:** `#f59e0b` (alerts)
- **Neutral Gray:** `#64748b` (text, borders)

---

## 📦 Inventory Page

### Layout
```
┌─────────────────────────────────────┐
│  ← Inventario              125 productos │
├─────────────────────────────────────┤
│  🔍 Buscar por nombre o SKU...     │ ← Search Bar
├─────────────────────────────────────┤
│  ⚠️ Productos con Stock Bajo (3)   │
│  • Pastillas de Freno - Stock: 2   │ ← Low Stock Banner
│  • Cadena 520 - Stock: 3           │
│  • Filtro Aceite - Stock: 5        │
├─────────────────────────────────────┤
│                                     │
│  ┌─────┐ Pastillas de Freno Delant │
│  │ 🖼️  │ SKU: BRK-001 • Brembo    │ ← Product Card
│  └─────┘ $45.00  Costo: $25.00    │
│          Stock: 2                   │
│          ▓░░░░░░░░░ 20%    ⚠️ Bajo │ ← Stock Bar (red)
│          Mín: 5 • Máx: 20          │
│                                     │
├─────────────────────────────────────┤
│  ┌─────┐ Aceite Motor 10W-40       │
│  │ 🖼️  │ SKU: OIL-001 • Motul     │
│  └─────┘ $22.00  Costo: $12.00    │
│          Stock: 30                  │
│          ▓▓▓▓▓▓▓░░░ 75%            │ ← Stock Bar (green)
│          Mín: 10 • Máx: 50         │
│                                     │
└─────────────────────────────────────┘
```

### Stock Indicator Colors
- **Red Bar (0-33%):** Critical/Low stock
- **Yellow Bar (34-66%):** Medium stock
- **Green Bar (67-100%):** Healthy stock

---

## 💰 New Sale Form

### Layout
```
┌─────────────────────────────────────┐
│  ← Nueva Venta                      │
├─────────────────────────────────────┤
│                                     │
│  📋 Información del Cliente         │
│  ┌─────────────────────────────┐   │
│  │ Nombre (opcional)           │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Teléfono (opcional)         │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  📦 Productos                       │
│  ┌─────────────────────────────┐   │
│  │ 🔍 Buscar producto...       │   │ ← Search with autocomplete
│  └─────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Pastillas de Freno Delant.  │  │ ← Selected item
│  │ $45.00 c/u                   │  │
│  │                              │  │
│  │  [-]  2  [+]        $90.00  🗑️│  │ ← Qty controls
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Cadena de Transmisión 520    │  │
│  │ $65.00 c/u                   │  │
│  │                              │  │
│  │  [-]  1  [+]        $65.00  🗑️│  │
│  └──────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│  💳 Información de Pago             │
│  ┌─────────────────────────────┐   │
│  │ Cuenta *                  ▼ │   │ ← Dropdown
│  │ Caja Principal ($1,500)     │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Método de Pago *          ▼ │   │
│  │ Efectivo                    │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  💰 Total: $155.00                 │ ← Total Card (large)
├─────────────────────────────────────┤
│                                     │
│  ┌────────────────────────────┐    │
│  │   REGISTRAR VENTA          │    │ ← Submit button (green)
│  └────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### Autocomplete Dropdown
```
┌─────────────────────────────────────┐
│ 🔍 past                             │
├─────────────────────────────────────┤
│ Pastillas de Freno Delanteras       │ ← Clickable results
│ BRK-001 • Stock: 15 • $45.00       │
│─────────────────────────────────────│
│ Pastillas de Freno Traseras         │
│ BRK-002 • Stock: 12 • $40.00       │
└─────────────────────────────────────┘
```

---

## 🛒 New Purchase Form

### Key Differences from Sale Form
- **Header:** "Nueva Compra / Restock"
- **Supplier field** instead of customer
- **Cost input** for each item (editable)
- **Total shows in red** (expense)
- **Submit button:** "REGISTRAR COMPRA"

### Item Card with Cost Input
```
┌──────────────────────────────────┐
│ Pastillas de Freno Delant.     🗑️│
├──────────────────────────────────┤
│  Cantidad        Costo Unitario  │
│  ┌────┐         ┌────────┐       │
│  │ 10 │         │ $25.00 │       │
│  └────┘         └────────┘       │
│                                   │
│  Subtotal: $250.00               │
└──────────────────────────────────┘
```

---

## 💵 New Expense Form

### Layout (Simpler)
```
┌─────────────────────────────────────┐
│  ← Nuevo Gasto                      │
├─────────────────────────────────────┤
│  📝 Información del Gasto           │
│  ┌─────────────────────────────┐   │
│  │ Descripción *               │   │
│  │ Ej: Alquiler, Servicios...  │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Monto *                     │   │
│  │ 0.00                        │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Número de Referencia        │   │
│  │ Factura, recibo, etc.       │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  💳 Información de Pago             │
│  ┌─────────────────────────────┐   │
│  │ Cuenta *                  ▼ │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Método de Pago *          ▼ │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Notas (opcional)            │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  💰 Total: -$380.00                │ ← Red (expense)
├─────────────────────────────────────┤
│  ┌────────────────────────────┐    │
│  │   REGISTRAR GASTO          │    │
│  └────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## 🎨 Design System Details

### Typography
```
Headings:
  h1: 1.25rem (20px) - Bold - Page titles
  h2: 1rem (16px) - Semibold - Card titles
  h3: 0.875rem (14px) - Medium - Labels

Body:
  Base: 0.875rem (14px) - Regular
  Small: 0.75rem (12px) - Muted

Numbers:
  Large: 1.5rem (24px) - Bold - Stats
  Base: 1rem (16px) - Semibold - Prices
```

### Spacing System
```
Padding:
  Small: 0.5rem (8px)
  Medium: 1rem (16px)
  Large: 1.5rem (24px)

Gaps:
  Tight: 0.5rem (8px) - Form fields
  Normal: 1rem (16px) - Cards
  Loose: 1.5rem (24px) - Sections
```

### Shadows
```
Cards: 0 1px 3px rgba(0,0,0,0.1)
Buttons: 0 1px 2px rgba(0,0,0,0.05)
Modals: 0 10px 25px rgba(0,0,0,0.1)
```

### Border Radius
```
Small: 0.375rem (6px) - Buttons, inputs
Medium: 0.5rem (8px) - Cards
Large: 0.75rem (12px) - Modals
```

---

## 🔄 Interactive States

### Button States
```
Default: bg-primary text-white
Hover: bg-primary/90 (10% darker)
Active: bg-primary/80 + scale(0.98)
Disabled: opacity-50 cursor-not-allowed
Loading: opacity-75 + spinner icon
```

### Input States
```
Default: border-gray-300
Focus: border-primary ring-2 ring-primary/20
Error: border-red-500 ring-2 ring-red-500/20
Disabled: bg-gray-100 cursor-not-allowed
```

### Card States
```
Default: border-gray-200 bg-white
Hover: shadow-md (for clickable cards)
Warning: border-yellow-500 bg-yellow-50
Error: border-red-500 bg-red-50
```

---

## 📱 Responsive Breakpoints

### Mobile First Approach
```
Base (default):     320px - 639px  (Mobile)
sm (640px+):        Tablets
md (768px+):        Small laptops
lg (1024px+):       Desktops
xl (1280px+):       Large desktops
```

### Layout Changes by Breakpoint

#### Mobile (< 640px)
- Single column layout
- Bottom navigation visible
- Stats in 2x2 grid
- Full-width buttons

#### Tablet (640px - 1023px)
- 2 column layouts where appropriate
- Bottom navigation hidden
- Stats in 1x4 row
- Side navigation appears

#### Desktop (1024px+)
- 3-4 column layouts
- Sidebar navigation
- Stats in 1x4 row
- Maximum content width: 1400px

---

## ⚡ Loading & Empty States

### Loading State
```
┌─────────────────────────────────────┐
│                                     │
│           ⭕ (spinning)             │
│                                     │
│         Cargando...                │
│                                     │
└─────────────────────────────────────┘
```

### Empty State (No Products)
```
┌─────────────────────────────────────┐
│                                     │
│             📦                      │
│                                     │
│   No hay productos en el inventario│
│                                     │
└─────────────────────────────────────┘
```

### Error State
```
┌─────────────────────────────────────┐
│             ⚠️                      │
│                                     │
│   Error al cargar los datos        │
│   [Reintentar]                      │
└─────────────────────────────────────┘
```

---

## 🎯 Touch Target Guidelines

### Minimum Sizes
- **Buttons:** 44x44px (iOS standard)
- **Input fields:** 44px height
- **Clickable cards:** Full card area
- **Icons alone:** 44x44px tap area

### Spacing Between Targets
- Minimum 8px gap between adjacent touch targets
- Prefer 16px for better usability

---

## 🌈 Accessibility Features

### Color Contrast
- Text on white: 4.5:1 minimum ratio
- Large text: 3:1 minimum ratio
- Interactive elements: Clear focus states

### Keyboard Navigation
- Tab order follows visual flow
- Focus indicators visible
- Skip links for main content

### Screen Readers
- Semantic HTML (button, nav, main, etc.)
- ARIA labels where needed
- Alt text for images

---

## 🎬 Animation & Transitions

### Subtle Animations
```
Page transitions: 200ms ease-in-out
Button hover: 150ms ease
Card hover: 200ms ease
Dropdown: 200ms ease-in-out
```

### No Animation for:
- Critical actions (deletes)
- Loading spinners (continuous)
- Error states

---

## 📐 Grid System

### Card Grid (Dashboard Stats)
```
Mobile:     2 columns (2x2 grid)
Tablet:     4 columns (1x4 row)
Desktop:    4 columns (1x4 row)
```

### Form Layout
```
Mobile:     1 column (stacked)
Tablet:     2 columns for related fields
Desktop:    2-3 columns for complex forms
```

---

This visual guide ensures consistency across all screens and provides a delightful user experience optimized for mobile sales operations! 🎨✨
