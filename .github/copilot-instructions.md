# Copilot Instructions for ERP Motorcycle Parts

## Project Architecture
- **Framework**: Next.js 14 (App Router), React 18, TypeScript.
- **Styling**: Tailwind CSS, Shadcn UI (`components/ui`).
- **Backend/Database**: Supabase (PostgreSQL).
- **State/Data Fetching**: TanStack React Query (`@tanstack/react-query`).
- **Icons**: Lucide React.
- **Forms**: React Hook Form + Zod.

## Project Structure
- `app/(protected)/`: Routes requiring authentication (dashboard, inventory, transactions).
- `components/ui/`: Reusable primitive components (Shadcn).
- `components/[feature]/`: Feature-specific components (e.g., `inventory/product-form.tsx`).
- `lib/services/`: Supabase logic & business operations (e.g., `inventory.ts`, `transactions.ts`).
- `hooks/use-queries.ts`: Centralized React Query hooks for data fetching.
- `types/`: TypeScript definitions, especially `database.types.ts` (Supabase generated).

## Development Conventions

### Data Fetching & State
- **React Query**: Use custom hooks in `hooks/use-queries.ts` for all data fetching.
- **Mutations**: Perform DB operations in `lib/services/` and call `queryClient.invalidateQueries` to refresh UI.
- **Avoid**: Direct `useEffect` for data fetching; prefer `useQuery`.

### Supabase & Types
- **Client**: Use `import { supabase } from '@/lib/supabase/client'`.
- **Types**: Always use types from `@/types` (e.g., `Producto`, `ProductoInsertar`) derived from `database.types.ts`.
- **Troubleshooting**: If Supabase `.insert()`/`.update()` throws `never` type errors, you may need to cast the client or payload temporarily (e.g., `(supabase as any).from(...)`), but prefer fixing type definitions if possible.

### UI & Components
- **Shadcn UI**: Reuse existing components in `components/ui` before creating new ones.
- **Icons**: Use `lucide-react` icons.
- **Responsive**: Ensure designs work on mobile (Tailwind classes).

### Forms
- Use `react-hook-form` with `zodResolver`.
- Define schemas using `zod` for strict validation.

## Critical Workflows
- **Build**: `npm run build` runs type checks and lints. Run this validation before committing.
- **Supabase Types**: If DB schema changes, regenerate `types/database.types.ts`.

## file Patterns
- Use `kebab-case` for file names (e.g., `product-form.tsx`).
- Use `PascalCase` for component names.
- Exports: Named exports preferred for components.
