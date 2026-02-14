// Advanced search algorithm based on catalog-motos search system
// This provides intelligent search with synonym expansion, relevance scoring, and fuzzy matching

interface SearchableProduct {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  brand?: string | null;
  description?: string | null;
  cost_price?: number;
  selling_price?: number;
  stock?: number;
  image_url?: string | null;
  [key: string]: any; // Allow additional properties
}

// Synonym expansion for common motorcycle parts
const SINONIMOS: Record<string, string[]> = {
  'freno': ['frenos', 'frenado', 'pastilla', 'pastillas', 'disco', 'tambor'],
  'filtro': ['filtro', 'filtrar', 'filtrado'],
  'aceite': ['aceite', 'lubricante', 'motor oil', 'oil'],
  'bateria': ['batería', 'baterías', 'acumulador'],
  'cadena': ['cadena', 'transmisión', 'piñón', 'piñon'],
  'amortiguador': ['amortiguadores', 'suspensión', 'suspension', 'shock'],
  'llanta': ['llantas', 'neumático', 'neumáticos', 'neumatico', 'neumaticos', 'rueda', 'ruedas'],
  'faro': ['faros', 'luz', 'luces', 'farola'],
  'escape': ['escape', 'silenciador', 'tubo', 'caño'],
  'motor': ['motor', 'cilindro', 'cilindros', 'piston', 'pistones'],
  'clutch': ['clutch', 'embrague', 'clutches'],
  'velocimetro': ['velocímetro', 'velocimetros', 'instrumentos', 'panel', 'tablero', 'tacometro', 'tacómetro', 'reloj', 'cuenta'],
  'carburador': ['carburador', 'carburadores', 'inyección', 'inyeccion', 'inyector', 'diafragma'],
  'arranque': ['arranque', 'starter', 'partida'],
  'electrico': ['eléctrico', 'eléctrica', 'eléctricos', 'eléctricas', 'electricidad'],
  'retrovisor': ['retrovisor', 'espejo', 'espejos'],
  'tanque': ['tanque', 'deposito', 'depósito', 'gasolina'],
  'guardafango': ['guardafango', 'guardabarros', 'salpicadera'],
  'manubrio': ['manubrio', 'manillar', 'manija'],
  'palanca': ['palanca', 'maneta'],
};

// Clean text for search (Exact implementation from catalogo-motos)
const limpiarTexto = (texto: string): string => {
  if (!texto) return '';
  return String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Expand search terms with synonyms (Exact implementation from catalogo-motos)
const expandirTerminos = (terminos: string[]): string[] => {
  const sinonimos: Record<string, string[]> = {
    'freno': ['frenos', 'frenado', 'pastilla', 'pastillas', 'disco', 'tambor'],
    'filtro': ['filtro', 'filtrar', 'filtrado'],
    'aceite': ['aceite', 'lubricante', 'motor oil', 'oil'],
    'bateria': ['batería', 'baterías', 'acumulador'],
    'cadena': ['cadena', 'transmisión', 'piñón', 'piñon'],
    'amortiguador': ['amortiguadores', 'suspensión', 'suspension', 'shock'],
    'llanta': ['llantas', 'neumático', 'neumáticos', 'neumatico', 'neumaticos', 'rueda', 'ruedas'],
    'faro': ['faros', 'luz', 'luces', 'farola'],
    'escape': ['escape', 'silenciador', 'tubo', 'caño'],
    'motor': ['motor', 'cilindro', 'cilindros', 'piston', 'pistones'],
    'clutch': ['clutch', 'embrague', 'clutches'],
    'velocimetro': ['velocímetro', 'velocimetros', 'instrumentos', 'panel', 'tablero', 'tacometro', 'tacómetro'],
    'carburador': ['carburador', 'carburadores', 'inyección', 'inyeccion', 'inyector'],
    'arranque': ['arranque', 'starter', 'partida'],
    'electrico': ['eléctrico', 'eléctrica', 'eléctricos', 'eléctricas', 'electricidad'],
    'retrovisor': ['retrovisor', 'espejo', 'espejos'],
    'tanque': ['tanque', 'deposito', 'depósito', 'gasolina'],
    'guardafango': ['guardafango', 'guardabarros', 'salpicadera'],
    'manubrio': ['manubrio', 'manillar', 'manija'],
    'palanca': ['palanca', 'maneta'],
    'empaque': ['empaque', 'junta', 'empaques', 'juntas']
  };

  const expandidos = new Set<string>();

  terminos.forEach(termino => {
    expandidos.add(termino);
    Object.entries(sinonimos).forEach(([clave, valores]) => {
      if (clave.includes(termino) || valores.some(v => v.includes(termino))) {
        valores.forEach(sinonimo => expandidos.add(sinonimo));
      }
    });
  });

  return Array.from(expandidos);
};

// Calculate relevance score for a product (Exact implementation from catalogo-motos)
const calcularRelevancia = (producto: SearchableProduct, terminos: string[], fullSearchTerm?: string): number => {
  // Construct textoBusqueda like in catalogo-motos (joined then cleaned)
  // UPDATED: Added brand and generic object values search to ensure everything is indexed
  const textoBusqueda = limpiarTexto(
    `${producto.name || ''} ${producto.sku || ''} ${producto.category || ''} ${producto.brand || ''} ${producto.description || ''}`
  );

  // Note: These are raw lowercased, not fully cleaned, as per catalogo-motos logic
  const nombre = (producto.name || '').toLowerCase();
  const codigo = (producto.sku || '').toLowerCase();

  let puntuacion = 0;
  const terminosExpandidos = expandirTerminos(terminos);

  // Exact phrase match for SKU in quotes (from catalogo-motos)
  if (fullSearchTerm && fullSearchTerm.includes('"')) {
    const match = fullSearchTerm.match(/"([^"]+)"/);
    if (match && codigo.includes(match[1].toLowerCase())) {
      return 1000;
    }
  }

  // Weighted OR Implementation:
  // Track how many original terms are matched to apply a multiplier
  let terminosEncontrados = 0;

  // Iterate over original terms
  for (const termino of terminos) {
    const terminoLower = termino.toLowerCase();
    let termMatch = false;

    // Direct Match Logic
    if (codigo.includes(terminoLower)) { puntuacion += 50; termMatch = true; }
    if (nombre.startsWith(terminoLower)) { puntuacion += 30; termMatch = true; }
    if (nombre.includes(terminoLower)) { puntuacion += 20; termMatch = true; }
    if (textoBusqueda.includes(terminoLower)) { puntuacion += 10; termMatch = true; }

    // Position Bonus
    const posicion = textoBusqueda.indexOf(terminoLower);
    if (posicion >= 0) {
      puntuacion += Math.max(0, 10 - Math.floor(posicion / 10));
    }

    // Synonym Logic for this term
    const sinonimos = expandirTerminos([termino]).filter(s => s !== termino);
    for (const sinonimo of sinonimos) {
      const sinLower = sinonimo.toLowerCase();
      if (textoBusqueda.includes(sinLower)) {
        puntuacion += 5; // Lower score for synonym match
        termMatch = true;
      }
    }

    if (termMatch) {
      terminosEncontrados++;
    }
  }

  // Bonus for matching more words (Weighted OR)
  if (terminosEncontrados > 0) {
    puntuacion *= (1 + (terminosEncontrados * 0.2)); // 20% boost per matched word
  }

  // Check if ALL terms are present (fuzzy AND logic) - The "Elite" feature
  // We check against the full text string to ensure "velocimeter wolf" matches both
  // UPDATED: Now checks synonyms too so "velocimetro wolf" matches "tablero wolf"
  const allTermsPresent = terminos.every(t => {
    // Check strict match first
    const tClean = t.toLowerCase();
    // Use the cleaned, expanded textoBusqueda which now includes BRAND
    if (textoBusqueda.includes(tClean)) return true;

    // Check expanded synonyms
    // Note: expandirTerminos already includes the original term, but we check specifically
    // for any variant that matches the cleaned product text
    const variants = expandirTerminos([t]);
    // FIX: Must clean the variant text before checking inclusion against cleaned textoBusqueda
    // This ensures synonyms with accents (like 'pistón') match against normalized text ('piston')
    return variants.some(v => textoBusqueda.includes(limpiarTexto(v)));
  });

  if (allTermsPresent && terminos.length > 1) {
    puntuacion += 20000; // Massive boost to ensure AND matches are always top priority
  }

  // REMOVED: Stock penalty. Logic moved to sorting.

  return puntuacion;
};

