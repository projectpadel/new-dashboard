interface Props { title: string; description: string; }
export function ComingSoon({ title, description }: Props) {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </header>
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Modul ini ada di blueprint dan akan dibangun pada fase selanjutnya.
        </p>
      </div>
    </div>
  );
}
