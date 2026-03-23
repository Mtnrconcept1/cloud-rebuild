import { useState, useEffect, useRef } from "react";
import { Clock, Flame, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CountdownTimerProps {
  targetDate: Date;
  onExpire?: () => void;
  variant?: "default" | "compact" | "badge" | "large";
  color?: "amber" | "red" | "emerald" | "primary";
  showIcon?: boolean;
  label?: string;
}

function formatTime(totalSeconds: number) {
  if (totalSeconds <= 0) return { minutes: 0, seconds: 0, display: "00:00", isExpired: true };
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { minutes, seconds, display: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`, isExpired: false };
}

export default function CountdownTimer({ targetDate, onExpire, variant = "default", color = "amber", showIcon = true, label }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000)));
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) { expiredRef.current = true; onExpire?.(); clearInterval(interval); }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  const { minutes, seconds, display, isExpired } = formatTime(secondsLeft);
  const isUrgent = secondsLeft > 0 && secondsLeft <= 300;
  const isCritical = secondsLeft > 0 && secondsLeft <= 60;

  const colorMap = {
    amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20", fill: "bg-amber-500" },
    red: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20", fill: "bg-red-500" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", fill: "bg-emerald-500" },
    primary: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20", fill: "bg-primary" },
  };
  const c = isUrgent ? colorMap.red : colorMap[color];

  if (isExpired) return <Badge variant="destructive" className="gap-1 text-xs"><Clock className="h-3 w-3" /> Expiré</Badge>;

  if (variant === "badge") return (
    <Badge className={`gap-1 text-xs border-none ${isCritical ? "bg-red-500 text-white animate-pulse" : isUrgent ? "bg-red-500/90 text-white" : "bg-amber-500/90 text-white"}`}>
      {showIcon && (isUrgent ? <Flame className="h-3 w-3" /> : <Clock className="h-3 w-3" />)}{display}
    </Badge>
  );

  if (variant === "compact") return (
    <div className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold ${c.text} ${isCritical ? "animate-pulse" : ""}`}>
      {showIcon && (isUrgent ? <Flame className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />)}
      {label && <span className="font-sans font-medium">{label}</span>}{display}
    </div>
  );

  if (variant === "large") return (
    <div className={`rounded-2xl ${c.bg} border ${c.border} p-5 text-center space-y-2 ${isCritical ? "animate-pulse" : ""}`}>
      {showIcon && <div className="mx-auto w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">{isUrgent ? <Flame className="h-5 w-5 text-red-500" /> : <Zap className="h-5 w-5 text-amber-500" />}</div>}
      {label && <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>}
      <div className="flex items-center justify-center gap-1">
        <div className={`rounded-lg ${c.fill} text-white px-3 py-2`}><span className="text-3xl font-mono font-black">{String(minutes).padStart(2, "0")}</span></div>
        <span className={`text-3xl font-black ${c.text} animate-pulse`}>:</span>
        <div className={`rounded-lg ${c.fill} text-white px-3 py-2`}><span className="text-3xl font-mono font-black">{String(seconds).padStart(2, "0")}</span></div>
      </div>
      {isUrgent && <p className="text-xs font-bold text-red-600 dark:text-red-400">Dépêchez-vous !</p>}
    </div>
  );

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${c.bg} border ${c.border} ${isCritical ? "animate-pulse" : ""}`}>
      {showIcon && (isUrgent ? <Flame className="h-4 w-4 text-red-500" /> : <Clock className="h-4 w-4 text-amber-500" />)}
      <div className="flex-1">
        {label && <p className="text-[10px] text-muted-foreground font-medium">{label}</p>}
        <p className={`font-mono font-bold text-sm ${c.text}`}>{display}</p>
      </div>
      {isUrgent && <Badge variant="destructive" className="text-[10px] animate-pulse">Urgent !</Badge>}
    </div>
  );
}

export function getTargetFromMinutes(minutes: number): Date { return new Date(Date.now() + minutes * 60 * 1000); }
export function getTargetFromPickup(date: string, time: string): Date { return new Date(`${date}T${time}`); }