/**
 * Advanced search function for motorcycle parts
 * @param products - Array of products to search
 * @param searchTerm - User search input
 * @param modelFilter - Optional model/brand filter (e.g., "wolf", "bws")
 * @returns Filtered and sorted products by relevance
 */
export const advancedProductSearch = <T extends SearchableProduct>(
  products: T[],
  searchTerm: string,
  modelFilter?: string
): T[] => {
  if (!searchTerm.trim() && !modelFilter?.trim()) {
    // Default Sort: Stock First even without search
    return [...products].sort((a, b) => {
      const stockA = (a.stock !== undefined ? a.stock : a.current_stock) > 0;
      const stockB = (b.stock !== undefined ? b.stock : b.current_stock) > 0;
      if (stockA && !stockB) return -1;
      if (!stockA && stockB) return 1;
      return 0;
    });
  }

  const terminos = searchTerm ? limpiarTexto(searchTerm).split(' ').filter(t => t.length > 0) : [];
  const modeloLimpio = modelFilter ? limpiarTexto(modelFilter) : '';

  const productosConPuntuacion = products
    .filter((p) => {
      // Filter by model if specified
      if (modeloLimpio) {
        const nombre = limpiarTexto(p.name || '');
        const sku = limpiarTexto(p.sku || '');
        const category = limpiarTexto(p.category || '');
        const textoCompleto = `${nombre} ${sku} ${category}`;

        if (!textoCompleto.includes(modeloLimpio)) {
          return false;
        }
      }

      // Filter by search terms
      if (terminos.length > 0) {
        const puntuacion = calcularRelevancia(p, terminos, searchTerm);
        return puntuacion > 3; // Minimum relevance threshold
      }

      return true;
    })
    .map((p) => ({
      ...p,
      relevancia: terminos.length > 0 ? calcularRelevancia(p, terminos, searchTerm) : 0
    }))
    .sort((a, b) => {
      // 1. Primary Sort Key: Stock > 0 (Stock First)
      const stockA = (a.stock !== undefined ? a.stock : a.current_stock) > 0;
      const stockB = (b.stock !== undefined ? b.stock : b.current_stock) > 0;

      if (stockA && !stockB) return -1; // A has stock, B does not -> A comes first
      if (!stockA && stockB) return 1;  // B has stock, A does not -> B comes first

      // 2. Secondary Sort Key: Relevance Score
      if (terminos.length > 0) {
        return (b as any).relevancia - (a as any).relevancia;
      }
      return 0;
    });

  return productosConPuntuacion;
};

/**
 * Legacy compatibility wrapper - maintains the same interface as the old advancedSearch
 */
export const advancedSearch = advancedProductSearch;
