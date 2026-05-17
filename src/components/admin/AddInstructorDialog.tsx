"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { getUsersEligibleForInstructor, promoteUserToInstructor } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function AddInstructorDialog() {
  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState("150000");
  const queryClient = useQueryClient();

  const fetchEligible = useServerFn(getUsersEligibleForInstructor);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "instructors", "eligible-users"],
    queryFn: () => fetchEligible(),
    enabled: open,
  });

  const promoteFn = useServerFn(promoteUserToInstructor);
  const promoteMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Pilih pengguna terlebih dahulu.");
      const rate = parseInt(hourlyRate.replace(/\D/g, ""), 10);
      return promoteFn({
        data: {
          userId,
          hourlyRateIdr: Number.isFinite(rate) ? rate : 150_000,
          openToBook: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Instruktur berhasil ditambahkan.");
      setOpen(false);
      setUserId("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "instructors"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const users = data?.users ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="gap-1.5">
          <UserPlus className="size-4" />
          Tambah instruktur
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah instruktur</DialogTitle>
          <DialogDescription>
            Pilih pengguna yang sudah terdaftar untuk dijadikan eligible instruktur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Pengguna</Label>
            <Select value={userId} onValueChange={setUserId} disabled={isLoading || promoteMutation.isPending}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Memuat…" : "Pilih pengguna"} />
              </SelectTrigger>
              <SelectContent>
                {users.map((u: { user_id: string; display_name: string | null; username: string | null; role: string }) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {(u.display_name || u.username || u.user_id.slice(0, 8)) +
                      (u.username ? ` (@${u.username})` : "")}{" "}
                    · {u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && users.length === 0 && (
              <p className="text-xs text-muted-foreground">Semua pengguna sudah menjadi instruktur.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-hourly-rate">Tarif per jam (IDR)</Label>
            <Input
              id="add-hourly-rate"
              type="number"
              min={0}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              disabled={promoteMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={!userId || promoteMutation.isPending}
            onClick={() => promoteMutation.mutate()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
