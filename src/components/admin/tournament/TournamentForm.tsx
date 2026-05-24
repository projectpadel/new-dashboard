"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { saveTournamentDraft, uploadTournamentPoster } from "@/lib/admin-tournament.functions";
import {
  APP_RANK_OPTIONS,
  normalizeRankClass,
  TEAM_SLOT_OPTIONS,
  type AppRank,
} from "@/lib/tournament-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type TournamentFormValues = {
  name: string;
  description: string;
  rankClass: AppRank;
  registrationDeadline: string;
  startsAt: string;
  endsAt: string;
  teamSlots: number;
  entryFee: number;
  posterUrl: string;
  posterStoragePath: string | null;
  prizePoolIdr: number | null;
  prizePct1st: number | null;
  prizePct2nd: number | null;
  prizePct3rd: number | null;
  prizePctMvp: number | null;
};

type Props = {
  tournamentId?: string;
  initial?: Partial<TournamentFormValues>;
};

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  if (!local) throw new Error("Tanggal wajib diisi.");
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) throw new Error("Format tanggal tidak valid.");
  return d.toISOString();
}

function formatSaveError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("invalid_enum_value") && msg.includes("rankClass")) {
      return "Kelas rank tidak valid. Pilih Beginner, Bronze, Silver, Gold, atau Platinum dari daftar.";
    }
    if (msg.includes("invalid input value for enum app_rank")) {
      return "Kelas rank tidak valid untuk database. Pilih ulang dari dropdown.";
    }
    if (msg.includes("rankClass")) {
      return "Kelas rank tidak valid. Silakan pilih ulang dari dropdown.";
    }
    try {
      const parsed = JSON.parse(msg) as { message?: string }[];
      if (Array.isArray(parsed) && parsed[0]?.message) {
        return parsed[0].message;
      }
    } catch {
      /* not JSON */
    }
    return msg;
  }
  return "Gagal menyimpan draft.";
}

const defaultValues: TournamentFormValues = {
  name: "",
  description: "",
  rankClass: "beginner",
  registrationDeadline: "",
  startsAt: "",
  endsAt: "",
  teamSlots: 8,
  entryFee: 0,
  posterUrl: "",
  posterStoragePath: null,
  prizePoolIdr: null,
  prizePct1st: null,
  prizePct2nd: null,
  prizePct3rd: null,
  prizePctMvp: null,
};

export function TournamentForm({ tournamentId, initial }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<TournamentFormValues>(() => ({
    ...defaultValues,
    ...initial,
    rankClass: normalizeRankClass(
      (initial?.rankClass as string | undefined) ??
        (initial as { rank_class?: string } | undefined)?.rank_class,
    ),
    registrationDeadline: toLocalInput(initial?.registrationDeadline as string | undefined),
    startsAt: toLocalInput(initial?.startsAt as string | undefined),
    endsAt: toLocalInput(initial?.endsAt as string | undefined),
  }));
  const [posterFile, setPosterFile] = React.useState<File | null>(null);

  const saveFn = useServerFn(saveTournamentDraft);
  const uploadFn = useServerFn(uploadTournamentPoster);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let posterUrl = form.posterUrl;
      let posterStoragePath = form.posterStoragePath;

      if (posterFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1] ?? "");
          };
          reader.onerror = reject;
          reader.readAsDataURL(posterFile);
        });
        const uploaded = await uploadFn({
          data: {
            tournamentId,
            fileName: posterFile.name,
            fileBase64: base64,
            contentType: posterFile.type || "image/jpeg",
          },
        });
        posterUrl = uploaded.posterUrl;
        posterStoragePath = uploaded.posterStoragePath;
      }

      return saveFn({
        data: {
          tournamentId,
          payload: {
            name: form.name.trim(),
            description: form.description,
            rankClass: normalizeRankClass(form.rankClass),
            registrationDeadline: localToIso(form.registrationDeadline),
            startsAt: localToIso(form.startsAt),
            endsAt: localToIso(form.endsAt),
            teamSlots: form.teamSlots,
            entryFee: form.entryFee,
            posterUrl,
            posterStoragePath,
            prizePoolIdr: form.prizePoolIdr,
            prizePct1st: form.prizePct1st,
            prizePct2nd: form.prizePct2nd,
            prizePct3rd: form.prizePct3rd,
            prizePctMvp: form.prizePctMvp,
          },
        },
      });
    },
    onSuccess: (res) => {
      toast.success(tournamentId ? "Turnamen diperbarui." : "Draft turnamen disimpan.");
      void navigate({
        to: "/admin/tournament/$tournamentId",
        params: { tournamentId: res.id },
      });
    },
    onError: (e) => toast.error(formatSaveError(e)),
  });

  const set = <K extends keyof TournamentFormValues>(key: K, value: TournamentFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <form
      className="space-y-6 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      <div className="space-y-2">
        <Label>Poster Tournament</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
        />
        {form.posterUrl && !posterFile && (
          <img src={form.posterUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        )}
      </div>

      <div className="space-y-2">
        <Label>Nama Tournament</Label>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Contoh: Clubz Championship 2026"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Kelas Rank</Label>
        <Select
          value={normalizeRankClass(form.rankClass)}
          onValueChange={(v) => set("rankClass", normalizeRankClass(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_RANK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Deskripsi Tournament</Label>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} />
      </div>

      <div className="space-y-2">
        <Label>Deadline Pendaftaran</Label>
        <Input
          type="datetime-local"
          value={form.registrationDeadline}
          onChange={(e) => set("registrationDeadline", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tanggal Mulai</Label>
          <Input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Tanggal Berakhir</Label>
          <Input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Jumlah Slot Team</Label>
          <Select
            value={String(form.teamSlots)}
            onValueChange={(v) => set("teamSlots", parseInt(v, 10))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_SLOT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Biaya masuk (Rp)</Label>
          <Input
            type="number"
            min={0}
            value={form.entryFee}
            onChange={(e) => set("entryFee", parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Total hadiah / prize pool (Rp)</Label>
        <Input
          type="number"
          min={0}
          placeholder="Opsional — kosongkan jika belum diatur"
          value={form.prizePoolIdr ?? ""}
          onChange={(e) =>
            set("prizePoolIdr", e.target.value === "" ? null : parseInt(e.target.value, 10))
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Pembagian hadiah (%)</Label>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["prizePct1st", "1ST"],
              ["prizePct2nd", "2ND"],
              ["prizePct3rd", "3RD"],
              ["prizePctMvp", "MVP"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="—"
                  className="pr-8"
                  value={form[key] ?? ""}
                  onChange={(e) =>
                    set(key, e.target.value === "" ? null : parseInt(e.target.value, 10))
                  }
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  %
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Kosongkan jika persentase belum ditentukan.</p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Menyimpan…" : "Simpan Draft"}
        </Button>
      </div>
    </form>
  );
}
