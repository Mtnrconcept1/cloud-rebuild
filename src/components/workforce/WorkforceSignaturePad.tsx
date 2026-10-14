import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";

type Props = {onChange:(signature:string|null)=>void;disabled?:boolean};

/** Browser-drawn visual acknowledgement; identity is always stored separately server-side. */
export default function WorkforceSignaturePad({onChange,disabled=false}:Props) {
 const ref=useRef<HTMLCanvasElement>(null);
 const drawing=useRef(false);
 const hasStroke=useRef(false);
 const [signed,setSigned]=useState(false);
 const coordinates=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
   const canvas=ref.current!,rect=canvas.getBoundingClientRect();
   return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};
 };
 const start=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
   if(disabled||!ref.current)return;
   const canvas=ref.current,ctx=canvas.getContext("2d");
   if(!ctx)return;
   e.preventDefault();
   canvas.setPointerCapture(e.pointerId);drawing.current=true;
   const {x,y}=coordinates(e);
   ctx.beginPath();ctx.moveTo(x,y);ctx.strokeStyle="#222222";ctx.lineWidth=3;
   ctx.lineCap="round";ctx.lineJoin="round";
 };
 const move=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
   if(!drawing.current||!ref.current)return;
   e.preventDefault();
   const ctx=ref.current.getContext("2d");
   if(!ctx)return;
   const {x,y}=coordinates(e);ctx.lineTo(x,y);ctx.stroke();hasStroke.current=true;
 };
 const finish=()=>{
   drawing.current=false;
   if(!hasStroke.current||!ref.current)return;
   setSigned(true);onChange(ref.current.toDataURL("image/png"));
 };
 const clear=()=>{
   ref.current?.getContext("2d")?.clearRect(0,0,600,160);
   drawing.current=false;hasStroke.current=false;setSigned(false);onChange(null);
 };
 return <div className="space-y-2">
  <div className="overflow-hidden rounded-xl border-2 border-primary/20 bg-white">
   <canvas ref={ref} width={600} height={160} role="img"
    aria-label="Zone de signature manuscrite avec la souris ou le doigt"
    className="block aspect-[15/4] w-full touch-none cursor-crosshair"
    onPointerDown={start} onPointerMove={move} onPointerUp={finish}
    onPointerCancel={finish} onLostPointerCapture={finish}/>
  </div>
  <div className="flex items-center justify-between gap-3">
   <p className="text-xs text-muted-foreground">{signed?"Signature dessinée":"Signez dans la zone ci-dessus avec le doigt ou la souris."}</p>
   <Button type="button" size="sm" variant="outline" onClick={clear} disabled={disabled||!signed}>Effacer</Button>
  </div>
 </div>;
}
