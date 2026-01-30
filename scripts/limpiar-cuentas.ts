import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan las variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CUENTAS_VALIDAS = [
  'Banco Pichincha Katiuska',
  'Banco Guayaquil Katiuska',
  'Efectivo'
];

async function main() {
  console.log('🧹 Iniciando limpieza de cuentas...');
  console.log(`✅ Cuentas permitidas: ${CUENTAS_VALIDAS.join(', ')}`);

  // 1. Obtener todas las cuentas activas
  const { data: accounts, error: fetchError } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('is_active', true);

  if (fetchError) {
    console.error('Error al obtener cuentas:', fetchError);
    return;
  }

  if (!accounts) return;

  const cuentasAJoDesactivar = accounts.filter(a => !CUENTAS_VALIDAS.includes(a.name));

  if (cuentasAJoDesactivar.length === 0) {
    console.log('✨ No hay cuentas extrañas para desactivar.');
    return;
  }

  console.log(`found ${cuentasAJoDesactivar.length} cuentas para desactivar:`);
  cuentasAJoDesactivar.forEach(c => console.log(`   - ${c.name}`));

  // 2. Desactivarlas
  const ids = cuentasAJoDesactivar.map(c => c.id);
  const { error: updateError } = await supabase
    .from('accounts')
    .update({ is_active: false })
    .in('id', ids);

  if (updateError) {
    console.error('Error al desactivar cuentas:', updateError);
  } else {
    console.log('🗑️ Cuentas desactivadas correctamente.');
  }
}

main();
