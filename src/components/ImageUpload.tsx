import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps { value: string; onChange: (url: string) => void; label?: string; bucket?: string; className?: string; }


export default function ImageUpload({ value, onChange, label = "Image", bucket = "images", className = "" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) throw new Error("Vous devez sélectionner une image.");
      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      onChange(data.publicUrl);
      toast({ title: "Succès", description: "Image uploadée avec succès !" });
    } catch (error: any) { toast({ title: "Erreur d'upload", description: error.message, variant: "destructive" }); } finally { setUploading(false); }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <Label>{label}</Label>
      <div className="flex flex-col gap-4">
        {value ? (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border bg-muted">
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
            <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={() => onChange("")}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full aspect-video border-2 border-dashed rounded-lg bg-muted/50 transition-colors hover:bg-muted">
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <><Upload className="h-8 w-8 text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground font-medium">Cliquez pour uploader</p><p className="text-xs text-muted-foreground mt-1">PNG, JPG ou GIF</p></>}
              </div>
              <Input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
        <Input placeholder="Ou collez l'URL d'une image ici..." value={value} onChange={(e) => onChange(e.target.value)} disabled={uploading} />
      </div>
    </div>
  );
}
