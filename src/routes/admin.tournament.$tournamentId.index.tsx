import * as React from "react";

import { createFileRoute, Link } from "@tanstack/react-router";

import { useServerFn } from "@tanstack/react-start";

import { useQuery } from "@tanstack/react-query";

import { ArrowLeft, Star, Calendar, Swords, Trophy } from "lucide-react";

import {

  getTournamentAdminDetail,

  getTournamentSchedule,

  getTournamentStandings,

} from "@/lib/admin-tournament.functions";

import { TournamentHeroCard } from "@/components/admin/tournament/TournamentHeroCard";

import { SuperadminActionsBar } from "@/components/admin/tournament/SuperadminActionsBar";

import {

  TournamentBracketDialog,

  TournamentTabPlaceholder,

} from "@/components/admin/tournament/TournamentBracketDialog";

import { TournamentInfoTab } from "@/components/admin/tournament/TournamentInfoTab";

import { TournamentScheduleTab } from "@/components/admin/tournament/TournamentScheduleTab";

import { TournamentBracketTab } from "@/components/admin/tournament/TournamentBracketTab";

import { TournamentStandingsTab } from "@/components/admin/tournament/TournamentStandingsTab";

import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";



const detailSearchSchema = {

  tab: (v: unknown) => {

    const s = typeof v === "string" ? v : "";

    return ["info", "jadwal", "bracket", "klasemen"].includes(s) ? s : "info";

  },

};



export const Route = createFileRoute("/admin/tournament/$tournamentId/")({

  validateSearch: (search: Record<string, unknown>) => ({

    tab: detailSearchSchema.tab(search.tab),

  }),

  component: TournamentDetailPage,

});



