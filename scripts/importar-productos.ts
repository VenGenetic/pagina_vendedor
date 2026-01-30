import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno desde .env.local
dotenv.config({ path: '.env.local' });

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración del CSV
const CSV_FILENAME = 'inventario.csv';
const BATCH_SIZE = 50;

// Mapeo de columnas (Basado en tu imagen)
const COLUMN_MAP = {
  sku: ['CODIGO PROVEEDOR', 'CODIGO', 'CODE', 'ID'],  // Buscará cualquiera de estos
  name: ['DESCRIPCION', 'NOMBRE', 'PRODUCTO', 'NAME'],
  cost: ['COSTO SIN IVA', 'COSTO', 'COST'],
  price: ['PVP UN', 'PVP', 'PRECIO', 'PRICE'],
  stock: ['Cantidad Actual', 'CANTIDAD', 'STOCK', 'QTY']
};

/**
 * Parser de CSV robusto que respeta comillas y comas internas
 */
function parseCSVLine(text: string) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuote = !inQuote;
    } else if (char === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  // Limpiar comillas envolventes
  return result.map(val => val.replace(/^"|"$/g, '').trim());
}

function parseCSV(content: string) {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // Usar el parser robusto para los encabezados
  const headers = parseCSVLine(lines[0]);
  console.log('📋 Columnas detectadas:', headers);
  
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    // Permitir filas con más columnas (ignorando las extra) o igual cantidad
    // Si tiene menos, probablemente es una línea corrupta
    if (values.length < headers.length) {
      if (i < 5) console.warn(`⚠️ Fila ${i+1} ignorada por falta de columnas. (Tiene ${values.length}, espera ${headers.length})`);
      continue;
    }

    const obj: any = {};
    headers.forEach((header, index) => {
      // Usar el valor correspondiente o string vacío si falta
      obj[header] = values[index] !== undefined ? values[index] : '';
    });
    result.push(obj);
  }
  return result;
}

function cleanMoney(value: string): number {
  if (!value) return 0;
  // Intenta manejar "$ 1,200.50" -> 1200.50
  return parseFloat(value.replace(/[$,]/g, '').trim()) || 0;
}

function findValue(row: any, variants: string[]) {
  // Búsqueda insensible a mayúsculas/minúsculas y espacios
  const rowKeys = Object.keys(row);
  for (const variant of variants) {
    const foundKey = rowKeys.find(k => k.toUpperCase().includes(variant.toUpperCase()));
    if (foundKey) return row[foundKey];
  }
  return null;
}

async function main() {
  const filePath = path.join(process.cwd(), CSV_FILENAME);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ No se encontró el archivo: ${CSV_FILENAME}`);
    return;
  }

  console.log('📖 Leyendo archivo CSV...');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(fileContent);

  console.log(`📊 Leídas ${rows.length} filas del archivo.`);
  console.log('🔄 Procesando y validando productos...');

  const productsToUpsert = [];
  const errors = [];
  let skippedCount = 0;

  for (const [index, row] of rows.entries()) {
    const sku = findValue(row, COLUMN_MAP.sku);
    const name = findValue(row, COLUMN_MAP.name);
    
    if (!sku || !name) {
      if (skippedCount < 3) {
        console.warn(`⚠️ Fila ${index + 2} saltada: Falta SKU ('${sku}') o Nombre ('${name}').`);
        console.warn('   Datos fila:', JSON.stringify(row, null, 2));
      }
      skippedCount++;
      continue;
    }

    const costStr = findValue(row, COLUMN_MAP.cost);
    const priceStr = findValue(row, COLUMN_MAP.price);
    const stockStr = findValue(row, COLUMN_MAP.stock);

    const product = {
      sku: sku.trim(),
      name: name.trim().substring(0, 200),
      cost_price: cleanMoney(costStr),
      selling_price: cleanMoney(priceStr),
      current_stock: parseInt(stockStr?.replace(/\D/g, '') || '0'), 
      min_stock_level: 5,
      is_active: true
    };

    productsToUpsert.push(product);
  }

  console.log(`\n🧐 Resumen de validación:`);
  console.log(`   ✅ Válidos para importar: ${productsToUpsert.length}`);
  console.log(`   🚫 Saltados (inválidos): ${skippedCount}`);
  
  if (productsToUpsert.length === 0) {
    console.error('❌ No se encontraron productos válidos para importar. Revisa los nombres de las columnas.');
    return;
  }

  console.log(`\n🚀 Iniciando carga a Supabase en lotes de ${BATCH_SIZE}...`); // Resto del código...

  // Procesar por lotes
  let processed = 0;
  for (let i = 0; i < productsToUpsert.length; i += BATCH_SIZE) {
    const batch = productsToUpsert.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'sku' }); // Actualiza si el SKU ya existe

    if (error) {
      console.error(`❌ Error en lote ${i} - ${i + BATCH_SIZE}:`, error.message);
      errors.push(error);
    } else {
      processed += batch.length;
      process.stdout.write(`\r✅ Procesados: ${processed} / ${productsToUpsert.length}`);
    }
  }

  console.log('\n\n🏁 Importación finalizada.');
  if (errors.length > 0) {
    console.log(`⚠️ Se encontraron ${errors.length} errores durante la carga.`);
  } else {
    console.log('🎉 Todo se cargó correctamente.');
  }
}

main().catch(console.error);
