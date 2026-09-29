import AuthForm from "@/components/AuthForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { created } = await searchParams;
  return <AuthForm mode="login" justCreated={created === "1"} />;
}
