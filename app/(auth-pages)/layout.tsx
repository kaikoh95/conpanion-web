export default async function Layout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full items-center justify-center p-4">{children}</div>;
}
