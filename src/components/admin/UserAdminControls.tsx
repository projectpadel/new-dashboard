"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  promoteUserToInstructor,
  revokeInstructorEligibility,
  updateProfileRole,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
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

const ROLES = ["user", "admin", "superadmin"] as const;

type Props = {
  userId: string;
  currentRole: string;
  isInstructor: boolean;
};

export function UserAdminControls({ userId, currentRole, isInstructor }: Props) {
  const queryClient = useQueryClient();
  const [role, setRole] = React.useState(currentRole);
  const [hourlyRate, setHourlyRate] = React.useState("150000");

  React.useEffect(() => {
    setRole(currentRole);
  }, [currentRole]);

  const updateRoleFn = useServerFn(updateProfileRole);
  const promoteFn = useServerFn(promoteUserToInstructor);
  const revokeFn = useServerFn(revokeInstructorEligibility);

  const roleMutation = useMutation({
    mutationFn: () =>
      updateRoleFn({
        data: { userId, role: role as (typeof ROLES)[number] },
      }),
    onSuccess: () => {
      toast.success("Role pengguna diperbarui.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promoteMutation = useMutation({
    mutationFn: () => {
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
      toast.success("Pengguna sekarang eligible sebagai coach.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coaches"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "instructors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Status coach dicabut.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coaches"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "instructors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = roleMutation.isPending || promoteMutation.isPending || revokeMutation.isPending;

  return (
    <section className="rounded-xl border border-primary/20 bg-card p-5 shadow-sm space-y-5">
      <div>
        <h2 className="font-semibold text-foreground">Kelola pengguna (Superadmin)</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Ubah role atau jadikan / cabut eligibility coach.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <Select value={role} onValueChange={setRole} disabled={busy}>
            <SelectTrigger id="user-role" className="w-full sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={busy || role === currentRole}
          onClick={() => roleMutation.mutate()}
        >
          Simpan role
        </Button>
      </div>

      <div className="border-t pt-4 space-y-3">
        <Label>Status coach</Label>
        {isInstructor ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">Pengguna sudah terdaftar sebagai coach.</p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Cabut eligibility coach untuk pengguna ini?")) {
                  revokeMutation.mutate();
                }
              }}
            >
              Cabut eligibility coach
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-2 flex-1 sm:max-w-xs">
              <Label htmlFor="hourly-rate">Tarif per jam (IDR)</Label>
              <Input
                id="hourly-rate"
                type="number"
                min={0}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button type="button" disabled={busy} onClick={() => promoteMutation.mutate()}>
              Jadikan coach
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
