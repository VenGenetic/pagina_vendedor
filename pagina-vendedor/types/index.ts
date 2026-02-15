import { Database } from './database.types';

// Tipos auxiliares para uso más limpio
export type Producto = Database['public']['Tables']['products']['Row'];
export type ProductoInsertar = Database['public']['Tables']['products']['Insert'];
export type ProductoActualizar = Database['public']['Tables']['products']['Update'];

export type Cuenta = Database['public']['Tables']['accounts']['Row'] & {
  is_nominal?: boolean;
};
export type CuentaInsertar = Database['public']['Tables']['accounts']['Insert'];
export type CuentaActualizar = Database['public']['Tables']['accounts']['Update'];

export type Transaccion = Database['public']['Tables']['transactions']['Row'] & {
  is_adjustment?: boolean;
};
export type TransaccionInsertar = Database['public']['Tables']['transactions']['Insert'];
export type TransaccionActualizar = Database['public']['Tables']['transactions']['Update'];

export type MovimientoInventario = Database['public']['Tables']['inventory_movements']['Row'];
export type MovimientoInventarioInsertar = Database['public']['Tables']['inventory_movements']['Insert'];
export type MovimientoInventarioActualizar = Database['public']['Tables']['inventory_movements']['Update'];

export type Venta = Database['public']['Tables']['sales']['Row'] & {
  customer_document?: string;
  customer_city?: string;
  customer_address?: string;
};
export type VentaInsertar = Database['public']['Tables']['sales']['Insert'];
export type VentaActualizar = Database['public']['Tables']['sales']['Update'];

export type ArticuloVenta = Database['public']['Tables']['sale_items']['Row'];
export type ArticuloVentaInsertar = Database['public']['Tables']['sale_items']['Insert'];
export type ArticuloVentaActualizar = Database['public']['Tables']['sale_items']['Update'];

// Tipos de vistas
export type ProductoStockBajo = Database['public']['Views']['low_stock_products']['Row'];
export type ValuacionInventario = Database['public']['Views']['inventory_valuation']['Row'];
export type ActividadReciente = Database['public']['Views']['recent_activity']['Row'];

// Tipos personalizados para operaciones comerciales
export interface EntradaArticuloVenta {
  id_producto: string;
  nombre_producto?: string;
  cantidad: number;
  precio_unitario: number;
  descuento?: number;
  costo_unitario?: number; // Costo del repuesto al momento de la venta
  is_dropship?: boolean;
  provider_name?: string | null;
  provider_cost?: number;
  reservation_id?: string;
}

export interface EntradaCrearVenta {
  nombre_cliente?: string;
  cedula_cliente?: string;
  telefono_cliente?: string;
  email_cliente?: string;
  ciudad_cliente?: string;
  direccion_cliente?: string;
  id_cuenta: string;
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';
  articulos: EntradaArticuloVenta[];
  impuesto?: number;
  descuento?: number;
  costo_envio?: number; // Costo que paga el negocio por el envío
  id_cuenta_envio?: string; // Cuenta desde donde se paga el envío
  notas?: string;
  source?: 'POS' | 'WHATSAPP' | 'NOTION' | 'API' | 'OTHER'; // BPMN: Lane_Communication
}

export interface EntradaCrearCompra {
  nombre_proveedor?: string;
  id_cuenta?: string; // Optional because free entry doesn't need account
  metodo_pago?: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'; // Optional for same reason
  es_ingreso_gratuito?: boolean;
  iva_tax?: number; // IVA percentage (e.g., 15 for 15%)
  profit_margin?: number; // Profit margin percentage (e.g., 65 for 65%)
  discount_percent?: number; // NEW: C2.6.1 Discount Earnings
  articulos: {
    id_producto: string;
    cantidad: number;
    costo_unitario: number;
  }[];
  notas?: string;
}

export interface EntradaCrearGasto {
  descripcion: string;
  monto: number;
  id_cuenta: string;
  id_categoria?: string; // Nominal Account
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';
  numero_referencia?: string;
  notas?: string;
}

export interface EntradaCrearIngreso {
  descripcion: string;
  monto: number;
  id_cuenta: string;
  id_categoria?: string; // Nominal Account
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';
  numero_referencia?: string;
  notas?: string;
  // Campos opcionales para flujo de venta de repuestos (Income + Expenses)
  costo_repuesto?: number;
  id_cuenta_costo?: string;
  costo_envio?: number;
  id_cuenta_envio?: string;
}

export interface EntradaCrearTransferencia {
  id_cuenta_origen: string;
  id_cuenta_destino: string;
  monto: number;
  descripcion: string;
  notas?: string;
}

// Tipos de datos del panel
export interface EstadisticasPanel {
  saldoTotal: number;
  valorInventarioTotal: number;
  costoInventarioTotal: number;
  cantidadStockBajo: number;
  totalProductos: number;
  ventasHoy: number;
  gastosHoy: number;
}

// Producto con información extendida
export interface ProductoConStock extends Producto {
  esStockBajo: boolean;
  porcentajeStock: number;
}

// Alias para compatibilidad hacia atrás
export type Product = Producto;
export type ProductInsert = ProductoInsertar;
export type ProductUpdate = ProductoActualizar;
export type Account = Cuenta;
export type AccountInsert = CuentaInsertar;
export type AccountUpdate = CuentaActualizar;
export type Transaction = Transaccion;
export type TransactionInsert = TransaccionInsertar;
export type TransactionUpdate = TransaccionActualizar;
export type InventoryMovement = MovimientoInventario;
export type InventoryMovementInsert = MovimientoInventarioInsertar;
export type InventoryMovementUpdate = MovimientoInventarioActualizar;
export type Sale = Venta;
export type SaleInsert = VentaInsertar;
export type SaleUpdate = VentaActualizar;
export type SaleItem = ArticuloVenta;
export type SaleItemInsert = ArticuloVentaInsertar;
export type SaleItemUpdate = ArticuloVentaActualizar;
export type LowStockProduct = ProductoStockBajo;
export type InventoryValuation = ValuacionInventario;
export type RecentActivity = ActividadReciente;
export type SaleItemInput = EntradaArticuloVenta;
export type CreateSaleInput = EntradaCrearVenta;
export type CreatePurchaseInput = EntradaCrearCompra;
export type CreateExpenseInput = EntradaCrearGasto;
export type CreateTransferInput = EntradaCrearTransferencia;
export type DashboardStats = EstadisticasPanel;
export type ProductWithStock = ProductoConStock;

export interface Cliente {
  id: string;
  identity_document: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  created_at: string;
}
export type Customer = Cliente;
