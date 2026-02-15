'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ArrowRightLeft, Check, Loader2, DollarSign } from 'lucide-react';
import { Account } from '@/types';
import { crearTransferencia } from '@/lib/services/transactions';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalDrafts } from '@/hooks/use-local-drafts';
import { DraftManager } from '@/components/common/draft-manager';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceAccount: Account;
  accounts: Account[];
}

export function TransferModal({ isOpen, onClose, sourceAccount, accounts }: TransferModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);

  // Form State
  const [currentSourceId, setCurrentSourceId] = useState(sourceAccount.id);
  const [destinationId, setDestinationId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // ── Draft integration ────────────────────────────────────────
  const { saveDraft, getLatestDraft, clearDrafts } = useLocalDrafts('transfer_new');

  const getFormState = useCallback(() => ({
    currentSourceId,
    destinationId,
    amount,
    description,
  }), [currentSourceId, destinationId, amount, description]);

  const applyFormState = useCallback((state: any) => {
    if (state.currentSourceId) setCurrentSourceId(state.currentSourceId);
    if (state.destinationId) setDestinationId(state.destinationId);
    if (state.amount !== undefined) setAmount(state.amount);
    if (state.description !== undefined) setDescription(state.description);
  }, []);

  // Auto-save draft on change
  useEffect(() => {
    if (isOpen && currentDraftId) {
      saveDraft(getFormState(), undefined, currentDraftId);
    }
  }, [getFormState, saveDraft, isOpen, currentDraftId]);

  // Auto-load latest draft when modal opens
  useEffect(() => {
    if (isOpen) {
      const latest = getLatestDraft();
      if (latest) {
        applyFormState(latest.data);
        setCurrentDraftId(latest.id);
      } else {
        setCurrentDraftId(crypto.randomUUID());
      }
    }
  }, [isOpen, getLatestDraft, applyFormState]);

  const handleNewDraft = () => {
    clearDrafts();
    setDestinationId('');
    setAmount('');
    setDescription('');
    setCurrentDraftId(crypto.randomUUID());
  };

  if (!isOpen) return null;

  const currentSource = accounts.find(a => a.id === currentSourceId) || sourceAccount;
  const validDestinationAccounts = accounts.filter(a => a.id !== currentSourceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!destinationId) {
      setError('Selecciona una cuenta de destino');
      return;
    }

    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setError('Ingresa un monto válido');
      return;
    }

    if (amountFloat > currentSource.balance) {
      setError('Saldo insuficiente para esta transferencia');
      return;
    }


    setLoading(true);

    try {
      const result = await crearTransferencia({
        id_cuenta_origen: currentSourceId,
        id_cuenta_destino: destinationId,
        monto: amountFloat,
        descripcion: description || `Transferencia a ${validDestinationAccounts.find(a => a.id === destinationId)?.name}`,
      });

      if (!result.success) {
        throw new Error('Error al realizar la transferencia');
      }
      // Invalidate queries to refresh UI immediately
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });


      setSuccess(true);

      // Esperar un toque para que el usuario vea el éxito
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setAmount('');
        setDescription('');
        setDestinationId('');
        router.refresh();
      }, 1500);

    } catch (err) {
      setError('Ocurrió un error al procesar la transferencia');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">

        {/* Header */}
        <div className="bg-slate-900 dark:bg-slate-950 p-4 flex justify-between items-center border-b border-slate-800">
          <h3 className="text-white font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            Transferir Fondos
          </h3>
          <div className="flex items-center gap-2">
            <DraftManager
              namespace="transfer_new"
              onLoad={(draft) => {
                applyFormState(draft.data);
                setCurrentDraftId(draft.id);
              }}
              onNew={handleNewDraft}
            />
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8 animate-in zoom-in duration-300">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">¡Transferencia Exitosa!</h4>
              <p className="text-slate-500 dark:text-slate-400 text-sm">El dinero se ha movido correctamente.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Origen (Selector) */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Desde (Origen)</label>
                <select
                  value={currentSourceId}
                  onChange={(e) => {
                    setCurrentSourceId(e.target.value);
                    setDestinationId(''); // Reset destination to avoid conflict
                  }}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${acc.balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Destino */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cuenta Destino</label>
                <div className="grid grid-cols-2 gap-2">
                  {validDestinationAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setDestinationId(account.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${destinationId === account.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40 ring-2 ring-blue-100 dark:ring-blue-900'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                      <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">{account.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">${account.balance.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Monto a transferir</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 text-lg font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nota (Opcional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Ahorro semanal"
                  className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Mensaje de error */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex gap-2 items-center animate-in slide-in-from-top-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {error}
                </div>
              )}

              {/* Botón de acción */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:active:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    Transferir Dinero
                    <ArrowRightLeft className="w-5 h-5" />
                  </>
                )}
              </button>

            </form>
          )}
        </div>
      </div>
    </div>
  );
}
