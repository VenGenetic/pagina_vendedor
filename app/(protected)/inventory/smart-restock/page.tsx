'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SmartReplenishmentItem, ReplenishmentCalculation } from '@/types/replenishment';
import { formatCurrency } from '@/lib/utils';
import { Loader2, Download, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import Papa from 'papaparse';

export default function SmartRestockPage() {
  // const supabase = createClientComponentClient(); // Removed
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReplenishmentCalculation[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: viewData, error } = await supabase
        .from('view_smart_replenishment')
        .select('*');

      if (error) throw error;

      // Apply Client-Side Logic (Capping & Status)
      const calculatedData: ReplenishmentCalculation[] = (viewData as any[]).map((item: SmartReplenishmentItem) => {
        // 1. Calculate Reorder Point
        // Formula: (Velocity * LeadTime) + SafetyStock
        // Lead Time defaults to 2 days for now (as per "weekend warrior" concern implying short cycles but reliability issues)
        // Adjust Lead Time as needed.
        const LEAD_TIME_DAYS = 2; // Can be a configurable setting later
        const reorderPoint = (item.weighted_velocity * LEAD_TIME_DAYS) + item.dynamic_safety_stock;

        // 2. Calculate Raw Need
        // Target Level could be Reorder Point * 1.5? Or just Reorder Point?
        // Let's assume Target Level is "Stock up to Reorder Point + 3 Days Sales"
        // User Logic: "Final_Buy = MIN(Raw_Need, (20 - Current_Stock))"
        // This implies MAX SHELF CAP is 20.
        const MAX_SHELF_CAP = 20;

        // Logical Target: We want to be at MAX_SHELF_CAP if velocity supports it, or Reorder Point?
        // The user says: "Raw_Need (Target Level - Current Stock)"
        // Let's define Target Level = MAX_SHELF_CAP for simplicity in this constrained model, 
        // OR Dynamic Target = Reorder Point.
        // Given the "Max 20" rule, let's treat 20 as the absolute ceiling.

        // Let's use Reorder Point as the "Minimum we need to have". 
        // If Current < Reorder Point, we need to buy.
        // Buy target = MAX_SHELF_CAP (Fill the shelf).

        let rawNeed = 0;
        let status: 'CRITICAL' | 'REORDER' | 'OK' | 'OVERSTOCK' = 'OK';

        // Critical: Stock is 0 or less than 1 day of sales
        if (item.current_stock <= item.weighted_velocity) {
          status = 'CRITICAL';
        } else if (item.current_stock <= reorderPoint) {
          status = 'REORDER';
        } else if (item.current_stock > MAX_SHELF_CAP) {
          status = 'OVERSTOCK';
        }

        // Logic for Buy Qty
        if (status === 'CRITICAL' || status === 'REORDER') {
          // We want to fill up to MAX_SHELF_CAP, but respecting the velocity? 
          // User requirement: "Final_Buy = MIN(Raw_Need, (20 - Current_Stock))"
          // where Raw_Need = "Target Level - Current Stock"

          // If we assume Target Level is the Max Cap (20):
          const targetLevel = MAX_SHELF_CAP; // Simple interpretation
          const theoreticalNeed = targetLevel - item.current_stock;

          // However, the rule "MIN(Raw_Need, (20 - current))" implies Raw_Need is something else.
          // Maybe Raw_Need = Reorder Point + Fixed Reorder Qty?
          // Let's interpret "Raw_Need" as "What we ideally want given velocity"
          // Ideal Stock = Lead Time Demand + Safety Stock + Cycle Stock (e.g. 7 days supply)
          const CYCLE_DAYS = 7;
          const idealTarget = reorderPoint + (item.weighted_velocity * CYCLE_DAYS);

          rawNeed = Math.max(0, idealTarget - item.current_stock);
        }

        // 3. Capping Logic
        const spaceToCap = Math.max(0, MAX_SHELF_CAP - item.current_stock);
        const finalBuy = Math.min(rawNeed, spaceToCap);

        // Determine Status Label for UI
        if (item.replenishment_status === 'DO_NOT_BUY') status = 'OVERSTOCK'; // Force status if metric says dead
        if (item.replenishment_status === 'MANUAL_REVIEW_NEW') status = 'OK'; // Don't auto-reorder new stuff blindly? Or flag as Manual?

        return {
          ...item,
          suggested_reorder_point: reorderPoint,
          raw_need: rawNeed,
          final_buy_qty: Math.ceil(finalBuy), // Integer units
          uncapped_need: Math.ceil(rawNeed),
          is_capped: rawNeed > spaceToCap,
          status_label: status
        };
      });

      // Sort by Status Priority: CRITICAL > REORDER > OVERSTOCK > OK
      const statusPriority = { 'CRITICAL': 0, 'REORDER': 1, 'OK': 2, 'OVERSTOCK': 3 };
      calculatedData.sort((a, b) => statusPriority[a.status_label] - statusPriority[b.status_label]);

      setData(calculatedData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    // Generate CSV data matches user requirement:
    // Status | SKU | Name | Suggested Buy Qty | Uncapped Need
    const csvData = data.map(item => ({
      Status: item.status_label,
      SKU: item.sku,
      Name: item.name,
      'Suggested Buy Qty': item.final_buy_qty,
      'Uncapped Need': item.uncapped_need,
      'Current Stock': item.current_stock,
      'Weighted Velocity': item.weighted_velocity.toFixed(2),
      'Logic Note': item.is_capped ? 'Capped by Max 20' : ''
    }));

    const csvUser = Papa.unparse(csvData);
    const blob = new Blob([csvUser], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart_replenishment_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Smart Replenishment</h1>
          <p className="text-slate-500 dark:text-slate-400">Weighted velocity & dynamic reorder analysis</p>
        </div>
        <button
          onClick={downloadCSV}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold shadow-sm transition-colors"
        >
          <Download className="w-5 h-5" />
          Descargar CSV
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Velocity</th>
                <th className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/10">Buy Qty</th>
                <th className="px-4 py-3 text-right text-slate-400">Uncapped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((item) => (
                <tr key={item.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${item.status_label === 'CRITICAL' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900' :
                      item.status_label === 'REORDER' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900' :
                        item.status_label === 'OVERSTOCK' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-900' :
                          'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900'
                      }`}>
                      {item.status_label === 'CRITICAL' && <XCircle className="w-3 h-3" />}
                      {item.status_label === 'REORDER' && <AlertTriangle className="w-3 h-3" />}
                      {item.status_label === 'OK' && <CheckCircle className="w-3 h-3" />}
                      {item.status_label === 'OVERSTOCK' && <Info className="w-3 h-3" />}
                      {item.status_label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{item.current_stock}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{item.weighted_velocity.toFixed(2)}/day</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10">
                    {item.final_buy_qty}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {item.is_capped ? (
                      <span className="text-amber-500 font-medium" title="Capped by Max 20 Rule">{item.uncapped_need}</span>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No data available or view not created.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
