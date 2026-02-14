'use client';

import { useAccountTransactions, useAccounts } from '@/hooks/use-queries';
import { EditTransactionModal } from '@/components/transactions/edit-transaction-modal';
import { ArrowLeft, ArrowUpCircle, ArrowDownCircle, User, Loader2, FileText, Wallet, ArrowRightLeft, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime, cn, getAccountColor } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { TransferModal } from '@/components/transactions/transfer-modal';
import { EditAccountDrawer } from '@/components/accounts/edit-account-drawer';
import { Pencil, Scale } from 'lucide-react';

export default function AccountDetailsPage() {
  const params = useParams();
  const accountId = params.id as string;
  const { data: transactions, isLoading: loadingTx } = useAccountTransactions(accountId);
  const { data: accounts } = useAccounts();

  const account = accounts?.find(a => a.id === accountId);

  const [showTransfer, setShowTransfer] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);

  const transactionsWithBalance = useMemo(() => {
    if (!transactions || !account || transactions.length === 0) return [];

    // Sort transactions by date desc just to be safe, though they come sorted
    const sortedTx = [...transactions].sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let runningBalance = account.balance;

    const computedTx = sortedTx.map((tx: any) => {
      // Determine net flow relative to THIS account
      // Start with 0 (neutral) and add/subtract based on flow
      let netAmount = 0;

      // 1. Check strict account_in / account_out columns (Transfer logic)
      if (tx.account_in_id === accountId) {
        netAmount += tx.amount;
      }
      if (tx.account_out_id === accountId) {
        netAmount -= tx.amount;
      }

      // 2. Fallback for mixed/legacy data (Income/Expense on main account_id)
      // Only apply if neutral so far, to avoid double counting if ID appears in multiple places (unlikely but safe)
      if (netAmount === 0) {
        if (tx.type === 'INCOME' && tx.account_id === accountId) {
          netAmount += tx.amount;
        } else if (tx.type === 'EXPENSE' && tx.account_id === accountId) {
          netAmount -= tx.amount;
        }
      }

      // The current runningBalance is the balance AFTER this transaction
      const balanceAfter = runningBalance;

      // Calculate balance BEFORE this transaction (which is balance AFTER the next older one)
      // Only subtract the net impact to reverse time
      runningBalance -= netAmount;

      return {
        ...tx,
        netAmount,
        balanceAfter
      };
    });

    // Filter out transactions that have NO impact on this account's balance
    // Exception: Explicit Adjustment types might have 0 value but usually adjustments have impact.
    // If user wants to see "Split Category" 0-sum events, we keep them if type is special or explicit override.
    return computedTx.filter(tx => tx.netAmount !== 0 || tx.type === 'ADJUSTMENT');
  }, [transactions, account, accountId]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 transition-colors">
      <EditTransactionModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
      />
      {/* Transfer Modal */}
      {account && accounts && (
        <TransferModal
          isOpen={showTransfer}
          onClose={() => setShowTransfer(false)}
          sourceAccount={account}
          accounts={accounts}
        />
      )}

      {/* Edit Drawer */}
      {account && (
        <EditAccountDrawer
          account={account}
          isOpen={showEdit}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-md mx-auto flex h-16 items-center gap-4 px-4">
          <Link href="/">
            <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
            </button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {account?.name || 'Detalles de Cuenta'}
              </h1>
              {account && (
                <button
                  onClick={() => setShowEdit(true)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-blue-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Movimientos
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Balance Card */}
        {account && (
          <div className={cn(
            "rounded-2xl p-6 shadow-lg relative overflow-hidden bg-gradient-to-br",
            getAccountColor(account.name).gradient,
            getAccountColor(account.name).text
          )}>
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 opacity-70" />
                <p className="text-sm opacity-80">Saldo Actual</p>
              </div>
              <h2 className="text-4xl font-bold mb-4 tracking-tight">
                {formatCurrency(account.balance)}
              </h2>

              <div className="flex justify-between items-end">
                <p className="text-xs uppercase tracking-wider font-semibold border border-current px-2 py-1 rounded opacity-70">
                  {account.type}
                </p>

                {/* Transfer Button */}
                <button
                  onClick={() => setShowTransfer(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-900/50 transition-all active:scale-95 z-20"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  TRANSFERIR
                </button>
              </div>
            </div>
          </div>
        )}

        {loadingTx ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>No hay movimientos registrados en esta cuenta</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Historial de Transacciones</h3>
            {transactionsWithBalance.map((tx: any) => {
              // Logic STRICTLY based on netAmount calculated in useMemo
              const isPositive = tx.netAmount > 0;
              const isNegative = tx.netAmount < 0;
              // Even if it's 0 (Adjustment), we default to gray or neutral, but here we assume filtered unless Adjustment
              const neutral = tx.netAmount === 0;

              // Color determination
              const showGreen = isPositive;
              const showRed = isNegative;

              // Check if it's a transfer involving another known bank to apply colors to the row
              let otherAccountName = '';
              if (tx.account_in_id && tx.account_out_id) {
                // If I am receiving (Green), show who sent it (Source)
                // If I am sending (Red), show who received it (Dest)
                otherAccountName = showGreen ? tx.account_out?.name : tx.account_in?.name;
              }
              const otherAccountColors = otherAccountName ? getAccountColor(otherAccountName) : null;

              return (
                <div
                  key={tx.id}
                  className={cn(
                    "bg-white dark:bg-slate-900 p-4 rounded-xl border shadow-sm transition-all",
                    tx.is_adjustment
                      ? "bg-amber-50/50 dark:bg-amber-900/10 border-l-4 border-l-amber-400 border-t-amber-200/50 border-r-amber-200/50 border-b-amber-200/50"
                      : otherAccountColors?.border
                        ? `border-l-4 ${otherAccountColors.border.replace('border-', 'border-l-')}`
                        : "border-slate-200 dark:border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      {showGreen ? (
                        <div className={cn("p-2 rounded-full", otherAccountColors ? otherAccountColors.iconBg : "bg-emerald-100")}>
                          <ArrowDownCircle className={cn("h-5 w-5", otherAccountColors ? otherAccountColors.iconColor : "text-emerald-600")} />
                        </div>
                      ) : showRed ? (
                        <div className={cn("p-2 rounded-full", otherAccountColors ? otherAccountColors.iconBg : "bg-rose-100")}>
                          <ArrowUpCircle className={cn("h-5 w-5", otherAccountColors ? otherAccountColors.iconColor : "text-rose-600")} />
                        </div>
                      ) : (
                        // Neutral / 0 case
                        <div className={cn("p-2 rounded-full", "bg-slate-100 dark:bg-slate-800")}>
                          <Scale className={cn("h-5 w-5", "text-slate-500")} />
                        </div>
                      )}

                      {/* Overwrite icon for Adjustments */}
                      {tx.is_adjustment && (
                        <div className="absolute left-4 p-2 rounded-full bg-amber-100 text-amber-600">
                          <Scale className="h-5 w-5" />
                        </div>
                      )}

                      <div className={tx.is_adjustment ? "ml-2" : ""}>
                        {otherAccountName ? (
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                              {showGreen ? 'Recibido de:' : 'Enviado a:'}
                            </span>
                            <p className={cn("font-bold text-sm", otherAccountColors?.iconColor)}>
                              {otherAccountName}
                            </p>
                          </div>
                        ) : (
                          <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm line-clamp-1">
                            {tx.description}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatDateTime(tx.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className={cn(
                        "font-bold text-sm whitespace-nowrap",
                        showGreen ? "text-emerald-600" : showRed ? "text-rose-600" : "text-slate-600"
                      )}>
                        {formatCurrency(tx.netAmount)}
                      </div>
                      <div className={cn(
                        "text-[11px] font-bold mt-0.5",
                        account ? getAccountColor(account.name).text : "text-slate-500 dark:text-slate-400"
                      )}>
                        {formatCurrency(tx.balanceAfter)}
                      </div>
                    </div>
                  </div>

                  {/* Detalle extra si NO es transferencia bancaria (porque ya mostramos el nombre arriba) o si tiene nota */}
                  {(!otherAccountName || tx.notes) && (
                    <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800 pt-2 mt-2">
                      {!otherAccountName && (
                        <p className="italic">{tx.description}</p>
                      )}
                      {tx.notes && (
                        <p className="text-slate-400 dark:text-slate-500">Nota: {tx.notes}</p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    {tx.reference_number && (
                      <div className="flex justify-between">
                        <span>Ref:</span>
                        <span className="font-mono">{tx.reference_number}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-slate-400 dark:text-slate-500 mt-1">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{tx.created_by_name || 'Sistema'}</span>
                      </div>
                      <button
                        onClick={() => setEditingTx(tx)}
                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded hover:text-blue-600 transition-colors"
                        title="Editar detalles"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
