import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Volume2, VolumeX, Check } from "lucide-react";
import { SOUND_OPTIONS, SoundId, getSoundChoice, playSound, setSoundChoice } from "@/lib/orderSound";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  restaurantId?: string | null;
}

export function SoundPicker({ restaurantId }: Props) {
  const { user } = useAuth();
  const scope = user?.id && restaurantId ? `${user.id}:${restaurantId}` : null;
  const [choice, setChoice] = useState<SoundId>("bell");

  useEffect(() => {
    setChoice(getSoundChoice(scope));
  }, [scope]);

  const select = (id: SoundId) => {
    setChoice(id);
    setSoundChoice(id, scope);
    if (id !== "off") playSound(id);
  };

  const Icon = choice === "off" ? VolumeX : Volume2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Som de novos pedidos">
          <Icon className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Som de novos pedidos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SOUND_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => select(o.id)} className="flex items-center justify-between">
            <span>{o.label}</span>
            {choice === o.id && <Check className="w-4 h-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