function TournamentDetailPage() {

  const { tournamentId } = Route.useParams();

  const { tab: tabFromSearch } = Route.useSearch();

  const navigate = Route.useNavigate();

  const [activeTab, setActiveTab] = React.useState(tabFromSearch);

  const [scheduleDialogOpen, setScheduleDialogOpen] = React.useState(false);

  const [bracketDialogOpen, setBracketDialogOpen] = React.useState(false);



  React.useEffect(() => {

    setActiveTab(tabFromSearch);

  }, [tabFromSearch]);



  const fetchDetail = useServerFn(getTournamentAdminDetail);

  const fetchSchedule = useServerFn(getTournamentSchedule);

  const fetchStandings = useServerFn(getTournamentStandings);



  const detailQuery = useQuery({

    queryKey: ["admin", "tournament", tournamentId],

    queryFn: () => fetchDetail({ data: { tournamentId } }),

  });



  const scheduleQuery = useQuery({

    queryKey: ["admin", "tournament", tournamentId, "schedule"],

    queryFn: () => fetchSchedule({ data: { tournamentId } }),

    enabled: !!detailQuery.data?.tournament,

  });



  const standingsQuery = useQuery({

    queryKey: ["admin", "tournament", tournamentId, "standings"],

    queryFn: () => fetchStandings({ data: { tournamentId } }),

    enabled: detailQuery.data?.stats?.hasBracket ?? false,

  });



  const t = detailQuery.data?.tournament;

  const stats = detailQuery.data?.stats;

  const matches = scheduleQuery.data?.matches ?? [];

  const hasSchedule = matches.some((m) => m.scheduled_at);

  const showScheduleTab = stats?.bracketFinalized && matches.length > 0;

  const hasBracket = stats?.hasBracket ?? false;

  const standingsRaw = standingsQuery.data?.standings ?? [];

  const standings = standingsRaw.map((row: Record<string, unknown>, i: number) => ({

    teamId: String(row.teamId ?? row.team_id ?? i),

    name: String(row.name ?? row.team_name ?? "—"),

    status: row.status != null ? String(row.status) : undefined,

    wins: Number(row.wins ?? row.w ?? 0),

    losses: Number(row.losses ?? row.l ?? row.k ?? 0),

    points: Number(row.points ?? row.poin ?? row.point ?? row.score_points ?? 0),

    approvalOrder: Number(row.approvalOrder ?? i),

  }));



  const openBracketDialog = () => setBracketDialogOpen(true);



  const bracketPlaceholder =

    stats &&

    (

      <TournamentTabPlaceholder

        icon={<Swords className="h-10 w-10 text-muted-foreground/50" />}

        title="Silahkan buat bracket terlebih dahulu"

        description="Setelah tim disetujui dan jumlahnya kelipatan 2 (2, 4, 8, 16, …), generate bracket untuk mengisi tab Bracket, Jadwal, dan Klasemen."

        actionLabel="Generate Bracket"

        onAction={openBracketDialog}

        actionDisabled={!stats.canGenerateBracket}

        hint={stats.canGenerateBracket ? null : stats.bracketBlockReason}

      />

    );



  return (

    <div className="p-6 lg:p-8 space-y-6 max-w-[900px] mx-auto">

      <div className="flex items-center gap-3">

        <Button variant="ghost" size="sm" asChild>

          <Link to="/admin/tournament">

            <ArrowLeft className="h-4 w-4 mr-1" />

            Semua Tournament

          </Link>

        </Button>

      </div>



      {detailQuery.error && (

        <p className="text-sm text-destructive">{(detailQuery.error as Error).message}</p>

      )}

      {detailQuery.isLoading && <p className="text-muted-foreground">Memuat…</p>}



      {t && stats && (

        <>

          <SuperadminActionsBar

            tournamentId={tournamentId}

            tournamentStatus={t.status}

            stats={{

              bracketFinalized: stats.bracketFinalized,

              hasSchedule,

            }}

            scheduleDialogOpen={scheduleDialogOpen}

            onScheduleDialogOpenChange={setScheduleDialogOpen}

          />



          <TournamentBracketDialog

            tournamentId={tournamentId}

            stats={{

              hasBracket: stats.hasBracket,

              bracketFinalized: stats.bracketFinalized,

              canGenerateBracket: stats.canGenerateBracket,

              bracketBlockReason: stats.bracketBlockReason,

            }}

            open={bracketDialogOpen}

            onOpenChange={setBracketDialogOpen}

            onBracketApproved={() => {

              setActiveTab("jadwal");

              void navigate({

                search: { tab: "jadwal" },

                replace: true,

              });

            }}

            onScheduleDialogOpen={() => setScheduleDialogOpen(true)}

          />



          <TournamentHeroCard tournament={t} approvedTeamCount={stats.teamApproved} />



          <Tabs

            value={activeTab}

            onValueChange={(v) => {

              setActiveTab(v);

              void navigate({ search: { tab: v as typeof tabFromSearch }, replace: true });

            }}

            className="w-full"

          >

            <TabsList className="grid w-full grid-cols-4 h-auto p-1">

              <TabsTrigger value="info" className="gap-1 text-xs sm:text-sm">

                <Star className="h-3.5 w-3.5" />

                Info

              </TabsTrigger>

              <TabsTrigger value="jadwal" className="gap-1 text-xs sm:text-sm">

                <Calendar className="h-3.5 w-3.5" />

                Jadwal

              </TabsTrigger>

              <TabsTrigger value="bracket" className="gap-1 text-xs sm:text-sm">

                <Swords className="h-3.5 w-3.5" />

                Bracket

              </TabsTrigger>

              <TabsTrigger value="klasemen" className="gap-1 text-xs sm:text-sm">

                <Trophy className="h-3.5 w-3.5" />

                Klasemen

              </TabsTrigger>

            </TabsList>



            <TabsContent value="info" className="mt-6">

              <TournamentInfoTab

                tournament={t as Parameters<typeof TournamentInfoTab>[0]["tournament"]}

                tournamentId={tournamentId}

                teamSlots={t.team_slots}

                approvedTeamCount={stats.teamApproved}

              />

            </TabsContent>



            <TabsContent value="jadwal" className="mt-6">

              {!hasBracket ? (

                bracketPlaceholder

              ) : showScheduleTab ? (

                <TournamentScheduleTab tournamentId={tournamentId} matches={matches} />

              ) : stats.bracketFinalized ? (

                <TournamentTabPlaceholder

                  icon={<Calendar className="h-10 w-10 text-muted-foreground/50" />}

                  title="Generate jadwal pertandingan"

                  description="Bracket sudah disetujui. Buat jadwal otomatis untuk mengisi tab ini."

                  actionLabel="Generate Jadwal"

                  onAction={() => setScheduleDialogOpen(true)}

                />

              ) : (

                <TournamentTabPlaceholder

                  icon={<Calendar className="h-10 w-10 text-muted-foreground/50" />}

                  title="Setujui bracket terlebih dahulu"

                  description="Jadwal pertandingan tersedia setelah bracket disetujui dan dikunci."

                  actionLabel="Kelola Bracket"

                  onAction={openBracketDialog}

                />

              )}

            </TabsContent>



            <TabsContent value="bracket" className="mt-6">

              {!hasBracket ? (

                bracketPlaceholder

              ) : (

                <div className="space-y-4">

                  {!stats.bracketFinalized && (

                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">

                      <p className="text-sm text-amber-900 dark:text-amber-100 flex-1">

                        Bracket belum disetujui. Atur posisi tim lalu setujui untuk melanjutkan ke

                        jadwal.

                      </p>

                      <Button type="button" size="sm" variant="outline" onClick={openBracketDialog}>

                        Kelola Bracket

                      </Button>

                    </div>

                  )}

                  <TournamentBracketTab tournamentId={tournamentId} matches={matches} />

                </div>

              )}

            </TabsContent>



            <TabsContent value="klasemen" className="mt-6">

              {!hasBracket ? (

                bracketPlaceholder

              ) : standingsQuery.isLoading ? (

                <p className="text-sm text-muted-foreground text-center py-8">Memuat klasemen…</p>

              ) : standingsQuery.error ? (

                <p className="text-sm text-destructive text-center py-8">

                  {(standingsQuery.error as Error).message}

                </p>

              ) : standings.length > 0 ? (

                <TournamentStandingsTab standings={standings} />

              ) : (

                <p className="text-sm text-muted-foreground text-center py-8">

                  Klasemen akan terisi setelah pertandingan bracket dimainkan dan hasil dicatat.

                </p>

              )}

            </TabsContent>

          </Tabs>

        </>

      )}

    </div>

  );

}


