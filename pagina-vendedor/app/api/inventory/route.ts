import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper to parse CSV line respecting quotes
function parseCSVLine(line: string): string[] {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function cleanPrice(priceStr: string): number {
  if (!priceStr) return 0;
  // Remove $ and ,
  const clean = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function cleanStock(stockStr: string): number {
  if (!stockStr) return 0;
  const clean = stockStr.replace(/[,]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export async function GET() {
  try {
    const csvPath = path.join(process.cwd(), 'inventario.csv');
    
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: 'Inventory file not found' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = fileContent.split('\n');
    
    // Headers are on line 0
    // We expect: DESCRIPCION," COSTO SIN IVA",...,CODIGO PROVEEDOR,Cantidad Actual,...,"PVP UN ",...
    // Indices based on inspection:
    // CODIGO PROVEEDOR -> 4
    // Cantidad Actual -> 5
    // PVP UN -> 9 (careful verify with header check)
    
    const headers = parseCSVLine(lines[0]);
    const codigoIndex = headers.findIndex(h => h.includes('CODIGO PROVEEDOR'));
    const stockIndex = headers.findIndex(h => h.includes('Cantidad Actual'));
    const pvpIndex = headers.findIndex(h => h.includes('PVP UN'));

    if (codigoIndex === -1 || stockIndex === -1 || pvpIndex === -1) {
       return NextResponse.json({ error: 'Invalid CSV format' }, { status: 500 });
    }

    const inventory = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cols = parseCSVLine(line);
      const codigo = cols[codigoIndex];
      const stock = cleanStock(cols[stockIndex]);
      const pvp = cleanPrice(cols[pvpIndex]);
      
      if (codigo) {
        inventory.push({
          codigo_referencia: codigo,
          precio: pvp,
          stock: stock > 0
        });
      }
    }

    return NextResponse.json(inventory, {
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow CORS for catalogo-motos
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-store' // Always fresh
      }
    });

  } catch (error) {
    console.error('Error reading inventory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS() {
    return NextResponse.json({}, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        }
    });
}
