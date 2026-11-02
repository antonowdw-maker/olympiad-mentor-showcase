import { loginAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; from?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const hasError = sp.error === "1";

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
        <p className="text-sm text-[var(--muted)]">
          Аккаунт создаётся сидом (открытой регистрации нет).
        </p>
      </div>

      <form action={loginAction} className="space-y-4 rounded-xl border border-[var(--line)] bg-white/80 p-5">
        {hasError ? (
          <p className="rounded-lg bg-[var(--warn-soft,rgba(180,80,40,0.08))] px-3 py-2 text-sm text-[var(--warn)]">
            Неверный логин или пароль.
          </p>
        ) : null}

        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Логин</span>
          <input
            name="login"
            required
            autoComplete="username"
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">Пароль</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
          />
        </label>

        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
