import { Bike, Snowflake } from "lucide-react";

export const Logo = ({ className = "w-8 h-8", showText = false }: { className?: string, showText?: boolean }) => {
  return (
    <div className={`flex items-center gap-2 ${showText ? 'font-bold text-xl' : ''}`}>
      <div className={`relative flex items-center justify-center bg-blue-600 rounded-lg p-1.5 shadow-lg shadow-blue-500/20`}>
        <Bike className={`${className} text-white`} strokeWidth={2.5} />
      </div>
      {showText && (
        <span className="text-slate-800 dark:text-slate-100 tracking-tight">
          Moto<span className="text-blue-600">Partes</span>
        </span>
      )}
    </div>
  );
};
