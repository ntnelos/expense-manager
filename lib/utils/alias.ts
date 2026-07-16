import { createServerClient } from '@/lib/supabase/server';

/**
 * Checks if a given supplier name matches any defined aliases,
 * and if so, returns the alias name. Otherwise returns the original name.
 */
export async function applySupplierAlias(supplierName: string | null): Promise<string | null> {
  if (!supplierName) return null;
  
  const supabase = createServerClient();
  
  // Fetch all aliases (assuming the list is relatively small)
  const { data: aliases, error } = await supabase
    .from('supplier_aliases')
    .select('original_name, alias_name');
    
  if (error || !aliases || aliases.length === 0) {
    return supplierName;
  }
  
  const lowerName = supplierName.toLowerCase();
  
  // Look for a match. We use includes() so that partial names (e.g., "atp logic")
  // match full OCR names (e.g., "atp logic ltd").
  for (const alias of aliases) {
    if (lowerName.includes(alias.original_name.toLowerCase())) {
      return alias.alias_name;
    }
  }
  
  return supplierName;
}
